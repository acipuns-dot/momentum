import { getAdminPB } from '@/lib/pocketbase';
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

const PlanSchema = z.object({
    estimatedWeeks: z.number().describe("Estimated weeks to reach goal weight at this calorie deficit pace (e.g. 18)"),
    focus: z.enum(['fat_loss', 'cardio_endurance', 'active_recovery']),
    targetKcal: z.number().describe("Daily calorie target for weight loss (e.g. 1800)"),
    targetProtein: z.number().describe("Daily protein target in grams (e.g. 150)"),
    targetCarbs: z.number().describe("Daily carbs target in grams (e.g. 150)"),
    targetFat: z.number().describe("Daily fat target in grams (e.g. 65)"),
    days: z.array(z.object({
        dayIndex: z.number().describe("0 for today, 1 for tomorrow, etc (up to 6)"),
        type: z.enum(['workout', 'rest']),
        focusArea: z.string().optional().describe("E.g., Full Body, Core, Legs"),
        exercises: z.array(z.object({
            name: z.string().describe("Standard exercise name (e.g. jumping jacks, burpees)"),
            durationOrReps: z.string().describe("E.g. 60 seconds, 15 reps"),
            sets: z.number().optional()
        })).optional().describe("Only provide if type is workout"),
        nutritionTip: z.string().describe("A brief, actionable tip for the day")
    }))
});

export async function POST(req: Request) {
    try {
        const { userId, currentWeight, goalWeight, equipment, weekOffset = 0 } = await req.json();

        const pb = await getAdminPB();

        // Allow Free users to generate Week 0 (First 7 days).
        // Block them from generating Week 1, 2, or 3.
        let isPremium = false;
        try {
            const userRecord = await pb.collection('users').getOne(userId);
            isPremium = !!userRecord.is_premium;
        } catch (e) {
            console.warn(`User ${userId} not found in users collection yet. Defaulting to free tier.`);
        }

        if (!isPremium && weekOffset > 0) {
            return NextResponse.json(
                { error: 'Premium is required to generate multi-week plans.' },
                { status: 403 }
            );
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

        // Calculate the specific start date for THIS generated week based on the offset
        const planStartDate = new Date();
        planStartDate.setDate(planStartDate.getDate() + (weekOffset * 7));

        // Build a clear equipment description for Claude
        const equipmentList: string[] = equipment && equipment.length > 0 ? equipment : [];
        let equipmentDescription = "";

        if (equipmentList.includes('gym')) {
            equipmentDescription = "The user has access to a full Commercial Gym. You may prescribe any standard gym equipment (barbells, dumbbells, cables, standard machines) along with bodyweight exercises.";
        } else if (equipmentList.length === 0) {
            equipmentDescription = "The user has NO equipment — prescribe bodyweight-only exercises (e.g. push-ups, squats, burpees, jumping jacks).";
        } else {
            equipmentDescription = `The user has access to: ${equipmentList.join(', ')}. Always include standard bodyweight exercises (push-ups, squats, lunges, etc.) as the foundation. Use their equipment as a supplement to add variety — do NOT build sessions exclusively around the equipment.`;
        }

        const aiPrompt = `You are an elite AI fitness coach.
Generate a highly personalized ${weekOffset > 0 ? `Week ${weekOffset + 1}` : '7-day'} workout and nutrition plan for a user.

User Profile:
- Current Weight: ${currentWeight} kg
- Goal Weight: ${goalWeight} kg
- Available Equipment: ${equipment && equipment.length > 0 ? equipment.join(', ') : 'None (Bodyweight only)'}
- Phase: Week ${weekOffset + 1} of their program.
${weekOffset > 0 ? `Important: Because this is Week ${weekOffset + 1}, increase the intensity slightly from a beginner baseline to ensure continuous progress and avoid plateaus.` : ''}

Recent history for context (adjust plan based on this if provided):
${recentLogs.length > 0 ? JSON.stringify(recentLogs) : 'No recent activity. Assume they are starting fresh.'}

CRITICAL CONSTRAINTS:
1. NUTRITION: Calculate a safe, progressive daily calorie deficit target (targetKcal) and macro split (targetProtein, targetCarbs, targetFat in grams) to reach their goal weight.
2. EQUIPMENT: ${equipmentDescription}
3. EXERCISE NAMES: Use standard, recognizable exercise names (e.g. "jump rope", "burpees") so GIFs can be fetched for them.
4. SCHEDULE: Generate exactly 7 days. Build a fluid schedule based on their recent activity. Include adequate rest days.

Based on this, generate the optimal 7-day weight loss plan and precise daily macro targets.`;

        const { object: plan } = await generateObject({
            model: anthropic('claude-3-haiku-20240307'),
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
            console.error("Failed to save plan to DB, returning it anyway.", e);
        }

        return NextResponse.json(plan);

    } catch (error: any) {
        console.error('Plan Generation Error:', error);
        return NextResponse.json(
            { error: `[${error?.name || 'Error'}] ${error?.message || ''} | Cause: ${error?.cause ? String(error.cause) : 'None'}` },
            { status: 500 }
        );
    }
}
