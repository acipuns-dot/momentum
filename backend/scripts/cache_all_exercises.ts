import dotenv from 'dotenv';
dotenv.config({ path: '../frontend/.env.local' });
import PocketBase from 'pocketbase';

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;
const EXERCIEDB_API_KEY = process.env.EXERCIEDB_API_KEY;

if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
    console.error("Missing PocketBase Admin credentials in environment variables.");
    process.exit(1);
}

if (!EXERCIEDB_API_KEY) {
    console.error("Missing EXERCIEDB_API_KEY in environment variables.");
    process.exit(1);
}

const pb = new PocketBase(PB_URL);

async function authenticateAdmin() {
    console.log(`Authenticating admin at ${PB_URL}...`);
    try {
        await pb.admins.authWithPassword(PB_ADMIN_EMAIL!, PB_ADMIN_PASSWORD!);
        console.log("Admin authenticated successfully.");
    } catch (e: any) {
        console.error("Failed to authenticate admin:", e.message);
        process.exit(1);
    }
}

async function fetchExercises(offset: number, limit: number): Promise<any[]> {
    const url = `https://exercisedb.p.rapidapi.com/exercises?limit=${limit}&offset=${offset}`;
    console.log(`Fetching from ExerciseDB: ${url}`);

    let retries = 3;
    while (retries > 0) {
        try {
            const res = await fetch(url, {
                headers: {
                    'x-rapidapi-key': EXERCIEDB_API_KEY!,
                    'x-rapidapi-host': 'exercisedb.p.rapidapi.com'
                }
            });

            if (!res.ok) {
                if (res.status === 429) {
                    console.warn("Rate limited! Waiting 5 seconds...");
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    retries--;
                    continue;
                }
                throw new Error(`ExerciseDB error: ${res.status}`);
            }

            return await res.json() as any[];
        } catch (e: any) {
            console.error("Error fetching chunk:", e.message);
            retries--;
            if (retries === 0) throw e;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    return [];
}

async function saveToPocketBase(exercise: any) {
    const cacheKey = `name:${exercise.name.toLowerCase()}`;
    try {
        // Try to update existing first to avoid duplicates
        try {
            const existing = await pb.collection('exercise_cache_db').getFirstListItem(`name="${cacheKey}"`);
            await pb.collection('exercise_cache_db').update(existing.id, {
                data: exercise
            });
            return { status: 'updated' };
        } catch (e) {
            // Not found, create new
            await pb.collection('exercise_cache_db').create({
                name: cacheKey,
                data: exercise
            });
            return { status: 'created' };
        }
    } catch (e: any) {
        console.error(`Failed to save exercise ${exercise.name} (${exercise.id}):`, e.message);
        return { status: 'error' };
    }
}

async function run() {
    await authenticateAdmin();

    let offset = 0;
    const limit = 10; // Optimal limit based on RapidAPI limits per hit
    let hasMore = true;
    let totalCached = 0;

    console.log("Starting bulk cache process...");

    while (hasMore) {
        let chunk: any[] = [];
        try {
            chunk = await fetchExercises(offset, limit);
        } catch (e) {
            console.error("Critical error fetching exercises, aborting script.");
            break;
        }

        if (chunk.length === 0) {
            console.log("No more exercises found. Finished fetching.");
            hasMore = false;
            break;
        }

        console.log(`Received chunk of ${chunk.length} at offset ${offset}. Formatting and caching...`);

        let createdCount = 0;
        let updatedCount = 0;

        for (const exercise of chunk) {
            // Re-map gif URLs so they point to our backend proxy if needed, or leave original.
            // Keeping original allows the backend proxy logic to still intercept it if necessary, 
            // but the original ExerciseDB gifUrl has a timeout attached.
            // Our backend currently overrides .gifUrl with `/api/exercise-gif?id=${best.id}` if not present,
            // but let's just save the full original record so it mirrors exact DB state.

            const result = await saveToPocketBase(exercise);
            if (result.status === 'created') createdCount++;
            if (result.status === 'updated') updatedCount++;
        }

        console.log(`Chunk applied: ${createdCount} created, ${updatedCount} updated.`);
        totalCached += chunk.length;

        if (chunk.length < limit) {
            console.log("Chunk smaller than limit, concluding pagination.");
            hasMore = false;
        } else {
            offset += limit;
            console.log("Waiting 1.5 seconds to respect rate limits...");
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }

    console.log(`--- Cache Job Complete! ---`);
    console.log(`Total exercises grabbed and cached: ${totalCached}`);
}

run().catch(console.error);
