let deleteConfirmTimer = null;

document.addEventListener('click', async (e) => {
    // 1. Check for card clicks to open overlay
    // 2. Check for close button or backdrop clicks to close overlay
    // 3. Check for the "Connect to Hackatime" button
    // Find the closest parent with the class 'project-card'
    const card = e.target.closest('.project-card');
    const overlay = document.getElementById('overlay');
   
    if (card && overlay) {
        const projectName = card.id;
        const email = card.dataset.email; // Correctly access data-email via dataset
        const hours = card.dataset.hours; // Correctly access data-hours via dataset
        const id = card.dataset.id;
        const htConnected = card.dataset.htconnected;

        // Instead of reading the stringified "[object Object]" from the DOM,
        // find the actual record object in the local storage array using the ID.
        const airtableProjects = JSON.parse(localStorage.getItem('airtableProjects') || '[]');
        const record = airtableProjects.find(r => r.id === id);


        localStorage.setItem('selectedProjectId', id);

/*
        try {
            // Fetch the external HTML file
            const response = await fetch('project-details-template.html');
            const template = await response.text();

            // Chain replacements for all placeholders
            const finalHtml = template
                .replace(/{{PROJECT_NAME}}/g, projectName)
                .replace(/{{EMAIL}}/g, email)
                .replace(/{{HOURS}}/g, hours);

            overlay.innerHTML = finalHtml;
            overlay.style.display = 'block';
        } catch (error) {
            console.error('Error loading project details template:', error);
        }*/
        updateOverlay(false);
        
        

        
    } else if (overlay && (e.target === overlay || e.target.classList.contains('close-btn'))) {
        localStorage.removeItem('selectedProjectId');
        localStorage.removeItem('card');
        overlay.style.display = 'none';

    } else if (e.target && e.target.id === 'connect-project') {
        e.preventDefault();

    } else if (e.target.closest('#ship-btn')) {
        const btn = e.target.closest('#ship-btn');
        const currentShipped = btn.dataset.shipped === 'true';
        const newShipped = !currentShipped;
        const recordId = localStorage.getItem('selectedProjectId');
        if (!recordId) return;
        try {
            const calls = [
                fetch('/api/patch-project-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recordId, field: 'Shipped', value: newShipped })
                })
            ];
            // Re-shipping clears the Returned flag so it doesn't still show as returned
            if (newShipped) {
                calls.push(fetch('/api/patch-project-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recordId, field: 'Returned', value: null })
                }));
            }
            const [shipRes] = await Promise.all(calls);
            const data = await shipRes.json();
            if (data.success) {
                const airtableProjects = JSON.parse(localStorage.getItem('airtableProjects') || '[]');
                const record = airtableProjects.find(r => r.id === recordId);
                if (record) {
                    record.fields['Shipped'] = newShipped;
                    if (newShipped) record.fields['Returned'] = null;
                    localStorage.setItem('airtableProjects', JSON.stringify(airtableProjects));
                }
                updateOverlay(false);
            }
        } catch (err) {
            console.error('Error toggling shipped:', err);
        }

    } else if (e.target.closest('#delete-btn')) {
        const btn = document.getElementById('delete-btn');
        if (!btn) return;

        if (btn.dataset.confirming !== 'true') {
            // First click: arm the button
            btn.dataset.confirming = 'true';
            btn.textContent = 'Confirm Delete?';
            btn.style.borderColor = 'red';
            btn.style.color = 'red';
            deleteConfirmTimer = setTimeout(() => {
                if (btn.dataset.confirming === 'true') {
                    btn.dataset.confirming = 'false';
                    btn.textContent = 'Delete Project';
                    btn.style.borderColor = '#5a0000';
                    btn.style.color = '#a00000';
                }
            }, 5000);
            return;
        }

        // Second click: confirmed
        clearTimeout(deleteConfirmTimer);
        const recordId = localStorage.getItem('selectedProjectId');
        const email = localStorage.getItem('email');
        if (!recordId || !email) return;
        btn.disabled = true;
        btn.textContent = 'Deleting...';
        try {
            const res = await fetch('/api/delete-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recordId, email })
            });
            const data = await res.json();
            if (data.success) {
                const airtableProjects = JSON.parse(localStorage.getItem('airtableProjects') || '[]');
                localStorage.setItem('airtableProjects', JSON.stringify(airtableProjects.filter(r => r.id !== recordId)));
                localStorage.removeItem('selectedProjectId');
                const overlay = document.getElementById('overlay');
                if (overlay) overlay.style.display = 'none';
                if (typeof fetchProjects === 'function') fetchProjects(email);
            } else {
                btn.disabled = false;
                btn.textContent = 'Error — try again';
                btn.style.borderColor = 'red';
                btn.style.color = 'red';
            }
        } catch {
            btn.disabled = false;
            btn.textContent = 'Error — try again';
        }

    } else if (e.target.closest('#save-override-response-btn')) {
        const recordId = localStorage.getItem('selectedProjectId');
        if (!recordId) return;
        const input = document.getElementById('override-response-input');
        const statusEl = document.getElementById('override-response-status');
        const btn = document.getElementById('save-override-response-btn');
        if (!input || !btn) return;
        const value = input.value.trim() || null;
        btn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving...';
        try {
            const res = await fetch('/api/patch-project-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recordId, field: 'User Override Response', value })
            });
            const data = await res.json();
            if (data.success) {
                const airtableProjects = JSON.parse(localStorage.getItem('airtableProjects') || '[]');
                const record = airtableProjects.find(r => r.id === recordId);
                if (record) {
                    record.fields['User Override Response'] = value;
                    localStorage.setItem('airtableProjects', JSON.stringify(airtableProjects));
                }
                if (statusEl) { statusEl.textContent = 'Saved!'; setTimeout(() => { statusEl.textContent = ''; }, 2000); }
            } else {
                if (statusEl) statusEl.textContent = 'Error saving';
            }
        } catch { if (statusEl) statusEl.textContent = 'Error saving'; }
        btn.disabled = false;

    } else if (e.target.closest('.edit-field-btn')) {
        const field = e.target.closest('.edit-field-btn').dataset.field;
        document.querySelectorAll('.edit-field-input').forEach(row => {
            if (row.dataset.field === field) row.style.display = 'flex';
        });
        document.querySelectorAll('.edit-field-btn').forEach(btn => {
            if (btn.dataset.field === field) btn.style.display = 'none';
        });
        const fieldMap = { 'Description': 'desc-display', 'Code URL': 'codeurl-display', 'Demo URL': 'demourl-display' };
        const displaySpan = document.getElementById(fieldMap[field]);
        if (displaySpan) displaySpan.style.display = 'none';

    } else if (e.target.closest('.cancel-field-btn')) {
        const field = e.target.closest('.cancel-field-btn').dataset.field;
        document.querySelectorAll('.edit-field-input').forEach(row => {
            if (row.dataset.field === field) row.style.display = 'none';
        });
        document.querySelectorAll('.edit-field-btn').forEach(btn => {
            if (btn.dataset.field === field) btn.style.display = 'flex';
        });
        const fieldMap = { 'Description': 'desc-display', 'Code URL': 'codeurl-display', 'Demo URL': 'demourl-display' };
        const displaySpan = document.getElementById(fieldMap[field]);
        if (displaySpan) displaySpan.style.display = '';

    } else if (e.target.closest('.save-field-btn')) {
        const btn = e.target.closest('.save-field-btn');
        const field = btn.dataset.field;
        let input = null;
        document.querySelectorAll('.field-input').forEach(el => { if (el.dataset.field === field) input = el; });
        const recordId = localStorage.getItem('selectedProjectId');
        console.log('Save clicked — field:', field, 'value:', input?.value, 'recordId:', recordId);
        if (!input || !recordId) return;

        const value = input.value.trim();
        try {
            const res = await fetch('/api/patch-project-details', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recordId, field, value })
            });
            const data = await res.json();
            console.log('patch-project-details response:', data);
            if (data.success) {
                const airtableProjects = JSON.parse(localStorage.getItem('airtableProjects') || '[]');
                const record = airtableProjects.find(r => r.id === recordId);
                if (record) {
                    record.fields[field] = value;
                    localStorage.setItem('airtableProjects', JSON.stringify(airtableProjects));
                }
                updateOverlay(false);
            } else {
                console.error('Patch failed:', data);
            }
        } catch (err) {
            console.error('Error saving field:', err);
        }
    }
});

// Handle changes to the project dropdown using delegation
document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'project-select') {
        const selectedProjectName = e.target.value;
        console.log(`Selected project: ${selectedProjectName}`);

        
        // Retrieve the full project list from storage to find the hours (list from hackatime)
        const storedProjects = JSON.parse(localStorage.getItem('projects') || '[]');
        const projectData = storedProjects.find(p => (typeof p === 'string' ? p : p.name) === selectedProjectName);
        const selectedProjectATid = localStorage.getItem('selectedProjectId');

        console.log('Debug - projectData:', projectData);
        console.log('Debug - selectedProjectATid:', selectedProjectATid);

        // Check if projectData exists. If it's a string, we treat hours as 0 or handle accordingly
        if (projectData) {
            const totalSeconds = projectData.total_seconds || 0;
            const hours = (totalSeconds / 3600).toFixed(2);
            localStorage.setItem('selectedProjectHours', hours);
            console.log(`Stored ${hours} hours for project: ${selectedProjectName}`);

            if (selectedProjectATid && projectData && selectedProjectATid != 'N/A') {
                try {
                    const ATPatchresponse = await fetch('api/project-scripts?action=patchHTProjectName', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        
                        }
                        ,
                        body: JSON.stringify({
                            selectedProjectName: selectedProjectName,
                            selectedProjectATid: selectedProjectATid,
                        })
                    })
                    console.log('Fetch response status:', ATPatchresponse.status);
                    const ATPatchData = await ATPatchresponse.json();
                    console.log("ATPatchData", ATPatchData);
                    if (ATPatchresponse.ok && ATPatchData.success) {
                        localStorage.setItem('updateHtName', ATPatchData.data.fields['Hackatime Project Name']);
                        console.log("UpdateHackatimeName",localStorage.getItem('updateHtName'));
                    } 
                    updateOverlay(true);

                } catch (error) {
                    console.error('Error patching project name:', error);
                }
                        


            }
        }

        

        // Refresh the project list display
        if (typeof fetchProjects === 'function') {
            await fetchProjects(localStorage.getItem('email'));
        }
    }
});
async function updateOverlay(change) {
    const overlay = document.getElementById('overlay');

    // Get the current record from the stored Airtable data
    const id = localStorage.getItem('selectedProjectId');
    const airtableProjects = JSON.parse(localStorage.getItem('airtableProjects') || '[]');
    const record = airtableProjects.find(r => r.id === id);
    const htConnected = (record&&record.fields["Hackatime Project Name"])? true:false;

    if (overlay && record) {
        const email = record.fields["Email"] || 'N/A';
        const projectName = record.fields["Project Name"] || 'Unnamed Project';
        
        const htName = (change === true) ? localStorage.getItem('updateHtName') : record.fields["Hackatime Project Name"];
        const storedHT = JSON.parse(localStorage.getItem('projects') || '[]');
        const htProj = storedHT.find(p => (typeof p === 'string' ? p : p.name) === htName);
        const rawSecs = htProj ? (htProj.total_seconds || 0) : 0;

        let hours;
        if (change === true) {
            hours = localStorage.getItem('selectedProjectHours') || '0.00';
        } else {
            hours = (rawSecs / 3600).toFixed(2);
        }

        // Fetch MetroShip hours from project creation date
        let metroshipHours = '0.00';
        const createdDate = record.createdTime ? record.createdTime.split('T')[0] : null;
        const accessToken = localStorage.getItem('htaccessToken') || '';
        if (htName && createdDate && accessToken) {
            try {
                const statsRes = await fetch(`/api/my-hackatime-hours?accessToken=${encodeURIComponent(accessToken)}&projectName=${encodeURIComponent(htName)}&startDate=${createdDate}`);
                const statsData = await statsRes.json();
                if (statsData.success && statsData.projectTotal != null) {
                    metroshipHours = (statsData.projectTotal / 3600).toFixed(2);
                }
            } catch {}
        }

        try {
            // Fetch the external HTML file
            const response = await fetch('project-details-template.html');
            const template = await response.text();

            const desc = record.fields["Description"] || '';
            const codeUrl = record.fields["Code URL"] || '';
            const demoUrl = record.fields["Demo URL"] || '';
            const shipped = record.fields["Shipped"] ? 'true' : 'false';
            const returned = !!record.fields["Returned"];
            const overrideHours = record.fields['Optional - Override Hours Spent'];
            const overrideReason = record.fields['Optional - Override Hours Spent Justification'] || '';
            const userResponse = (record.fields['User Override Response'] || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            let overrideSectionHtml = '';
            if (overrideHours != null || overrideReason || returned) {
                const returnedBanner = returned
                    ? `<div style="background:#2a0000;border:1px solid red;border-radius:4px;padding:8px 12px;margin-bottom:10px;color:red;font-weight:bold;">&#9888; This project was returned by a reviewer. Please address the feedback and re-ship.</div>`
                    : '';
                const overrideBlock = (overrideHours != null || overrideReason)
                    ? `<div style="margin-bottom:8px;">
                        ${overrideHours != null ? `<p style="margin:4px 0;">Hours adjusted to: <span style="color:limegreen;font-weight:bold;">${overrideHours}</span></p>` : ''}
                        ${overrideReason ? `<p style="margin:4px 0;">Reviewer&#39;s note: <span style="color:aqua;">${overrideReason.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></p>` : ''}
                       </div>`
                    : '';
                overrideSectionHtml = `
                <div style="margin-top:16px;padding:12px;border:1px solid orange;border-radius:6px;background:#1a1000;">
                    <p style="color:orange;font-weight:bold;margin:0 0 10px 0;font-size:1.1vw;">Reviewer Feedback</p>
                    ${returnedBanner}
                    ${overrideBlock}
                    <div>
                        <p style="margin:0 0 4px 0;color:#aaa;font-size:0.95vw;">Your response:</p>
                        <textarea id="override-response-input" rows="3"
                            style="background:#111;color:aqua;border:1px solid #444;border-radius:4px;padding:6px;font-size:0.9vw;width:100%;box-sizing:border-box;resize:vertical;font-family:inherit;"
                            placeholder="Respond to the reviewer...">${userResponse}</textarea>
                        <div style="margin-top:6px;display:flex;gap:8px;align-items:center;">
                            <button id="save-override-response-btn"
                                style="cursor:pointer;padding:4px 14px;border:1px solid aqua;background:#111;color:aqua;border-radius:4px;font-family:inherit;">Save Response</button>
                            <span id="override-response-status" style="color:limegreen;font-size:0.85vw;"></span>
                        </div>
                    </div>
                </div>`;
            }

            // Chain replacements for all placeholders
            const finalHtml = template
                .replace(/{{PROJECT_NAME}}/g, projectName)
                .replace(/{{EMAIL}}/g, email)
                .replace(/{{HOURS}}/g, hours)
                .replace(/{{METROSHIP_HOURS}}/g, metroshipHours)
                .replace(/{{DESC}}/g, desc)
                .replace(/{{CODEURL}}/g, codeUrl)
                .replace(/{{DEMOURL}}/g, demoUrl)
                .replace(/{{SHIPPED}}/g, shipped)
                .replace(/{{OVERRIDE_SECTION}}/g, overrideSectionHtml);

            overlay.innerHTML = finalHtml;
            overlay.style.display = 'block';

            // Style the ship button based on shipped state
            const shipBtn = document.getElementById('ship-btn');
            if (shipBtn) {
                if (shipped === 'true') {
                    shipBtn.textContent = '✓ Shipped';
                    shipBtn.style.borderColor = 'limegreen';
                    shipBtn.style.color = 'limegreen';
                } else {
                    shipBtn.textContent = 'Ship Project';
                    shipBtn.style.borderColor = 'aqua';
                    shipBtn.style.color = 'aqua';
                }
            }
        } catch (error) {
            console.error('Error loading project details template:', error);
        }
        //Dropdown menu code
        try {
            const response = await fetch('api/project-scripts?action=getProjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: localStorage.getItem('htaccessToken') }),
            });

            if (!response.ok) throw new Error('Failed to fetch projects from Hackatime');

            const result = await response.json();
            localStorage.setItem('projects', JSON.stringify(result.data.projects)); //Store project JSON list from HT
            const select = document.getElementById('project-select');
            const htProjectName = (change === true)? localStorage.getItem('updateHtName'):record.fields["Hackatime Project Name"];

            //
            if (select && result.success && result.data && Array.isArray(result.data.projects)) {
                if (htConnected===true){
                    const defaultOption = document.createElement('option');
                    defaultOption.value = htProjectName;
                    defaultOption.textContent = htProjectName;
                    select.appendChild(defaultOption);
                }else{
                select.innerHTML = '<option value="">Select a project...</option>';
                }
                result.data.projects.forEach(proj => {
                    console.log("Appending project to select")
                    console.log({proj: proj});
                    const projectName = typeof proj === 'string' ? proj : proj.name;
                    const option = document.createElement('option');
                    option.value = projectName;
                    option.textContent = projectName;
                    select.appendChild(option);
                });
                localStorage.setItem('projects', JSON.stringify(result.data.projects)); //Store project JSON list from HT
                fetchProjects(email);
            }
        } catch (error) {
            console.error('Error connecting project:', error);
        }
    }
}

