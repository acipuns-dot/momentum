import { readFileSync } from 'fs';

const PB_URL = 'http://127.0.0.1:8090';
const EMAIL = 'acipuns@gmail.com';
const PASSWORD = 'Acipnois12@';

async function pb(path, opts = {}) {
    const res = await fetch(`${PB_URL}/api/${path}`, {
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        ...opts,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${path}: ${JSON.stringify(json)}`);
    return json;
}

(async () => {
    try {
        const auth = await pb('collections/_superusers/auth-with-password', {
            method: 'POST',
            body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
        });
        const token = auth.token;

        const payloads = [
            {
                "name": "exercise_cache_test_exact",
                "type": "base",
                "fields": [
                    {
                        "name": "name",
                        "type": "text",
                        "required": true
                    },
                    {
                        "name": "data",
                        "type": "json",
                        "required": true
                    }
                ],
                "listRule": "",
                "viewRule": "",
                "createRule": null,
                "updateRule": null,
                "deleteRule": null
            }
        ];

        for (const p of payloads) {
            console.log('\nTrying payload:', JSON.stringify(p));
            const res = await fetch(`${PB_URL}/api/collections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: token },
                body: JSON.stringify(p),
            });
            const json = await res.json().catch(() => ({}));
            console.log('Got:', res.status, json.message || json);
        }
    } catch (e) {
        console.error('Fatal Error:', e.message);
    }
})();
