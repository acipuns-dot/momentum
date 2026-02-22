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

// Log startup config (masking keys)
console.log('--- Startup Config ---');
console.log(`Port: ${PORT}`);
console.log(`PB URL: ${process.env.NEXT_PUBLIC_POCKETBASE_URL}`);
console.log(`Anthropic Key set: ${!!process.env.ANTHROPIC_API_KEY}`);
console.log(`ExerciseDB Key set: ${!!process.env.EXERCIEDB_API_KEY}`);
console.log('--- end ---');

app.use(cors());
app.use(express.json());

// --- Database Helper ---
const getAdminPB = async () => {
    const pbUrl = process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";
    const pb = new PocketBase(pbUrl);
    await pb.admins.authWithPassword(
        process.env.PB_ADMIN_EMAIL!,
        process.env.PB_ADMIN_PASSWORD!
    );
    return pb;
};

// --- Schemas ---
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
        const { userId, currentWeight, goalWeight, equipment, weekOffset = 0 } = req.body;

        const pb = await getAdminPB();

        let isPremium = false;
        try {
            const userRecord = await pb.collection('users').getOne(userId);
            isPremium = !!userRecord.is_premium;
        } catch (e) {
            console.warn(`User ${userId} not found in users collection yet. Defaulting to free tier.`);
        }

        if (!isPremium && weekOffset > 0) {
            return res.status(403).json({ error: 'Premium is required to generate multi-week plans.' });
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        let recentLogs: Record<string, unknown>[] = [];
        try {
            recentLogs = await pb.collection('activity_logs_db').getFullList({
                filter: `user = "${userId}" && end_date >= "${sevenDaysAgo.toISOString()}"`,
                sort: '-created'
            });
        } catch (e) {
            console.log("No activity logs found, starting fresh.");
        }

        const planStartDate = new Date();
        planStartDate.setDate(planStartDate.getDate() + (weekOffset * 7));

        const equipmentList: string[] = equipment && equipment.length > 0 ? equipment : [];
        let equipmentDescription = "";

        if (equipmentList.includes('gym')) {
            equipmentDescription = "The user has access to a full Commercial Gym.";
        } else if (equipmentList.length === 0) {
            equipmentDescription = "The user has NO equipment — prescribe bodyweight-only exercises.";
        } else {
            equipmentDescription = `The user has access to: ${equipmentList.join(', ')}. Include standard bodyweight exercises as standard.`;
        }

        const aiPrompt = `You are an elite AI fitness coach.
Generate a highly personalized ${weekOffset > 0 ? `Week ${weekOffset + 1}` : '7-day'} workout and nutrition plan for a user.
User Profile:
- Current Weight: ${currentWeight} kg
- Goal Weight: ${goalWeight} kg
- Available Equipment: ${equipment && equipment.length > 0 ? equipment.join(', ') : 'None'}
- Phase: Week ${weekOffset + 1}
CRITICAL CONSTRAINTS:
1. NUTRITION: Calculate a safe, progressive daily calorie deficit target.
2. EQUIPMENT: ${equipmentDescription}
3. EXERCISE NAMES: Use standard, recognizable exercise names (e.g. "jump rope").
4. SCHEDULE: Generate exactly 7 days.
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
            await pb.collection('weekly_plans_db').create({
                user: userId,
                start_date: planStartDate.toISOString(),
                end_date: new Date(planStartDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
        const adminId = req.query.adminId as string;

        if (!adminId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const pb = await getAdminPB();

        let requester;
        try {
            requester = await pb.collection('users').getOne(adminId);
        } catch (e) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (!requester || !requester.is_admin) {
            return res.status(403).json({ error: 'Forbidden. Admins only.' });
        }

        const users = await pb.collection('users').getFullList({
            sort: '-created',
        });

        const premiumCount = users.filter(u => u.is_premium).length;
        const totalUsers = users.length;
        const estimatedMRR = premiumCount * 4.90;

        return res.json({
            users: users.map(u => ({
                id: u.id,
                email: u.email,
                name: u.name || 'No Name',
                is_premium: !!u.is_premium,
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
        const { adminId, targetUserId, newPremiumStatus } = req.body;

        if (!adminId || !targetUserId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const pb = await getAdminPB();

        let requester;
        try {
            requester = await pb.collection('users').getOne(adminId);
        } catch (e) {
            return res.status(404).json({ error: 'Admin user not found' });
        }

        if (!requester || !requester.is_admin) {
            return res.status(403).json({ error: 'Forbidden. Admins only.' });
        }

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
    try {
        await pb.collection('exercise_cache_db').create({ name: key, data });
    } catch (_) { }
}

app.get('/exercises', async (req: Request, res: Response): Promise<any> => {
    try {
        const name = (req.query.name as string)?.toLowerCase().trim();
        const target = (req.query.target as string)?.toLowerCase().trim();
        const limit = Number(req.query.limit || 10);

        const pb = await getAdminPB();

        if (name) {
            const cached = await getCached(pb, `name:${name}`);
            if (cached) return res.json(cached);

            const results = await rapidFetch(`/exercises/name/${encodeURIComponent(name)}?limit=${limit}`);
            if (!results || results.length === 0)
                return res.status(404).json({ error: 'Not found' });

            const best = results.find((e: any) => e.name === name) || results[0];
            if (best && !best.gifUrl) best.gifUrl = `/api/exercise-gif?id=${best.id}`;

            await setCache(pb, `name:${name}`, best);
            return res.json(best);
        }

        if (target) {
            const cacheKey = `target:${target}:${limit}`;
            const cached = await getCached(pb, cacheKey);
            if (cached) return res.json(cached);

            const raw = await rapidFetch(`/exercises/target/${encodeURIComponent(target)}?limit=${limit}`);

            // Ensure we map and cast correctly to access gifUrl
            const mappedResults = Array.isArray(raw) ? raw.map((e: any) => ({
                ...e,
                gifUrl: e.gifUrl || `/api/exercise-gif?id=${e.id}`,
            })) : raw;

            await setCache(pb, cacheKey, mappedResults);
            return res.json(mappedResults);
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

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
