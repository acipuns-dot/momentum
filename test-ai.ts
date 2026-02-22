import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

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

async function run() {
    try {
        console.log("Starting generation...");
        console.log("Key:", process.env.ANTHROPIC_API_KEY?.substring(0, 15) + "...");
        const { object: plan } = await generateObject({
            model: anthropic('claude-3-haiku-20240307'),
            schema: PlanSchema,
            prompt: "Give me a simple 7 day plan for a 80kg male trying to hit 75kg.",
        });
        console.log("Success:", JSON.stringify(plan, null, 2));
    } catch (e: any) {
        console.error("Full Error Object:", e);
        console.error("Message:", e.message);
        console.error("Stack:", e.stack);
        if (e.cause) console.error("Cause:", e.cause);
    }
}

run();
