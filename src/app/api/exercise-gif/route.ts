import { NextResponse } from 'next/server';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const exerciseId = searchParams.get('id');

    if (!exerciseId) {
        return NextResponse.json({ error: 'Missing exercise id' }, { status: 400 });
    }

    const apiKey = process.env.EXERCIEDB_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    try {
        const upstream = await fetch(
            `https://exercisedb.p.rapidapi.com/image?exerciseId=${encodeURIComponent(exerciseId)}&resolution=180`,
            {
                headers: {
                    'x-rapidapi-key': apiKey,
                    'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
                },
                // Cache GIFs for 24h at edge
                next: { revalidate: 86400 },
            }
        );

        if (!upstream.ok) {
            return NextResponse.json({ error: 'GIF not found' }, { status: upstream.status });
        }

        const contentType = upstream.headers.get('content-type') || 'image/gif';
        const buffer = await upstream.arrayBuffer();

        return new Response(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
        });
    } catch (err) {
        console.error('[exercise-gif proxy] Error:', err);
        return NextResponse.json({ error: 'Failed to fetch GIF' }, { status: 500 });
    }
}
