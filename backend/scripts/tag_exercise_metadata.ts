import dotenv from 'dotenv';
import PocketBase from 'pocketbase';

dotenv.config({ path: '../frontend/.env.local' });

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    console.error('Missing PocketBase admin credentials.');
    process.exit(1);
}

type ExerciseData = {
    name?: string;
    category?: string;
    target?: string;
    bodyPart?: string;
    difficulty?: string;
    equipment_type?: string;
    equipment_list?: string[];
    movement_pattern?: string;
    intensity_level?: string;
    impact_level?: string;
    is_unilateral?: boolean;
    training_goal?: string;
    [key: string]: unknown;
};

const lower = (value: unknown): string => (typeof value === 'string' ? value.toLowerCase().trim() : '');

const hasAny = (source: string, words: string[]): boolean =>
    words.some((word) => source.includes(word));

const detectMovementPattern = (data: ExerciseData): string => {
    const name = lower(data.name);
    const target = lower(data.target);
    const category = lower(data.category);

    if (category === 'cardio' || hasAny(name, ['run', 'jog', 'bike', 'burpee', 'jump rope', 'high knee', 'mountain climber'])) return 'cardio';
    if (hasAny(name, ['squat', 'sit-up', 'leg press', 'hack squat'])) return 'squat';
    if (hasAny(name, ['deadlift', 'good morning', 'hip hinge', 'romanian'])) return 'hinge';
    if (hasAny(name, ['bench press', 'press', 'push-up', 'dip', 'fly'])) return 'push';
    if (hasAny(name, ['row', 'pull-up', 'pulldown', 'curl', 'face pull', 'shrug'])) return 'pull';
    if (hasAny(name, ['lunge', 'split squat', 'step-up', 'curtsey'])) return 'lunge';
    if (hasAny(name, ['plank', 'crunch', 'twist', 'sit-up', 'leg raise']) || target === 'abs') return 'core';
    if (hasAny(name, ['carry', 'walk with', 'farmer'])) return 'carry';
    if (category === 'mobility' || category === 'stretching' || category === 'rehabilitation') return 'mobility';
    return 'general';
};

const detectIntensity = (data: ExerciseData): string => {
    const name = lower(data.name);
    const difficulty = lower(data.difficulty);
    const category = lower(data.category);

    if (difficulty === 'advanced') return 'high';
    if (difficulty === 'beginner') return 'low';
    if (category === 'cardio' && hasAny(name, ['burpee', 'sprint', 'jump'])) return 'high';
    if (category === 'mobility' || category === 'stretching' || category === 'rehabilitation') return 'low';
    if (hasAny(name, ['walk', 'march', 'stretch'])) return 'low';
    return 'moderate';
};

const detectImpact = (data: ExerciseData): string => {
    const name = lower(data.name);
    const category = lower(data.category);

    if (category === 'mobility' || category === 'stretching' || category === 'rehabilitation') return 'low_impact';
    if (hasAny(name, ['jump', 'burpee', 'plyometric', 'sprint', 'high knee'])) return 'high_impact';
    return 'low_impact';
};

const detectUnilateral = (data: ExerciseData): boolean => {
    const name = lower(data.name);
    return hasAny(name, ['single', 'one arm', 'one leg', 'unilateral', 'alternating']);
};

const detectTrainingGoal = (data: ExerciseData): string => {
    const category = lower(data.category);
    const movementPattern = detectMovementPattern(data);

    if (category === 'mobility' || category === 'stretching' || category === 'rehabilitation') return 'mobility';
    if (category === 'cardio' || movementPattern === 'cardio') return 'conditioning';
    if (category === 'plyometrics' || movementPattern === 'carry') return 'athleticism';
    return 'strength';
};

async function run() {
    const pb = new PocketBase(PB_URL);
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL!, PB_ADMIN_PASSWORD!);

    const records = await pb.collection('exercise_cache_db').getFullList({ fields: 'id,data' });

    let scanned = 0;
    let updated = 0;
    let skipped = 0;

    for (const record of records as any[]) {
        scanned += 1;
        const data = record?.data as ExerciseData;

        if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data?.name !== 'string') {
            skipped += 1;
            continue;
        }

        const nextTags = {
            movement_pattern: detectMovementPattern(data),
            intensity_level: detectIntensity(data),
            impact_level: detectImpact(data),
            is_unilateral: detectUnilateral(data),
            training_goal: detectTrainingGoal(data),
        };

        const unchanged =
            data.movement_pattern === nextTags.movement_pattern &&
            data.intensity_level === nextTags.intensity_level &&
            data.impact_level === nextTags.impact_level &&
            data.is_unilateral === nextTags.is_unilateral &&
            data.training_goal === nextTags.training_goal;

        if (unchanged) continue;

        await pb.collection('exercise_cache_db').update(record.id, {
            data: {
                ...data,
                ...nextTags,
            },
        });
        updated += 1;
    }

    console.log(`Scanned: ${scanned}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped non-exercise cache records: ${skipped}`);
}

run().catch((err) => {
    console.error('Tagging script failed:', err);
    process.exit(1);
});
