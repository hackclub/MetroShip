const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

const REVIEWER_EMAILS = [
    // Add reviewer email addresses here
    'tritiumlabs346@gmail.com',
    'parkerwildey@cvsdvt.org',
];

// Load variables from .env.local
dotenv.config(); // This is more standard and looks for .env in the root

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve your static frontend files (index.html, auth.js, map.js)
// SECURITY: Use 'dotfiles: deny' to prevent serving sensitive hidden files like .env.local
// In a production setup, it is best to move frontend assets to a /public folder.
app.use(express.static(__dirname, {
    dotfiles: 'deny',
    index: 'index.html'
}));

// API route for token exchange (Replicates the function logic)
app.post('/api/exchange-token', async (req, res) => {
    try {
        const { code, redirect_uri } = req.body;
        if (!code) return res.status(400).json({ error: 'No code provided' });
        console.log("exchange-token successfully called in server.js")
        const CLIENT_ID = '3fa659eb0cbcf147ed16dee0abdc0962';
        const CLIENT_SECRET = process.env.CLIENT_SECRET;

        if (!CLIENT_SECRET) {
            console.error('Error: CLIENT_SECRET is missing from environment variables.');
            return res.status(500).json({ success: false, error: 'Server configuration error: CLIENT_SECRET missing' });
        }

        const response = await fetch('https://auth.hackclub.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code.trim(),
                redirect_uri: redirect_uri, // This must match the URI used in the authorize link exactly
                grant_type: 'authorization_code'
            }),
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            console.error('Hack Club OAuth Error:', response.status, data);
            return res.status(response.status).json({ 
                success: false, 
                error: data?.error_description || data?.error || `Hack Club OAuth API error: ${response.statusText}`,
                details: data 
            });
        }

        //const data = await response.json(); // Now it's safer to parse as JSON

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error_description || data.error });
        }

        res.json({ success: true, accessToken: data.access_token });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API route for Hackatime token exchange (Replicates the function logic)
app.post('/api/hackatime-exchange', async (req, res) => {
    try {
        const { code, redirect_uri } = req.body;

        if (!code) {
            return res.status(400).json({ error: 'No authorization code provided' });
        }
        console.log("hackatime-exchange successfully called in server.js, req info below:")
        console.log({code: code});
        console.log({redirect_uri: redirect_uri});


        // NOTE: This CLIENT_ID should match the one in hackatime-auth.js
        const CLIENT_ID = '2ciUev1XVQ1kwX5LMTWGnk0V1kabE8fH9tqAvHcWVTY'; 
        const CLIENT_SECRET = process.env.HACKATIME_SECRET; // Ensure this environment variable is set

        if (!CLIENT_SECRET) {
            return res.status(500).json({ error: 'HACKATIME_SECRET is not configured on the server.' });
        }

        const oauthResponse = await fetch('https://hackatime.hackclub.com/oauth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: String(code).trim(),
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            }),
        });

        const data = await oauthResponse.json().catch(() => null);

        if (!oauthResponse.ok) {
            console.error('Hackatime OAuth Error:', oauthResponse.status, data);
            return res.status(oauthResponse.status).json({ success: false, error: data?.error_description || data?.error || 'Auth provider error', details: data });
        }

        if (!data || data.error) {
            return res.status(400).json({ success: false, error: data?.error_description || 'Invalid response from Hackatime Auth' });
        }

        return res.status(200).json({ success: true, accessToken: data.access_token });

    } catch (error) {
        console.error('Hackatime exchange error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/project-scripts', async (req, res) => {
    if (req.query.action === 'getUserData') {
        try {
            const accessToken = req.body.accessToken;
            const hackatimeResponse = await fetch(
                `https://hackatime.hackclub.com/api/v1/authenticated/me`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    }
                }
        );

        if (!hackatimeResponse.ok) {
            const errorBody = await hackatimeResponse.text();
            console.error('Hackatime Error:', errorBody);
            return res.status(hackatimeResponse.status).json({ error: 'Failed to fetch from Hackatime' });
        }

        const data = await hackatimeResponse.json();
        console.log({htData: data});

        // Hackatime returns emails as a list. Extract the first one.
        let userEmail = null;
        if (Array.isArray(data.emails) && data.emails.length > 0) {
            userEmail = data.emails[0];
        } else {
            userEmail = data.email || (data.data && data.data.email);
        }

        if (!userEmail) {
            console.error('No email returned from Hackatime API', data);
            return res.status(404).json({ error: 'No email found' });
        }

        // Upsert a Users record and store the Hackatime token
        const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
        const BASE_ID = process.env.AIRTABLE_BASE_ID;
        if (AIRTABLE_PAT && BASE_ID) {
            try {
                const checkResponse = await fetch(
                    `https://api.airtable.com/v0/${BASE_ID}/Users/listRecords`,
                    {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filterByFormula: `{Email}='${userEmail}'` })
                    }
                );
                if (checkResponse.ok) {
                    const checkData = await checkResponse.json();
                    if (!checkData.records || checkData.records.length === 0) {
                        const cr = await fetch(
                            `https://api.airtable.com/v0/${BASE_ID}/Users`,
                            {
                                method: 'POST',
                                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ fields: { Email: userEmail, Tokens: 0, HackatimeToken: accessToken, HackatimeUserId: String(data.id || '') } })
                            }
                        );
                        console.log('Created Users record for:', userEmail, '| status:', cr.status);
                    } else {
                        // Update the stored token so reviewer can fetch this user's heatmap
                        const existingId = checkData.records[0].id;
                        const pr = await fetch(
                            `https://api.airtable.com/v0/${BASE_ID}/Users/${existingId}`,
                            {
                                method: 'PATCH',
                                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ fields: { HackatimeToken: accessToken, HackatimeUserId: String(data.id || '') } })
                            }
                        );
                        console.log('Updated HackatimeToken for', userEmail, ':', pr.status);
                    }
                }
            } catch (airtableError) {
                console.error('Airtable upsert error (non-fatal):', airtableError);
            }
        }

        // Return the email to the frontend
        return res.status(200).json({ success: true, email: userEmail });
        } catch (error) {
            console.error('Hackatime email error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    } else if(req.query.action === 'getProjects'){
        try {
            const accessToken = req.body.accessToken;
            const HTProjResponse = await fetch(
                `https://hackatime.hackclub.com/api/v1/authenticated/projects`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    }
                }
        );

        if (!HTProjResponse.ok) {
            const errorBody = await HTProjResponse.text();
            console.error('Hackatime Error:', errorBody);
            return res.status(HTProjResponse.status).json({ error: 'Failed to fetch from Hackatime' });
        }

        const data = await HTProjResponse.json();
        console.log({htData: data});

        

        if (!data) {
            console.error('No email returned from Hackatime API', data);
            return res.status(404).json({ error: 'No email found' });
        }

        // Return the data to the frontend
        return res.status(200).json({ success: true, data: data });
        } catch (error) {
            console.error('Hackatime email error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }else if(req.query.action === 'patchHTProjectName'){
        const selectedProjectName = req.body.selectedProjectName;
        const selectedProjectATid = req.body.selectedProjectATid;
        console.log({selectedProjectName: selectedProjectName});
        console.log({selectedProjectATid: selectedProjectATid});
        try {
            const airtablePatchResponse = await fetch(
                `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/YSWS%20Project%20Submission/${selectedProjectATid}`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        fields: {
                            "Hackatime Project Name": selectedProjectName, //set the field in airtable to the HT project name
                        }
                    })
                }
            );
            if (!airtablePatchResponse.ok) {
                 const errorBody = await airtablePatchResponse.text();
                console.error('Airtable Patch Error:', errorBody);
                return res.status(airtablePatchResponse.status).json({ error: 'Failed to Patch to Airtable' });
            }
            const data = await airtablePatchResponse.json();
            console.log("Airtable patch success", data)
            return res.status(200).json({ success: true, data: data});

        } catch (error) {
            console.error('Airtable patch error:', error);
        }
    } else if(req.query.action === 'patchHTUser'){
        const Email = req.body.selectedProjectName;
        const selectedProjectATid = req.body.selectedProjectATid;
        console.log({selectedProjectName: selectedProjectName});
        console.log({selectedProjectATid: selectedProjectATid});
        try {
            const airtablePatchResponse = await fetch(
                `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Users/${selectedProjectATid}`,
                {
                    method: 'PATCH',
                    headers: {
                        Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        fields: {
                            "Email": Email, //set the field in airtable to the HT project name
                        }
                    })
                }
            );
            if (!airtablePatchResponse.ok) {
                 const errorBody = await airtablePatchResponse.text();
                console.error('Airtable Patch Error:', errorBody);
                return res.status(airtablePatchResponse.status).json({ error: 'Failed to Patch to Airtable' });
            }
            const data = await airtablePatchResponse.json();
            console.log("Airtable patch success", data)
            return res.status(200).json({ success: true, data: data});

        } catch (error) {
            console.error('Airtable patch error:', error);
        }
    } else {
        try {
            const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
            const BASE_ID = process.env.AIRTABLE_BASE_ID;
            const TABLE_NAME = 'YSWS Project Submission'; // Replace with your actual table name
            if (!req.body.email) return res.status(400).json({ error: 'No email provided' });
        // SECURITY: Email must be passed from frontend via query param, e.g., ?email=...
            const EMAIL = req.body.email;

            if (!AIRTABLE_PAT || !BASE_ID) {
                return res.status(500).json({ error: 'Airtable configuration missing on server.' });
            }

            // Query Airtable API
            // Note: Use the correct Airtable POST endpoint for listRecords (no trailing comma/space)
            const airtableResponse = await fetch(
                `https://api.airtable.com/v0/${BASE_ID}/${TABLE_NAME}/listRecords`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${AIRTABLE_PAT}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        filterByFormula: `{Email}='${EMAIL}'`,
                    })
                }
            );

            if (!airtableResponse.ok) {
                const errorBody = await airtableResponse.text();
                console.error('Airtable Error:', errorBody);
                return res.status(airtableResponse.status).json({ error: 'Failed to fetch from Airtable' });
            }

            const data = await airtableResponse.json();
            // Return the records to the frontend
            return res.status(200).json({ success: true, records: data.records});


        } catch (error) {
            console.error('Airtable fetch error:', error);
            return res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});



app.post('/api/patch-project-details', async (req, res) => {
    try {
        const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
        const BASE_ID = process.env.AIRTABLE_BASE_ID;
        const { recordId, field, value } = req.body;
        if (!recordId || !field) return res.status(400).json({ error: 'recordId and field are required' });
        if (!AIRTABLE_PAT || !BASE_ID) return res.status(500).json({ error: 'Airtable configuration missing.' });

        const patchResponse = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/YSWS%20Project%20Submission/${recordId}`,
            {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: { [field]: value } })
            }
        );
        const body = await patchResponse.text();
        console.log('patch-project-details status:', patchResponse.status, body);
        if (!patchResponse.ok) return res.status(patchResponse.status).json({ error: 'Airtable patch failed', detail: body });
        return res.status(200).json({ success: true, data: JSON.parse(body) });
    } catch (error) {
        console.error('patch-project-details error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/user-tokens', async (req, res) => {
    try {
        const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
        const BASE_ID = process.env.AIRTABLE_BASE_ID;
        const EMAIL = req.body.email;
        if (!EMAIL) return res.status(400).json({ error: 'No email provided' });
        if (!AIRTABLE_PAT || !BASE_ID) return res.status(500).json({ error: 'Airtable configuration missing.' });

        const formula = encodeURIComponent(`{Email}='${EMAIL}'`);
        const checkResponse = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/Users?filterByFormula=${formula}`,
            { method: 'GET', headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } }
        );

        const checkBody = await checkResponse.text();
        console.log('user-tokens check status:', checkResponse.status, checkBody);

        if (!checkResponse.ok) {
            return res.status(checkResponse.status).json({ error: 'Airtable Users lookup failed', detail: checkBody });
        }

        const checkData = JSON.parse(checkBody);

        if (checkData.records && checkData.records.length > 0) {
            const tokens = checkData.records[0].fields.Tickets ?? 0;
            return res.status(200).json({ success: true, tokens });
        }

        // No record — create with 0 tokens
        const createResponse = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/Users`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: [{ fields: { Email: EMAIL, Tickets: 0 } }] })
            }
        );
        const createBody = await createResponse.text();
        console.log('user-tokens create status:', createResponse.status, createBody);

        return res.status(200).json({ success: true, tokens: 0 });
    } catch (error) {
        console.error('user-tokens error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/is-reviewer', (req, res) => {
    const { email } = req.body;
    res.json({ isReviewer: !!email && REVIEWER_EMAILS.includes(email) });
});

app.post('/api/get-shipped-projects', async (req, res) => {
    try {
        const { reviewerEmail } = req.body;
        if (!REVIEWER_EMAILS.includes(reviewerEmail)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
        const BASE_ID = process.env.AIRTABLE_BASE_ID;
        if (!AIRTABLE_PAT || !BASE_ID) return res.status(500).json({ error: 'Airtable configuration missing.' });

        const response = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/YSWS%20Project%20Submission/listRecords`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ filterByFormula: `{Shipped}=TRUE()` })
            }
        );
        const body = await response.text();
        if (!response.ok) return res.status(response.status).json({ error: 'Airtable fetch failed', detail: body });
        const data = JSON.parse(body);
        return res.status(200).json({ success: true, records: data.records });
    } catch (error) {
        console.error('get-shipped-projects error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/toggle-verified', async (req, res) => {
    try {
        const { recordId, verified, reviewerEmail } = req.body;
        console.log('toggle-verified — email received:', JSON.stringify(reviewerEmail), '| allowed:', REVIEWER_EMAILS);
        if (!REVIEWER_EMAILS.includes(reviewerEmail)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
        const BASE_ID = process.env.AIRTABLE_BASE_ID;
        if (!AIRTABLE_PAT || !BASE_ID) return res.status(500).json({ error: 'Airtable configuration missing.' });

        const patchResponse = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/YSWS%20Project%20Submission/${recordId}`,
            {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: { Verified: verified } })
            }
        );
        const body = await patchResponse.text();
        if (!patchResponse.ok) return res.status(patchResponse.status).json({ error: 'Airtable patch failed', detail: body });
        return res.status(200).json({ success: true, data: JSON.parse(body) });
    } catch (error) {
        console.error('toggle-verified error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/hackatime-heatmap', async (req, res) => {
    try {
        const { email, projectName, reviewerEmail } = req.query;
        if (!email || !REVIEWER_EMAILS.includes(reviewerEmail)) {
            return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
        const BASE_ID = process.env.AIRTABLE_BASE_ID;

        let userToken = null, hackatimeUserId = null;
        if (AIRTABLE_PAT && BASE_ID) {
            const userRes = await fetch(
                `https://api.airtable.com/v0/${BASE_ID}/Users/listRecords`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filterByFormula: `{Email}='${email}'` })
                }
            );
            if (userRes.ok) {
                const userData = await userRes.json();
                const rec = userData.records?.[0]?.fields;
                userToken = rec?.['HackatimeToken'] || null;
                hackatimeUserId = rec?.['HackatimeUserId'] || null;
            }
        }

        if (!userToken) return res.json({ success: false, data: [], reason: 'no_token' });

        const authHeaders = { Authorization: `Bearer ${userToken}`, Accept: 'application/json' };

        // If user ID wasn't stored yet, fetch it from /me
        if (!hackatimeUserId) {
            const meRes = await fetch('https://hackatime.hackclub.com/api/v1/authenticated/me', { headers: authHeaders });
            if (meRes.ok) {
                const meData = await meRes.json();
                hackatimeUserId = String(meData.id || meData.username || '');
            }
        }

        if (!hackatimeUserId) return res.json({ success: false, data: [] });

        const today = new Date();
        const end = today.toISOString().split('T')[0];
        const yearStart = new Date(today);
        yearStart.setFullYear(yearStart.getFullYear() - 1);
        const start = req.query.startDate || yearStart.toISOString().split('T')[0];

        // Build last-30-days date list
        const dates = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }

        const base = `https://hackatime.hackclub.com/api/summary?user_id=${encodeURIComponent(hackatimeUserId)}`;
        const proj = projectName ? `&project=${encodeURIComponent(projectName)}` : '';

        // Fast path: only aggregate total, no daily breakdown
        if (req.query.summaryOnly === 'true') {
            const summary = await fetch(`${base}&from=${start}&to=${end}${proj}`, { headers: authHeaders })
                .then(r => r.ok ? r.json() : null).catch(() => null);
            const entry = projectName ? (summary?.projects || []).find(p => p.key === projectName) : null;
            return res.json({ success: true, type: 'stats', projectTotal: entry ? entry.total : null, days: [] });
        }

        // 1 aggregate from start→today + 30 daily calls in parallel (skip days before start)
        const [yearSummary, ...dailyResults] = await Promise.all([
            fetch(`${base}&from=${start}&to=${end}${proj}`, { headers: authHeaders })
                .then(r => r.ok ? r.json() : null).catch(() => null),
            ...dates.map(date => {
                if (date < start) return Promise.resolve({ date, seconds: 0 });
                return fetch(`${base}&from=${date}&to=${date}${proj}`, { headers: authHeaders })
                    .then(r => r.ok ? r.json() : null)
                    .then(d => {
                        if (!d) return { date, seconds: 0 };
                        const projs = d.projects || [];
                        const match = projectName ? projs.find(p => p.key === projectName) : null;
                        const seconds = match ? match.total : projs.reduce((s, p) => s + p.total, 0);
                        return { date, seconds: seconds || 0 };
                    })
                    .catch(() => ({ date, seconds: 0 }));
            })
        ]);

        const yearProjects = yearSummary?.projects || [];
        const yearEntry = projectName ? yearProjects.find(p => p.key === projectName) : null;
        const projectTotal = yearEntry ? yearEntry.total : null;

        return res.json({ success: true, type: 'stats', projectTotal, days: dailyResults });
    } catch (err) {
        console.error('hackatime-heatmap error:', err);
        return res.json({ success: false, data: [] });
    }
});

app.get('/api/my-hackatime-hours', async (req, res) => {
    try {
        const { accessToken, projectName, startDate } = req.query;
        if (!accessToken) return res.status(400).json({ success: false, error: 'Missing accessToken' });

        const authHeaders = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };

        const meRes = await fetch('https://hackatime.hackclub.com/api/v1/authenticated/me', { headers: authHeaders });
        if (!meRes.ok) return res.json({ success: false, error: 'Invalid token' });
        const meData = await meRes.json();
        const userId = String(meData.id || meData.username || '');
        if (!userId) return res.json({ success: false, error: 'No user ID' });

        const today = new Date().toISOString().split('T')[0];
        const from = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const projParam = projectName ? `&project=${encodeURIComponent(projectName)}` : '';

        const summaryRes = await fetch(
            `https://hackatime.hackclub.com/api/summary?user_id=${encodeURIComponent(userId)}&from=${from}&to=${today}${projParam}`,
            { headers: authHeaders }
        );
        if (!summaryRes.ok) return res.json({ success: false, error: 'Hackatime API error' });
        const summaryData = await summaryRes.json();

        const projects = summaryData.projects || [];
        const entry = projectName ? projects.find(p => p.key === projectName) : null;
        const projectTotal = entry ? entry.total : null;

        return res.json({ success: true, projectTotal });
    } catch (err) {
        console.error('my-hackatime-hours error:', err);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

app.post('/api/set-project-baseline', async (req, res) => {
    try {
        const { recordId, baselineSeconds, baselineDate } = req.body;
        if (!recordId) return res.status(400).json({ error: 'Missing recordId' });

        const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
        const BASE_ID = process.env.AIRTABLE_BASE_ID;
        if (!AIRTABLE_PAT || !BASE_ID) return res.status(500).json({ error: 'Config error' });

        const patchRes = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/YSWS%20Project%20Submission/${recordId}`,
            {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fields: {
                        'Hackatime Baseline Seconds': baselineSeconds || 0,
                        'Hackatime Baseline Date': baselineDate
                    }
                })
            }
        );
        if (!patchRes.ok) {
            const detail = await patchRes.text();
            return res.status(patchRes.status).json({ error: 'Failed to set baseline', detail });
        }
        return res.json({ success: true });
    } catch (err) {
        console.error('set-project-baseline error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/submit-order', async (req, res) => {
    try {
        const { email, items, totalTickets } = req.body;
        if (!email) return res.status(400).json({ error: 'Not logged in' });
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Empty order' });

        const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
        const BASE_ID = process.env.AIRTABLE_BASE_ID;
        if (!AIRTABLE_PAT || !BASE_ID) return res.status(500).json({ error: 'Server configuration error' });

        // Fetch current user record
        const userRes = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/Users/listRecords`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ filterByFormula: `{Email}='${email}'` })
            }
        );
        if (!userRes.ok) return res.status(500).json({ error: 'Failed to look up user' });
        const userData = await userRes.json();
        const userRecord = userData.records?.[0];
        if (!userRecord) return res.status(400).json({ error: 'User not found' });

        const currentTokens = userRecord.fields.Tickets || 0;
        if (currentTokens < totalTickets) {
            return res.status(400).json({ error: 'Not enough tickets', has: currentTokens, needs: totalTickets });
        }

        // Create Orders record
        const orderRes = await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/Orders`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fields: {
                        Email: email,
                        Items: JSON.stringify(items),
                        'Total Tickets': totalTickets,
                        Status: 'Pending'
                    }
                })
            }
        );
        if (!orderRes.ok) {
            const detail = await orderRes.text();
            console.error('submit-order: failed to create Orders record:', detail);
            return res.status(orderRes.status).json({ error: 'Failed to create order' });
        }

        // Deduct tickets
        const newTokens = currentTokens - totalTickets;
        await fetch(
            `https://api.airtable.com/v0/${BASE_ID}/Users/${userRecord.id}`,
            {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: { Tickets: newTokens } })
            }
        );

        return res.json({ success: true, remainingTickets: newTokens });
    } catch (err) {
        console.error('submit-order error:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => console.log(`Test environment running at http://localhost:${PORT}`));