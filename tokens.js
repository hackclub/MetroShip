async function fetchTokens() {
    const accessToken = localStorage.getItem('htaccessToken');
    if (!accessToken) {
        console.log('fetchTokens: no access token, skipping');
        return;
    }

    let email = localStorage.getItem('email');

    if (!email) {
        try {
            const res = await fetch('/api/project-scripts?action=getUserData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken })
            });
            const data = await res.json();
            console.log('fetchTokens getUserData result:', data);
            if (data.success && data.email) {
                email = data.email;
                localStorage.setItem('email', email);
            }
        } catch (err) {
            console.error('fetchTokens: failed to get email:', err);
            return;
        }
    }

    if (!email) {
        console.log('fetchTokens: no email found, skipping');
        return;
    }

    console.log('fetchTokens: fetching tokens for', email);

    try {
        const res = await fetch('/api/user-tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        console.log('fetchTokens getUserTokens result:', data);
        if (data.success) {
            const el = document.getElementById('token-display');
            if (el) el.textContent = `Tickets: ${data.tokens ?? 0}`;
        }
    } catch (err) {
        console.error('fetchTokens: failed to fetch tokens:', err);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('tokens.js loaded, htloggedIn:', localStorage.getItem('htloggedIn'));
    if (localStorage.getItem('htloggedIn') === 'true') {
        fetchTokens();
    }
});
