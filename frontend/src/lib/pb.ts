import PocketBase from 'pocketbase';

// The PocketBase instance needs to be a singleton across the application
// We initialize it lazily to avoid errors during static rendering/build-time

let pb: PocketBase | null = null;

export function getPB(): PocketBase {
    if (!pb) {
        const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
        pb = new PocketBase(url);

        // Auto-cancellation is often problematic in React Strict Mode 
        // and complex async flows, so we disable it globally.
        pb.autoCancellation(false);
    }
    return pb;
}

/**
 * Helper to ensure we are running on the client before using localStorage auth.
 * Next.js SSR will crash if trying to read/write auth state on the server.
 */
export function isBrowser(): boolean {
    return typeof window !== 'undefined';
}
