/**
 * PocketBase Setup Script
 * Run once after PocketBase is live:
 *   node scripts/setup-pocketbase.mjs
 *
 * Requires PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD in .env.local
 * Or set them as env vars before running.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
    const paths = [
        resolve(process.cwd(), '.env.local'),
        resolve(process.cwd(), 'frontend', '.env.local')
    ];

    for (const envPath of paths) {
        try {
            const raw = readFileSync(envPath, 'utf-8');
            for (const line of raw.split('\n')) {
                const [key, ...rest] = line.split('=');
                if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
            }
            console.log(`📝 Loaded env from: ${envPath}`);
            break; // Stop after finding first one
        } catch { /* Continue to next path */ }
    }
}
loadEnv();

const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL;
const EMAIL = process.env.PB_ADMIN_EMAIL;
const PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!PB_URL || !EMAIL || !PASSWORD) {
    console.error('❌  Missing env vars. Set NEXT_PUBLIC_POCKETBASE_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD in .env.local');
    process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
async function pb(path, opts = {}) {
    const { headers, ...restOpts } = opts;
    const res = await fetch(`${PB_URL}/api/${path}`, {
        ...restOpts,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(json)}`);
    return json;
}

async function getToken() {
    const data = await pb('collections/_superusers/auth-with-password', {
        method: 'POST',
        body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
    });
    return data.token;
}

async function createCollection(token, schema) {
    try {
        const existing = await pb(`collections/${schema.name}`, {
            headers: { Authorization: token },
        }).catch(() => null);

        if (existing?.id) {
            console.log(`\n⏭  Skipped  "${schema.name}" (already exists)`);
            return;
        }
    } catch (_) { }

    console.log(`\n--- Creating [${schema.name}] ---`);
    console.log(JSON.stringify(schema, null, 2));

    const res = await pb('collections', {
        method: 'POST',
        headers: { Authorization: token },
        body: JSON.stringify(schema),
    });

    if (res.code) throw new Error(res.message);

    console.log(`✅  Created  "${schema.name}"`);
}

// ── Collection Schemas ───────────────────────────────────────────────────────
const COLLECTIONS = [
    {
        name: 'profiles_db',
        type: 'base',
        fields: [
            { name: 'user', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
            { name: 'current_weight', type: 'number', required: true, min: 30, max: 300 },
            { name: 'goal_weight', type: 'number', required: true, min: 30, max: 300 },
            { name: 'height', type: 'number', required: false, min: 50, max: 250 },
        ],
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id = user.id',
        deleteRule: '@request.auth.id = user.id',
    },
    {
        name: 'weekly_plans_db',
        type: 'base',
        fields: [
            { name: 'user', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
            { name: 'start_date', type: 'date', required: true },
            { name: 'end_date', type: 'date', required: false },
            { name: 'plan_data', type: 'json', required: true },
        ],
        listRule: '@request.auth.id = user.id',
        viewRule: '@request.auth.id = user.id',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id = user.id',
        deleteRule: '@request.auth.id = user.id',
    },
    {
        name: 'activity_logs_db',
        type: 'base',
        fields: [
            { name: 'user', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
            { name: 'date', type: 'date', required: true },
            { name: 'activity', type: 'text', required: true },
            { name: 'duration_mins', type: 'number', required: true },
            { name: 'effort_level', type: 'number', required: false, min: 1, max: 10 },
            { name: 'kcal_burned', type: 'number', required: false },
            { name: 'notes', type: 'text', required: false },
        ],
        listRule: '@request.auth.id = user.id',
        viewRule: '@request.auth.id = user.id',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id = user.id',
        deleteRule: '@request.auth.id = user.id',
    },
    {
        name: 'weight_logs_db',
        type: 'base',
        fields: [
            { name: 'user', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
            { name: 'date', type: 'date', required: true },
            { name: 'weight', type: 'number', required: true, min: 20, max: 500 },
            { name: 'notes', type: 'text', required: false },
        ],
        listRule: '@request.auth.id = user.id',
        viewRule: '@request.auth.id = user.id',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id = user.id',
        deleteRule: '@request.auth.id = user.id',
    },
    {
        name: 'nutrition_targets_db',
        type: 'base',
        fields: [
            { name: 'user', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
            { name: 'date', type: 'date', required: true },
            { name: 'target_kcal', type: 'number', required: true },
            { name: 'logged_kcal', type: 'number', required: false },
            { name: 'protein_g', type: 'number', required: false },
            { name: 'carbs_g', type: 'number', required: false },
            { name: 'fat_g', type: 'number', required: false },
        ],
        listRule: '@request.auth.id = user.id',
        viewRule: '@request.auth.id = user.id',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id = user.id',
        deleteRule: '@request.auth.id = user.id',
    },
    {
        name: 'exercise_cache_db',
        type: 'base',
        fields: [
            { name: 'name', type: 'text', required: true },
            { name: 'data', type: 'json', required: true },
        ],
        // Public read — no auth needed to read cached exercises
        listRule: '',
        viewRule: '',
        createRule: null, // admin only
        updateRule: null,
        deleteRule: null,
    },
    {
        name: 'hydration_logs_db',
        type: 'base',
        fields: [
            { name: 'user', type: 'relation', required: true, collectionId: '_pb_users_auth_', maxSelect: 1 },
            { name: 'date', type: 'text', required: true },
            { name: 'ml', type: 'number', required: true, min: 0, max: 10000 },
        ],
        listRule: '@request.auth.id = user.id',
        viewRule: '@request.auth.id = user.id',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id = user.id',
        deleteRule: '@request.auth.id = user.id',
    },
];

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log(`\n🔗  Connecting to ${PB_URL} ...\n`);
    let token;
    try {
        token = await getToken();
        console.log('🔑  Authenticated as admin\n');
    } catch (e) {
        console.error('❌  Auth failed:', e.message);
        process.exit(1);
    }

    for (const col of COLLECTIONS) {
        await createCollection(token, col).catch(e =>
            console.error(`❌  Failed "${col.name}": ${e.message}`)
        );
    }

    console.log('\n🎉  PocketBase setup complete!\n');
    console.log('Next steps:');
    console.log('  1. Make sure NEXT_PUBLIC_POCKETBASE_URL is set in .env.local');
    console.log('  2. Make sure ANTHROPIC_API_KEY is set in .env.local');
    console.log('  3. Restart the dev server: npm run dev\n');
})();
