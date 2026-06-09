let allRecords = [];
const undoStack = [];

// ── Sorting / filtering ───────────────────────────────────────────────────────

function getSortedFiltered(query) {
    let records = [...allRecords];
    if (query) {
        const q = query.toLowerCase();
        records = records.filter(r => {
            const f = r.fields;
            return (f['Project Name'] || '').toLowerCase().includes(q)
                || (f['Email'] || '').toLowerCase().includes(q)
                || (f['Description'] || '').toLowerCase().includes(q);
        });
    }
    records.sort((a, b) => (a.fields['Verified'] ? 1 : 0) - (b.fields['Verified'] ? 1 : 0));
    return records;
}

function refreshDisplay() {
    const query = document.getElementById('reviewer-search')?.value || '';
    const filtered = getSortedFiltered(query);
    renderProjects(filtered);
    updateUndoBtn();
    autoLoadClaimedHours(filtered);
}

async function autoLoadClaimedHours(records) {
    const reviewerEmail = localStorage.getItem('email') || '';
    if (!reviewerEmail) return;
    await Promise.all(records.map(async record => {
        const f = record.fields;
        const email = f['Email'] || '';
        const projectName = f['Hackatime Project Name'] || '';
        if (!email || !projectName) return;
        const startDate = record.createdTime ? record.createdTime.split('T')[0] : '';
        try {
            const params = new URLSearchParams({ email, reviewerEmail, summaryOnly: 'true' });
            if (projectName) params.set('projectName', projectName);
            if (startDate) params.set('startDate', startDate);
            const res = await fetch(`/api/hackatime-heatmap?${params}`);
            const data = await res.json();
            if (data.success && data.projectTotal != null) {
                const claimedEl = document.getElementById(`claimed-hours-${record.id}`);
                if (claimedEl) {
                    claimedEl.textContent = (data.projectTotal / 3600).toFixed(1) + ' hrs';
                    claimedEl.style.color = 'limegreen';
                }
            }
        } catch {}
    }));
}

// ── Undo ──────────────────────────────────────────────────────────────────────

function updateUndoBtn() {
    const btn = document.getElementById('undo-btn');
    if (!btn) return;
    if (undoStack.length > 0) {
        const last = undoStack[undoStack.length - 1];
        const action = last.previousVerified ? 'Unverify' : 'Verify';
        btn.textContent = `Undo: ${action} "${last.projectName}"`;
        btn.style.borderColor = 'orange';
        btn.style.color = 'orange';
        btn.disabled = false;
    } else {
        btn.textContent = 'Undo';
        btn.style.borderColor = '#444';
        btn.style.color = '#555';
        btn.disabled = true;
    }
}

async function doToggle(recordId, newVerified) {
    const reviewerEmail = localStorage.getItem('email');
    const res = await fetch('/api/toggle-verified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, verified: newVerified, reviewerEmail })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    const rec = allRecords.find(r => r.id === recordId);
    if (rec) rec.fields['Verified'] = newVerified;
}

// ── Hackatime stats renderer ──────────────────────────────────────────────────

function buildHackatimeStats(result, targetProject, baselineSeconds) {
    const fmtHrs = secs => (secs / 3600).toFixed(1) + ' hrs';
    const projectTotal = result.projectTotal;
    const days = result.days || [];

    const allTimeSecs = (projectTotal != null && baselineSeconds != null)
        ? projectTotal + baselineSeconds : null;

    const maxSecs = Math.max(...days.map(d => d.seconds), 1);
    const cells = days.map(d => {
        const ratio = d.seconds / maxSecs;
        const color = d.seconds === 0 ? '#1a1a1a'
            : ratio < 0.25 ? '#0d4a1e'
            : ratio < 0.5  ? '#1a7a34'
            : ratio < 0.75 ? '#26a847' : '#2ecc71';
        const hrs = (d.seconds / 3600).toFixed(1);
        return `<div title="${d.date || ''}: ${hrs}h" style="width:11px;height:11px;background:${color};border-radius:2px;flex-shrink:0;"></div>`;
    }).join('');

    return `<div style="font-size:0.85vw;">
        ${allTimeSecs !== null
            ? `<div><span style="color:#aaa;">Total Time Logged:</span> <span style="color:aqua;font-weight:bold;">${fmtHrs(allTimeSecs)}</span></div>`
            : ''}
        ${projectTotal !== null
            ? `<div><span style="color:#aaa;">Time Logged as MetroShip:</span> <span style="color:limegreen;font-weight:bold;">${fmtHrs(projectTotal)}</span></div>`
            : `<span style="color:#888;">No project data found</span>`}
        ${days.length > 0 ? `
        <div style="margin-top:6px;">
            <div style="color:#555;font-size:0.75vw;margin-bottom:3px;">Last 30 days:</div>
            <div style="display:flex;flex-wrap:wrap;gap:2px;">${cells}</div>
        </div>` : ''}
    </div>`;
}

async function loadHackatimeStats(cardId, email, projectName, startDate, baselineSeconds) {
    const container = document.getElementById(`heatmap-${cardId}`);
    if (!container) return;
    container.innerHTML = '<span style="color:#555;font-size:0.8vw;">Loading…</span>';
    try {
        const reviewerEmail = localStorage.getItem('email') || '';
        const params = new URLSearchParams({ email, reviewerEmail });
        if (projectName) params.set('projectName', projectName);
        if (startDate) params.set('startDate', startDate);
        const res = await fetch(`/api/hackatime-heatmap?${params}`);
        const data = await res.json();
        if (data.success && data.type === 'stats') {
            container.innerHTML = buildHackatimeStats(data, projectName, baselineSeconds);
            // Update claimed hours to Hackatime-computed value
            if (data.projectTotal !== null) {
                const claimedEl = document.getElementById(`claimed-hours-${cardId}`);
                if (claimedEl) {
                    claimedEl.textContent = (data.projectTotal / 3600).toFixed(1) + ' hrs';
                    claimedEl.style.color = 'limegreen';
                }
            }
        } else if (data.reason === 'no_token') {
            container.innerHTML = '<span style="color:#555;font-size:0.8vw;">User must re-login for stats to appear</span>';
        } else {
            container.innerHTML = '<span style="color:#555;font-size:0.8vw;">No Hackatime data available</span>';
        }
    } catch (err) {
        console.error('loadHackatimeStats error:', err);
        container.innerHTML = '<span style="color:#555;font-size:0.8vw;">Stats unavailable</span>';
    }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderProjects(records) {
    const container = document.getElementById('reviewer-projects');
    if (!records || records.length === 0) {
        container.innerHTML = '<p style="color:aqua;">No projects match.</p>';
        return;
    }
    container.innerHTML = records.map(record => {
        const f = record.fields;
        const verified = !!f['Verified'];
        const codeUrl = f['Code URL']
            ? `<a href="${f['Code URL']}" target="_blank" style="color:aqua;">${f['Code URL']}</a>`
            : '<span style="color:#555;">N/A</span>';
        const demoUrl = f['Demo URL']
            ? `<a href="${f['Demo URL']}" target="_blank" style="color:aqua;">${f['Demo URL']}</a>`
            : '<span style="color:#555;">N/A</span>';

        const claimedHours = f['Hours (Computed)'] != null ? f['Hours (Computed)']
            : f['Hours Logged'] != null ? f['Hours Logged']
            : f['Hours'] != null ? f['Hours'] : null;
        const overrideHours = f['Optional - Override Hours Spent'] != null ? f['Optional - Override Hours Spent'] : '';
        const overrideReason = f['Optional - Override Hours Spent Justification'] || '';
        const effectiveHours = overrideHours !== '' ? overrideHours : claimedHours;

        const hoursHtml = `
            <p style="margin:4px 0;font-size:1vw;">
                <strong>Claimed Hours:</strong>
                <span id="claimed-hours-${record.id}" style="color:aqua;">${claimedHours !== null ? claimedHours : '—'}</span>
                ${effectiveHours !== claimedHours ? `<span style="color:limegreen;margin-left:8px;">(Override: ${effectiveHours})</span>` : ''}
            </p>
            <div style="margin:4px 0 8px 0;font-size:0.9vw;display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <strong>Override Hours:</strong>
                    <input type="number" min="0" step="0.5"
                        class="override-hours-input"
                        data-id="${record.id}"
                        value="${overrideHours}"
                        placeholder="Optional"
                        style="background:#1a1a1a;color:aqua;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:0.9vw;width:80px;font-family:inherit;">
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <strong>Reason:</strong>
                    <input type="text"
                        class="override-reason-input"
                        data-id="${record.id}"
                        value="${overrideReason.replace(/"/g, '&quot;')}"
                        placeholder="Short reason for override..."
                        style="background:#1a1a1a;color:aqua;border:1px solid #444;border-radius:4px;padding:2px 6px;font-size:0.9vw;width:260px;font-family:inherit;">
                    <button class="save-override-btn" data-id="${record.id}"
                        style="cursor:pointer;padding:2px 10px;font-size:0.85vw;border-radius:4px;border:1px solid aqua;background:#111;color:aqua;font-family:inherit;">Save</button>
                    <span class="override-status" data-id="${record.id}" style="color:limegreen;font-size:0.8vw;"></span>
                </div>
            </div>`;

        return `
        <div class="reviewer-card" data-id="${record.id}" style="
            background:#111;
            border:1px solid ${verified ? 'limegreen' : 'rgb(255,0,144)'};
            border-radius:8px;
            padding:16px 20px;
            margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="flex:1;min-width:0;">
                    <h3 style="color:aqua;margin:0 0 8px 0;font-size:1.4vw;">${f['Project Name'] || 'Unnamed'}</h3>
                    <p style="margin:4px 0;font-size:1vw;"><strong>Email:</strong> <span style="color:aqua;">${f['Email'] || 'N/A'}</span></p>
                    <p style="margin:4px 0;font-size:1vw;"><strong>Description:</strong> <span style="color:aqua;">${f['Description'] || 'N/A'}</span></p>
                    <p style="margin:4px 0;font-size:1vw;"><strong>Code URL:</strong> ${codeUrl}</p>
                    <p style="margin:4px 0;font-size:1vw;"><strong>Demo URL:</strong> ${demoUrl}</p>
                    ${hoursHtml}
                    <div style="margin-top:10px;">
                        <p style="margin:0 0 4px 0;font-size:0.85vw;color:#888;">Hackatime stats (past year - project: ${f['Hackatime Project Name'] || 'all'}):</p>
                        <div id="heatmap-${record.id}">
                            <button class="load-heatmap-btn"
                                data-id="${record.id}"
                                data-email="${(f['Email'] || '').replace(/"/g, '&quot;')}"
                                data-project="${(f['Hackatime Project Name'] || '').replace(/"/g, '&quot;')}"
                                data-start="${(record.createdTime ? record.createdTime.split('T')[0] : '').replace(/"/g, '&quot;')}"
                                data-baseline=""
                                style="cursor:pointer;padding:2px 10px;font-size:0.8vw;border-radius:4px;border:1px solid #555;background:#111;color:#888;font-family:inherit;">
                                Load Stats
                            </button>
                        </div>
                    </div>
                </div>
                <button class="verify-btn"
                    data-id="${record.id}"
                    data-name="${(f['Project Name'] || 'Unnamed').replace(/"/g, '&quot;')}"
                    data-verified="${verified}"
                    style="cursor:pointer;padding:8px 16px;font-size:1vw;border-radius:6px;font-family:inherit;flex-shrink:0;margin-left:16px;
                        border:2px solid ${verified ? 'limegreen' : '#888'};
                        background:#111;
                        color:${verified ? 'limegreen' : '#888'};">
                    ${verified ? '&#10003; Verified' : 'Mark Verified'}
                </button>
            </div>
        </div>`;
    }).join('');
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadShippedProjects(reviewerEmail) {
    const container = document.getElementById('reviewer-projects');
    container.innerHTML = '<p style="color:aqua;">Loading...</p>';
    try {
        const res = await fetch('/api/get-shipped-projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewerEmail })
        });
        const data = await res.json();
        if (!data.success) {
            container.innerHTML = `<p style="color:red;">Error: ${data.error}</p>`;
            return;
        }
        allRecords = data.records;
        refreshDisplay();
    } catch (err) {
        container.innerHTML = '<p style="color:red;">Failed to load projects.</p>';
        console.error(err);
    }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function initReviewer() {
    let email = localStorage.getItem('email');
    if (!email && localStorage.getItem('htloggedIn') === 'true') {
        try {
            const res = await fetch('/api/project-scripts?action=getUserData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: localStorage.getItem('htaccessToken') })
            });
            const data = await res.json();
            if (data.success && data.email) { email = data.email; localStorage.setItem('email', email); }
        } catch (err) { console.error('Failed to get email:', err); }
    }
    const gate = document.getElementById('reviewer-gate');
    const content = document.getElementById('reviewer-content');
    if (!email) { gate.style.display = 'block'; return; }
    const checkRes = await fetch('/api/is-reviewer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    const { isReviewer } = await checkRes.json();
    if (!isReviewer) { gate.style.display = 'block'; return; }
    content.style.display = 'block';
    await loadShippedProjects(email);
}

// ── Event handlers ────────────────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
    const verifyBtn = e.target.closest('.verify-btn');
    if (verifyBtn) {
        const id = verifyBtn.dataset.id;
        const projectName = verifyBtn.dataset.name || id;
        const currentVerified = verifyBtn.dataset.verified === 'true';
        const newVerified = !currentVerified;
        try {
            await doToggle(id, newVerified);
            undoStack.push({ recordId: id, projectName, previousVerified: currentVerified });
            refreshDisplay();
        } catch (err) { console.error('Error toggling verified:', err); }
        return;
    }

    if (e.target.closest('#undo-btn')) {
        if (undoStack.length === 0) return;
        const { recordId, previousVerified } = undoStack.pop();
        try {
            await doToggle(recordId, previousVerified);
            refreshDisplay();
        } catch (err) { console.error('Error undoing:', err); }
        return;
    }

    const saveOverrideBtn = e.target.closest('.save-override-btn');
    if (saveOverrideBtn) {
        const id = saveOverrideBtn.dataset.id;
        const hoursInput = document.querySelector(`.override-hours-input[data-id="${id}"]`);
        const reasonInput = document.querySelector(`.override-reason-input[data-id="${id}"]`);
        const statusEl = document.querySelector(`.override-status[data-id="${id}"]`);
        if (!hoursInput) return;
        const hoursValue = hoursInput.value === '' ? null : parseFloat(hoursInput.value);
        const reasonValue = reasonInput ? (reasonInput.value.trim() || null) : null;
        saveOverrideBtn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving...';
        try {
            const [hoursRes, reasonRes] = await Promise.all([
                fetch('/api/patch-project-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recordId: id, field: 'Optional - Override Hours Spent', value: hoursValue })
                }),
                fetch('/api/patch-project-details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recordId: id, field: 'Optional - Override Hours Spent Justification', value: reasonValue })
                })
            ]);
            const [hoursData, reasonData] = await Promise.all([hoursRes.json(), reasonRes.json()]);
            if (hoursData.success && reasonData.success) {
                const rec = allRecords.find(r => r.id === id);
                if (rec) {
                    rec.fields['Optional - Override Hours Spent'] = hoursValue;
                    rec.fields['Optional - Override Hours Spent Justification'] = reasonValue;
                }
                if (statusEl) { statusEl.textContent = 'Saved'; setTimeout(() => { statusEl.textContent = ''; }, 2000); }
            } else {
                if (statusEl) statusEl.textContent = 'Error saving';
            }
        } catch { if (statusEl) statusEl.textContent = 'Error saving'; }
        saveOverrideBtn.disabled = false;
        return;
    }

    const loadStatsBtn = e.target.closest('.load-heatmap-btn');
    if (loadStatsBtn) {
        const baseline = loadStatsBtn.dataset.baseline !== '' ? parseFloat(loadStatsBtn.dataset.baseline) : null;
        loadHackatimeStats(loadStatsBtn.dataset.id, loadStatsBtn.dataset.email, loadStatsBtn.dataset.project, loadStatsBtn.dataset.start, baseline);
        return;
    }
});

document.addEventListener('input', (e) => {
    if (e.target.id === 'reviewer-search') refreshDisplay();
});

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('htloggedIn') === 'true') {
        initReviewer();
    } else {
        document.getElementById('reviewer-gate').style.display = 'block';
    }
});
