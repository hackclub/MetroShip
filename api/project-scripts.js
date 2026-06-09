import dotenv from 'dotenv';

// Load variables from .env.local
dotenv.config({ path: '.env' });

export default async function handler(req, res) {

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { action } = req.query;

        // Routing logic: Run different functions based on the "action" parameter
        if (action === 'getUserData') {
            return await getUserData(req, res);
        }

        // Default behavior: Fetch records
        return await handleFetchRecords(req, res);
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}

async function handleFetchRecords(req, res) {
        const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
        const BASE_ID = process.env.AIRTABLE_BASE_ID;
        const TABLE_NAME = 'Projects'; // Replace with your actual table name
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
                    filterByFormula: EMAIL ? `Email='${EMAIL}'` : ""
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
        return res.status(200).json({ success: true, records: data.records });
}

async function getUserData(req, res) {
   
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
    
    // Handle list or nested object structure
    let userEmail = null;
    if (Array.isArray(data.emails) && data.emails.length > 0) {
        userEmail = data.emails[0];
    } else {
        userEmail = data.email || (data.data && data.data.email);
    }

    // Return the email to the frontend
    return res.status(200).json({ success: true, email: userEmail });
}