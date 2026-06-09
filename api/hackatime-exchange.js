export default async function handler(req, res) {
    try {
        // Set CORS headers for browser security
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle CORS preflight requests
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        if (req.method === 'GET') {
            return res.status(200).json({ 
                status: "active", 
                message: "API endpoint reached successfully. Use POST to exchange your code." 
            });
        }

        if (req.method !== 'POST') {
            return res.status(405).json({ error: `Method ${req.method} not allowed.` });
        }

        // Safely parse body
        let body;
        try {
            body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        } catch (e) {
            return res.status(400).json({ error: 'Invalid JSON request body.' });
        }

        const { code, redirect_uri } = body;

        if (!code) {
            return res.status(400).json({ error: 'No authorization code provided' });
        }

        const CLIENT_ID = '2ciUev1XVQ1kwX5LMTWGnk0V1kabE8fH9tqAvHcWVTY';
        const CLIENT_SECRET = process.env.HACKATIME_SECRET;

        if (!CLIENT_SECRET) {
            return res.status(500).json({ error: 'CLIENT_SECRET is not configured on the server.' });
        }

        const oauthResponse = await fetch('https://hackatime.hackclub.com/oauth/token', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                // Adding a browser-like User-Agent
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: String(code).trim(),
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            }),
        });

        // Check if the response is OK and if it's JSON
        const contentType = oauthResponse.headers.get('content-type');
        if (!oauthResponse.ok || !contentType || !contentType.includes('application/json')) {
            const errorText = await oauthResponse.text();
            console.error('Error response from Hackatime OAuth:', oauthResponse.status, errorText);
            return res.status(oauthResponse.status).json({ success: false, error: 'Auth provider error', details: errorText });
        }

        const data = await oauthResponse.json();

        // Ensure data exists before accessing properties to avoid "undefined" errors
        if (!data || data.error) {
            return res.status(400).json({ success: false, error: data?.error_description || 'Invalid response from Auth' });
        }

        return res.status(200).json({ success: true, accessToken: data.access_token });

    } catch (error) {
        console.error('Exchange error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}