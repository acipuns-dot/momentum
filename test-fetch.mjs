import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'hi' }]
        })
    });

    console.log(res.status);
    console.log(await res.text());
}

run();
