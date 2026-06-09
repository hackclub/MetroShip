async function handler() {
    try {
        const HTUserDataResponse = await getHackatimeUserData();
        if (HTUserDataResponse && HTUserDataResponse.success) {
            fetchProjects(HTUserDataResponse.email);
            if (typeof updateAuthUI === 'function') updateAuthUI();
        }
    } catch (error) {
        console.error('Error in projects handler:', error);
    }
}
async function fetchProjects(email) {
    if (!email) return;
    localStorage.setItem('email', email);
    try {
        const response = await fetch('/api/project-scripts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        const data = await response.json();

        if (data.success) {
            console.log('Airtable Records:', data.records);
            localStorage.setItem('airtableProjects', JSON.stringify(data.records));
            await displayProjects(data.records);
            
        } else {
            console.error('Failed to load projects:', data.error);
        }
    } catch (err) {
        console.error('Fetch error:', err);
    }
}
async function getHackatimeUserData() {
    try {
        const response = await fetch('/api/project-scripts?action=getUserData', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: localStorage.getItem('htaccessToken')}),
        });
        const data = await response.json();

        if (data.success) {
            if (!data.email){
                 console.log({ error: 'No email returned' });
                 console.log({ data: data });
                 return null;
            }
            console.log('Hackatime User Data', data.success, data.email);
            localStorage.setItem('email', data.email);
            return data; // Return the email

        } else {
            console.error('Failed to get Hackatime user data:', data.error || 'Unknown error');
            return null; // Indicate failure
        }
    } catch (err) {
        console.error('Fetch error:', err);
    }
}



async function displayProjects(records) {
    const container = document.getElementById('projects-container');
    if (!container) return;

    try {
        const template = await (await fetch('project-card.html')).text();

        container.innerHTML = records.map(record => {
            const htConnected = record.fields["Hackatime Project Name"] ? 'Yes' : 'No';
            return template
                .replace(/{{PROJECT_NAME}}/g, record.fields["Project Name"] || 'Unnamed Project')
                .replace(/{{EMAIL}}/g, record.fields["Email"] || 'N/A')
                .replace(/{{HOURS}}/g, '...')
                .replace(/{{PROJECT_ID}}/g, record.id || '')
                .replace(/{{HT_CONNECTED}}/g, htConnected);
        }).join('');

        // Async: fetch MetroShip hours (from project creation date) per project in parallel
        const accessToken = localStorage.getItem('htaccessToken') || '';
        await Promise.all(records.map(async record => {
            const hoursEl = document.getElementById(`card-hours-${record.id}`);
            const htName = record.fields["Hackatime Project Name"];
            if (!htName || !accessToken) { if (hoursEl) hoursEl.textContent = '0.00'; return; }
            const createdDate = record.createdTime ? record.createdTime.split('T')[0] : null;
            if (!createdDate) { if (hoursEl) hoursEl.textContent = '0.00'; return; }
            try {
                const res = await fetch(`/api/my-hackatime-hours?accessToken=${encodeURIComponent(accessToken)}&projectName=${encodeURIComponent(htName)}&startDate=${createdDate}`);
                const data = await res.json();
                if (hoursEl) {
                    hoursEl.textContent = (data.success && data.projectTotal != null)
                        ? (data.projectTotal / 3600).toFixed(2) : '0.00';
                }
            } catch { if (hoursEl) hoursEl.textContent = '0.00'; }
        }));
    } catch (error) {
        console.error('Error loading project template:', error);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    handler();
    
});
