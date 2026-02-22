import { NextResponse } from 'next/server';
import { getAdminPB } from '@/lib/pocketbase';

const BASE_URL = 'https://exercisedb.p.rapidapi.com';
const HEADERS = {
    'x-rapidapi-key': process.env.EXERCIEDB_API_KEY || '',
    'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
};

async function rapidFetch(path: string) {
    const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS, next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`ExerciseDB error: ${res.status}`);
    return res.json();
}

/** Try to read from exercise_cache_db. Returns null on miss. */
async function getCached(pb: any, key: string) {
    try {
        const hit = await pb.collection('exercise_cache_db').getFirstListItem(`name="${key}"`);
        return hit?.data ?? null;
    } catch (_) {
        return null;
    }
}

/** Write to exercise_cache_db. Silently ignores errors. */
async function setCache(pb: any, key: string, data: unknown) {
    try {
        await pb.collection('exercise_cache_db').create({ name: key, data });
    } catch (_) { }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const name = searchParams.get('name')?.toLowerCase().trim();
        const target = searchParams.get('target')?.toLowerCase().trim();
        const limit = Number(searchParams.get('limit') || 10);

        const pb = await getAdminPB();

        // ── Fetch by name ───────────────────────────────────────────────
        if (name) {
            const cached = await getCached(pb, `name:${name}`);
            if (cached) return NextResponse.json(cached);

            const results = await rapidFetch(`/exercises/name/${encodeURIComponent(name)}?limit=${limit}`);
            if (!results || results.length === 0)
                return NextResponse.json({ error: 'Not found' }, { status: 404 });

            const best = results.find((e: any) => e.name === name) || results[0];
            if (best && !best.gifUrl) best.gifUrl = `/api/exercise-gif?id=${best.id}`;

            await setCache(pb, `name:${name}`, best);
            return NextResponse.json(best);
        }

        // ── Fetch by target muscle ──────────────────────────────────────
        if (target) {
            const cacheKey = `target:${target}:${limit}`;
            const cached = await getCached(pb, cacheKey);
            if (cached) return NextResponse.json(cached);

            const raw = await rapidFetch(`/exercises/target/${encodeURIComponent(target)}?limit=${limit}`);
            const results = Array.isArray(raw) ? raw.map((e: any) => ({
                ...e,
                gifUrl: e.gifUrl || `/api/exercise-gif?id=${e.id}`,
            })) : raw;

            await setCache(pb, cacheKey, results);
            return NextResponse.json(results);
        }

        return NextResponse.json({ error: 'Provide ?name= or ?target=' }, { status: 400 });

    } catch (error: any) {
        console.error('Exercise API Error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch exercises' }, { status: 500 });
    }
}
