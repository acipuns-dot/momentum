import express, { type Request, type Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import PocketBase from 'pocketbase';

// Load env vars
dotenv.config(); // Load from .env if present in current dir
// Also attempt to load from frontend for local development compatibility
dotenv.config({ path: '../frontend/.env.local' });

const app = express();
const PORT = process.env.PORT || 8080;
const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_ORIGIN || 'http://localhost:3000,https://*.vercel.app')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isOriginAllowed = (origin: string) => {
    return allowedOrigins.some((allowed) => {
        // Wildcard support: https://*.vercel.app
        if (allowed.includes('*')) {
            const [scheme, hostPattern] = allowed.split('://');
            if (!scheme || !hostPattern) return false;
            const prefix = hostPattern.replace('*.', '');
            return origin.startsWith(`${scheme}://`) && origin.endsWith(`.${prefix}`);
        }
        return origin === allowed;
    });
};

// Log startup config (masking keys)
console.log('--- Startup Config ---');
console.log(`Port: ${PORT}`);
console.log(`PB URL: ${process.env.NEXT_PUBLIC_POCKETBASE_URL}`);
console.log(`Anthropic Key set: ${!!process.env.ANTHROPIC_API_KEY}`);
console.log(`ExerciseDB Key set: ${!!process.env.EXERCIEDB_API_KEY}`);
console.log(`Allowed Origins: ${allowedOrigins.join(', ')}`);
console.log('--- end ---');

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || isOriginAllowed(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));
app.use(express.json());

// --- Database Helper ---
const getAdminPB = async () => {
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(
        process.env.PB_ADMIN_EMAIL!,
        process.env.PB_ADMIN_PASSWORD!
    );
    return pb;
};

const getBearerToken = (req: Request): string | null => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return auth.slice(7).trim() || null;
};

const getRequester = async (req: Request) => {
    const token = getBearerToken(req);
    if (!token) return null;

    const pb = new PocketBase(PB_URL);
    pb.authStore.save(token, null);

    try {
        await pb.collection('users').authRefresh();
        return pb.authStore.model;
    } catch {
        return null;
    }
};

const hasActivePremium = (userRecord: any): boolean => {
    if (!userRecord?.is_premium) return false;
    if (!userRecord?.premium_until) return false;
    const expiryMs = new Date(userRecord.premium_until).getTime();
    if (Number.isNaN(expiryMs)) return false;
    return expiryMs > Date.now();
};

const ONBOARDING_EQUIPMENT_MAP: Record<string, string> = {
    none: 'none',
    gym: 'gym',
    jump_rope: 'jump_rope',
    dumbbells: 'dumbbell',
    dumbbell: 'dumbbell',
    resistance_bands: 'band',
    band: 'band',
    pull_up_bar: 'pull_up_bar',
    kettlebell: 'kettlebell',
    treadmill: 'treadmill',
    threadmill: 'treadmill',
};

const RAW_EQUIPMENT_MAP: Record<string, string[]> = {
    'body weight': ['none'],
    bodyweight: ['none'],
    'weighted': ['weighted'],
    dumbbell: ['dumbbell'],
    'dumbbell (used as handles for deeper range)': ['dumbbell'],
    'dumbbell, exercise ball': ['dumbbell', 'exercise_ball'],
    barbell: ['barbell'],
    'ez barbell': ['ez_barbell'],
    'ez barbell, exercise ball': ['ez_barbell', 'exercise_ball'],
    'olympic barbell': ['barbell'],
    'trap bar': ['trap_bar'],
    cable: ['cable'],
    'leverage machine': ['machine'],
    'smith machine': ['smith_machine'],
    'sled machine': ['sled'],
    kettlebell: ['kettlebell'],
    band: ['band'],
    'resistance band': ['band'],
    'body weight (with resistance band)': ['band'],
    rope: ['jump_rope'],
    'jump rope': ['jump_rope'],
    'stability ball': ['stability_ball'],
    'exercise ball': ['exercise_ball'],
    'medicine ball': ['medicine_ball'],
    'bosu ball': ['bosu_ball'],
    assisted: ['assisted'],
    'assisted (towel)': ['assisted'],
    roller: ['roller'],
    'wheel roller': ['ab_wheel'],
    hammer: ['hammer'],
    'stationary bike': ['stationary_bike'],
    'upper body ergometer': ['ergometer'],
    'elliptical machine': ['elliptical'],
    'stepmill machine': ['stepmill'],
};

const slugEquipment = (value: string): string => value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '');

const unique = (items: string[]): string[] => Array.from(new Set(items.filter(Boolean)));

const normalizeExerciseEquipment = (rawValue: unknown): string[] => {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return ['none'];
    const raw = rawValue.toLowerCase().trim();

    if (RAW_EQUIPMENT_MAP[raw]) {
        return unique(RAW_EQUIPMENT_MAP[raw]);
    }

    const parts = raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    const mapped = parts.flatMap((part) => {
        if (RAW_EQUIPMENT_MAP[part]) return RAW_EQUIPMENT_MAP[part];
        if (part.includes('body weight')) return ['none'];
        if (part.includes('resistance band')) return ['band'];
        if (part.includes('jump rope')) return ['jump_rope'];
        if (part.includes('treadmill') || part.includes('threadmill')) return ['treadmill'];
        return [slugEquipment(part)];
    });

    const result = unique(mapped);
    return result.length ? result : ['none'];
};

const primaryEquipmentType = (equipmentList: string[]): string => {
    const first = equipmentList[0] || 'none';
    if (!equipmentList.length) return 'none';
    if (equipmentList.length === 1) return first;
    return equipmentList.find((eq) => eq !== 'none') || first;
};

const normalizeUserEquipment = (rawList: unknown, options: { defaultNone?: boolean } = {}): string[] => {
    const defaultNone = options.defaultNone ?? true;
    if (!Array.isArray(rawList)) return defaultNone ? ['none'] : [];
    const normalized = rawList
        .map((entry) => typeof entry === 'string' ? entry.toLowerCase().trim() : '')
        .filter(Boolean)
        .flatMap((entry) => {
            if (ONBOARDING_EQUIPMENT_MAP[entry]) return [ONBOARDING_EQUIPMENT_MAP[entry]];
            if (RAW_EQUIPMENT_MAP[entry]) return RAW_EQUIPMENT_MAP[entry];
            return [slugEquipment(entry)];
        });
    const deduped = unique(normalized);
    return deduped.length ? deduped : (defaultNone ? ['none'] : []);
};

const isExerciseObject = (data: unknown): data is Record<string, any> =>
    !!data && typeof data === 'object' && !Array.isArray(data) && typeof (data as any).name === 'string';

// --- Schemas ---
const GeneratePlanRequestSchema = z.object({
    userId: z.string().min(1).optional(),
    currentWeight: z.number().positive(),
    goalWeight: z.number().positive(),
    equipment: z.array(z.string()).optional(),
    weekOffset: z.number().int().min(0).max(12).optional(),
    refreshRequested: z.boolean().optional(),
});

const TogglePremiumRequestSchema = z.object({
    targetUserId: z.string().min(1),
    newPremiumStatus: z.boolean(),
});

const PlanSchema = z.object({
    estimatedWeeks: z.number(),
    focus: z.enum(['fat_loss', 'cardio_endurance', 'active_recovery']),
    targetKcal: z.number(),
    targetProtein: z.number(),
    targetCarbs: z.number(),
    targetFat: z.number(),
    days: z.array(z.object({
        dayIndex: z.number(),
        type: z.enum(['workout', 'rest']),
        focusArea: z.string().optional(),
        exercises: z.array(z.object({
            name: z.string(),
            durationOrReps: z.string(),
            sets: z.number().optional()
        })).optional(),
        nutritionTip: z.string()
    }))
});

// --- API Routes ---

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Momentum API is running!' });
});

app.post('/generate-plan', async (req: Request, res: Response): Promise<any> => {
    try {
        const requester = await getRequester(req);
        if (!requester) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const parsedReq = GeneratePlanRequestSchema.safeParse(req.body);
        if (!parsedReq.success) {
            return res.status(400).json({ error: 'Invalid request payload', details: parsedReq.error.flatten() });
        }

        const { currentWeight, goalWeight, equipment, weekOffset = 0, refreshRequested = false } = parsedReq.data;
        const userId = parsedReq.data.userId || requester.id;

        if (userId !== requester.id) {
            return res.status(403).json({ error: 'Forbidden. Cannot generate a plan for another user.' });
        }

        const pb = await getAdminPB();

        let isPremium = false;
        try {
            const userRecord = await pb.collection('users').getOne(userId);
            isPremium = hasActivePremium(userRecord);

            // Auto-expire stale premium flags
            if (!isPremium && userRecord.is_premium) {
                await pb.collection('users').update(userId, {
                    is_premium: false,
                    premium_until: '',
                });
            }
        } catch (e) {
            console.warn(`User ${userId} not found in users collection yet. Defaulting to free tier.`);
        }

        if (!isPremium && weekOffset > 0) {
            return res.status(403).json({ error: 'Premium is required to generate multi-week plans.' });
        }

        // Premium users can refresh the base weekly plan up to 10 times per rolling 30-day window.
        if (isPremium && weekOffset === 0 && refreshRequested) {
            const windowStart = new Date();
            windowStart.setDate(windowStart.getDate() - 30);
            const now = new Date();
            const nearFuture = new Date(now);
            nearFuture.setDate(nearFuture.getDate() + 1);

            const premiumBaseRefreshes = await pb.collection('weekly_plans_db').getList(1, 1, {
                filter: `user = "${userId}" && created >= "${windowStart.toISOString()}" && start_date >= "${windowStart.toISOString()}" && start_date <= "${nearFuture.toISOString()}"`,
                sort: '-created',
            });

            if (premiumBaseRefreshes.totalItems >= 10) {
                return res.status(429).json({
                    error: 'Premium cap reached: 10 refreshes per 30 days.',
                });
            }
        }

        // Free users can refresh the base weekly plan up to 2 times per rolling 30-day window.
        if (!isPremium && weekOffset === 0 && refreshRequested) {
            const windowStart = new Date();
            windowStart.setDate(windowStart.getDate() - 30);
            const nowIso = new Date().toISOString();

            const recentBasePlans = await pb.collection('weekly_plans_db').getList(1, 2, {
                filter: `user = "${userId}" && start_date >= "${windowStart.toISOString()}" && start_date <= "${nowIso}"`,
                sort: '-start_date',
            });

            if (recentBasePlans.totalItems >= 2) {
                return res.status(429).json({
                    error: 'Free users can refresh up to 2 times every 30 days. Upgrade to premium for more.',
                });
            }
        }

        // Premium 4-week generations are capped to 2 full runs per 30 days.
        // A full run creates 3 "future week" plans (weekOffset 1..3), so cap at 6 future-week plans.
        if (isPremium && weekOffset > 0) {
            const windowStart = new Date();
            windowStart.setDate(windowStart.getDate() - 30);
            const futureWeekThreshold = new Date();
            futureWeekThreshold.setDate(futureWeekThreshold.getDate() + 6);

            const premiumFuturePlans = await pb.collection('weekly_plans_db').getList(1, 1, {
                filter: `user = "${userId}" && created >= "${windowStart.toISOString()}" && start_date >= "${futureWeekThreshold.toISOString()}"`,
                sort: '-created',
            });

            if (premiumFuturePlans.totalItems >= 6) {
                return res.status(429).json({
                    error: 'Premium cap reached: 2 full 4-week generations per 30 days.',
                });
            }
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        let recentLogs: Record<string, unknown>[] = [];
        try {
            recentLogs = await pb.collection('activity_logs_db').getFullList({
                filter: `user = "${userId}" && date >= "${sevenDaysAgo.toISOString()}"`,
                sort: '-created'
            });
        } catch (e) {
            console.log("No activity logs found, starting fresh.");
        }

        const planStartDate = new Date();
        planStartDate.setDate(planStartDate.getDate() + (weekOffset * 7));

        let profileEquipment: string[] = [];
        try {
            const profileRecords = await pb.collection('profiles_db').getList(1, 1, {
                filter: `user = "${userId}"`,
                fields: 'equipment_available',
            });
            const profile = profileRecords.items[0] as any;
            if (Array.isArray(profile?.equipment_available)) {
                profileEquipment = profile.equipment_available;
            }
        } catch {
            profileEquipment = [];
        }

        const requestedEquipment = normalizeUserEquipment(equipment || [], { defaultNone: false });
        const savedEquipment = normalizeUserEquipment(profileEquipment);
        const effectiveEquipment = requestedEquipment.length ? requestedEquipment : savedEquipment;

        let equipmentDescription = '';
        if (effectiveEquipment.includes('gym')) {
            equipmentDescription = 'The user has access to a full commercial gym. You can use any standard gym equipment.';
        } else if (effectiveEquipment.length === 1 && effectiveEquipment[0] === 'none') {
            equipmentDescription = 'The user has NO equipment. Prescribe bodyweight/no-equipment exercises only.';
        } else {
            equipmentDescription = `The user has access to: ${effectiveEquipment.join(', ')}. Only prescribe exercises that match this equipment set (plus none/bodyweight).`;
        }

        const allowedEquipment = effectiveEquipment.includes('gym')
            ? null
            : new Set([
                ...effectiveEquipment,
                ...(effectiveEquipment.includes('none') ? [] : ['none']),
            ]);

        // 1. Fetch equipment-scoped exercise pool and include metadata for better planning quality.
        let validExercises: string[] = [];
        let validExerciseCatalog: string[] = [];
        try {
            const cacheRecords = await pb.collection('exercise_cache_db').getFullList({
                fields: 'name,data',
            });
            const filtered = cacheRecords
                .map((record: any) => record?.data)
                .filter(isExerciseObject)
                .filter((exercise) => {
                    if (!allowedEquipment) return true;
                    const equipmentTokens = normalizeExerciseEquipment(exercise.equipment);
                    return equipmentTokens.some((token) => allowedEquipment.has(token));
                });

            validExercises = unique(
                filtered
                    .map((exercise) => String(exercise.name || '').trim())
                    .filter(Boolean),
            ).slice(0, 600);

            validExerciseCatalog = filtered
                .slice(0, 600)
                .map((exercise: any) => {
                    const name = String(exercise.name || '').trim();
                    const movement = String(exercise.movement_pattern || 'general');
                    const intensity = String(exercise.intensity_level || 'moderate');
                    const impact = String(exercise.impact_level || 'low_impact');
                    const goal = String(exercise.training_goal || 'strength');
                    const unilateral = exercise.is_unilateral ? 'unilateral' : 'bilateral';
                    const category = String(exercise.category || 'strength');
                    const equipmentType = String(exercise.equipment_type || primaryEquipmentType(normalizeExerciseEquipment(exercise.equipment)));
                    if (!name) return '';
                    return `${name} | equipment:${equipmentType} | category:${category} | movement:${movement} | intensity:${intensity} | impact:${impact} | side:${unilateral} | goal:${goal}`;
                })
                .filter(Boolean);
        } catch (e) {
            console.error('Failed to fetch equipment-scoped exercise whitelist from cache', e);
        }

        const validExercisesListStr = validExercises.length > 0
            ? validExercises.join(', ')
            : 'Generic exercises (e.g., push-up, squat, jump rope)';
        const validExerciseCatalogStr = validExerciseCatalog.length > 0
            ? validExerciseCatalog.join('\n')
            : 'No metadata catalog available';

        const aiPrompt = `You are an elite AI fitness coach.
Generate a highly personalized ${weekOffset > 0 ? `Week ${weekOffset + 1}` : '7-day'} workout and nutrition plan for a user.
User Profile:
- Current Weight: ${currentWeight} kg
- Goal Weight: ${goalWeight} kg
- Available Equipment: ${effectiveEquipment.join(', ')}
- Phase: Week ${weekOffset + 1}
CRITICAL CONSTRAINTS:
1. NUTRITION: Calculate a safe, progressive daily calorie deficit target.
2. EQUIPMENT: ${equipmentDescription}
3. EXERCISE DICTIONARY SELECTION: You MUST ONLY select and prescribe exercises that exist in the following verified list. Do NOT invent exercises, use variations, or prescribe anything not on this comma-separated list:
[ ${validExercisesListStr} ]
4. METADATA-AWARE PROGRAMMING: Use the exercise metadata catalog below to balance movement patterns and intensity across the week.
- Rotate movement patterns (e.g., squat/push/pull/lunge/core/cardio) and avoid repeating the same primary pattern on consecutive workout days.
- Mix intensity and impact intelligently (high days followed by moderate/low days).
- Prefer bilateral + unilateral variety.
- Keep choices aligned with the user's equipment.
EXERCISE METADATA CATALOG (name | equipment | category | movement | intensity | impact | side | goal):
${validExerciseCatalogStr}
5. SCHEDULE: Generate exactly 7 days.
Based on this, generate the optimal 7-day weight loss plan.`;

        if (!process.env.ANTHROPIC_API_KEY) {
            return res.status(500).json({ error: 'ANTHROPIC_API_KEY is missing on the server. Please check your Railway environment variables.' });
        }

        const anthropicProvider = createAnthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });

        const { object: plan } = await generateObject({
            model: anthropicProvider('claude-haiku-4-5'),
            schema: PlanSchema,
            prompt: aiPrompt,
        });

        try {
            // Ensure end_date is exactly 7 days after start_date
            const calculatedEndDate = new Date(planStartDate.getTime());
            calculatedEndDate.setDate(calculatedEndDate.getDate() + 7);

            await pb.collection('weekly_plans_db').create({
                user: userId,
                start_date: planStartDate.toISOString(),
                end_date: calculatedEndDate.toISOString(),
                plan_data: plan
            });
        } catch (e) {
            console.error("Failed to save plan to DB", e);
        }

        return res.json(plan);

    } catch (error: any) {
        console.error('Plan Generation Error details:', {
            name: error?.name,
            message: error?.message,
            statusCode: error?.statusCode,
            data: error?.data, // For some SDK versions
            responseBody: error?.responseBody // For Vercel AI SDK
        });

        const detailedError = error?.responseBody || error?.message || 'Unknown error';
        return res.status(500).json({
            error: `[${error?.name || 'Error'}] ${error?.message || ''}`,
            details: detailedError
        });
    }
});

app.get('/admin/users', async (req: Request, res: Response): Promise<any> => {
    try {
        const requester = await getRequester(req);
        if (!requester) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!requester || !requester.is_admin) {
            return res.status(403).json({ error: 'Forbidden. Admins only.' });
        }

        const pb = await getAdminPB();
        const users = await pb.collection('users').getFullList({
            sort: '-created',
        });

        const premiumCount = users.filter(u => hasActivePremium(u)).length;
        const totalUsers = users.length;
        const estimatedMRR = premiumCount * 4.90;

        return res.json({
            users: users.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name || 'No Name',
                is_premium: hasActivePremium(u),
                is_premium_raw: !!u.is_premium,
                premium_until: u.premium_until || null,
                created: u.created
            })),
            metrics: {
                totalUsers,
                premiumCount,
                estimatedMRR
            }
        });

    } catch (error) {
        console.error('Admin Users API Error:', error);
        return res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/admin/toggle-premium', async (req: Request, res: Response): Promise<any> => {
    try {
        const requester = await getRequester(req);
        if (!requester) return res.status(401).json({ error: 'Unauthorized' });
        if (!requester.is_admin) return res.status(403).json({ error: 'Forbidden. Admins only.' });

        const parsedReq = TogglePremiumRequestSchema.safeParse(req.body);
        if (!parsedReq.success) {
            return res.status(400).json({ error: 'Invalid request payload', details: parsedReq.error.flatten() });
        }
        const { targetUserId, newPremiumStatus } = parsedReq.data;

        const pb = await getAdminPB();

        let premiumUntil = "";
        if (newPremiumStatus) {
            const date = new Date();
            date.setDate(date.getDate() + 30);
            premiumUntil = date.toISOString();
        }

        const updatedUser = await pb.collection('users').update(targetUserId, {
            is_premium: newPremiumStatus,
            premium_until: premiumUntil
        });

        return res.json({
            success: true,
            user: {
                id: updatedUser.id,
                is_premium: updatedUser.is_premium,
                premium_until: updatedUser.premium_until
            }
        });

    } catch (error) {
        console.error('Admin Toggle Premium Error:', error);
        return res.status(500).json({ error: 'Failed to update premium status' });
    }
});

// --- Exercise APIs ---
const RAPIDAPI_BASE_URL = 'https://exercisedb.p.rapidapi.com';
const getRapidApiHeaders = () => ({
    'x-rapidapi-key': process.env.EXERCIEDB_API_KEY || '',
    'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
});

async function rapidFetch(path: string) {
    const res = await fetch(`${RAPIDAPI_BASE_URL}${path}`, { headers: getRapidApiHeaders() });
    if (!res.ok) throw new Error(`ExerciseDB error: ${res.status}`);
    return res.json();
}

async function getCached(pb: any, key: string) {
    try {
        const hit = await pb.collection('exercise_cache_db').getFirstListItem(`name="${key}"`);
        return hit?.data ?? null;
    } catch (_) {
        return null;
    }
}

async function setCache(pb: any, key: string, data: unknown) {
    if (Array.isArray(data)) return;
    try {
        await pb.collection('exercise_cache_db').create({ name: key, data });
    } catch (_) { }
}

const withEquipmentMetadata = (exercise: any) => {
    const equipmentList = normalizeExerciseEquipment(exercise?.equipment);
    return {
        ...exercise,
        equipment_type: primaryEquipmentType(equipmentList),
        equipment_list: equipmentList,
        gifUrl: exercise?.gifUrl || `/api/exercise-gif?id=${exercise?.id}`,
    };
};

app.get('/exercises', async (req: Request, res: Response): Promise<any> => {
    try {
        const name = (req.query.name as string)?.toLowerCase().trim();
        const target = (req.query.target as string)?.toLowerCase().trim();
        const equipmentFilterRaw = (req.query.equipment as string)?.toLowerCase().trim();
        const equipmentFilter = equipmentFilterRaw ? normalizeUserEquipment([equipmentFilterRaw], { defaultNone: false })[0] : '';
        const limit = Number(req.query.limit || 10);

        const pb = await getAdminPB();

        if (name) {
            const cached = await getCached(pb, `name:${name}`);
            if (cached) return res.json(cached);

            const results = await rapidFetch(`/exercises/name/${encodeURIComponent(name)}?limit=${limit}`);
            if (!results || results.length === 0)
                return res.status(404).json({ error: 'Not found' });

            const best = results.find((e: any) => e.name === name) || results[0];
            const enriched = withEquipmentMetadata(best);

            await setCache(pb, `name:${name}`, enriched);
            return res.json(enriched);
        }

        if (target) {
            const cacheRecords = await pb.collection('exercise_cache_db').getFullList({
                fields: 'data',
            });

            const fromCache = cacheRecords
                .map((record: any) => record?.data)
                .filter(isExerciseObject)
                .map(withEquipmentMetadata)
                .filter((exercise: any) => String(exercise.target || '').toLowerCase() === target)
                .filter((exercise: any) => {
                    if (!equipmentFilter) return true;
                    const eqList = Array.isArray(exercise.equipment_list) ? exercise.equipment_list : [];
                    return eqList.includes(equipmentFilter);
                })
                .slice(0, limit);

            if (fromCache.length > 0) {
                return res.json(fromCache);
            }

            const raw = await rapidFetch(`/exercises/target/${encodeURIComponent(target)}?limit=${limit * 3}`);
            const mappedResults = Array.isArray(raw) ? raw.map(withEquipmentMetadata) : [];
            const filtered = mappedResults
                .filter((exercise: any) => !equipmentFilter || exercise.equipment_list?.includes(equipmentFilter))
                .slice(0, limit);

            return res.json(filtered);
        }

        return res.status(400).json({ error: 'Provide ?name= or ?target=' });

    } catch (error: any) {
        console.error('Exercise API Error:', error.message);
        return res.status(500).json({ error: 'Failed to fetch exercises' });
    }
});

app.get('/exercise-gif', async (req: Request, res: Response): Promise<any> => {
    const exerciseId = req.query.id as string;

    if (!exerciseId) {
        return res.status(400).json({ error: 'Missing exercise id' });
    }

    const apiKey = process.env.EXERCIEDB_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        const upstream = await fetch(
            `https://exercisedb.p.rapidapi.com/image?exerciseId=${encodeURIComponent(exerciseId)}&resolution=180`,
            {
                headers: {
                    'x-rapidapi-key': apiKey,
                    'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
                }
            }
        );

        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: 'GIF not found' });
        }

        const contentType = upstream.headers.get('content-type') || 'image/gif';
        const buffer = await upstream.arrayBuffer();

        res.set({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        });

        return res.status(200).send(Buffer.from(buffer));
    } catch (err) {
        console.error('[exercise-gif proxy] Error:', err);
        return res.status(500).json({ error: 'Failed to fetch GIF' });
    }
});

// --- Diagnostic Helper: Fix missing end_dates ---
app.get('/admin/fix-database', async (req: Request, res: Response): Promise<any> => {
    try {
        const requester = await getRequester(req);
        if (!requester) return res.status(401).json({ error: 'Unauthorized' });
        if (!requester.is_admin) return res.status(403).json({ error: 'Forbidden. Admins only.' });

        const pb = await getAdminPB();
        const plans = await pb.collection('weekly_plans_db').getFullList({
            filter: 'end_date = null || end_date = ""'
        });

        let updated = 0;
        for (const plan of plans) {
            const start = new Date(plan.start_date);
            const end = new Date(start);
            end.setDate(end.getDate() + 7);

            await pb.collection('weekly_plans_db').update(plan.id, {
                end_date: end.toISOString()
            });
            updated++;
        }

        return res.json({ success: true, fixed_records: updated });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
