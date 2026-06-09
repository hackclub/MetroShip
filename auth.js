// Replace 'YOUR_CLIENT_ID' with the Client ID provided by Hack Club OAuth
const CLIENT_ID = '3fa659eb0cbcf147ed16dee0abdc0962'; 

// Standardize the redirect URI to the origin root
const REDIRECT_URI = window.location.origin + window.location.pathname;
// When using serverless functions, this is often a relative path on your same domain
const BACKEND_TOKEN_EXCHANGE_URL = '/api/exchange-token'; // Replace with your actual deployed function URL

document.getElementById('login-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const authUrl = new URL('https://auth.hackclub.com/oauth/authorize');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'email');
    authUrl.searchParams.set('state', 'hackclub'); // Add state parameter

    window.location.href = authUrl.toString();
});

document.getElementById('logout-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('loggedIn');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('htloggedIn');
    localStorage.removeItem('htaccessToken');
    updateAuthUI();
    // Optional: redirect to home or refresh
    window.location.reload();
});

function updateAuthUI() {
    const isLoggedIn = localStorage.getItem('loggedIn') === 'true';
    const loginLink = document.getElementById('login-link');
    const userStatus = document.getElementById('user-status');
    const logoutLink = document.getElementById('logout-link');
    const projects = document.getElementById('projects');
    const prizes = document.getElementById('prizes');



    if (isLoggedIn) {
        if (loginLink) loginLink.style.display = 'none';
        if (userStatus) userStatus.style.display = 'inline';
        if (userStatus) userStatus.textContent = 'Hack Club Logged In\n';
       // if (userStatus) userStatus.style.color = 'red';
        if (logoutLink) logoutLink.style.display = 'inline';
        if (logoutLink) logoutLink.textContent = 'Logout';
        if (projects) projects.href = 'projects2.html';
        if (projects) projects.style.display = 'inline';
        if (prizes && localStorage.getItem('htloggedIn') === 'true'){
            prizes.href = 'prizes.html';
            prizes.style.display = 'inline';
        }


    } else {
       // if (loginLink) loginLink.style.display = 'inline';
        if (loginLink) loginLink.textContent = 'Login: Hack Club';
        if (userStatus) userStatus.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'none';
        if (projects) projects.style.display = 'none';
        if (projects) projects.href = '#';
        if (prizes) {
            prizes.href = '#';
            prizes.style.display = 'none';
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state'); // Get state parameter

    if (code && state === 'hackclub' && !localStorage.getItem('loggedIn')) { // Check for state
        console.log('Authorization code received:', code);
        HCpostData(code, REDIRECT_URI).then(data => {
            if (data.success) {
                localStorage.setItem('loggedIn', 'true');
                localStorage.setItem('accessToken', data.accessToken);
                // Clean up URL and redirect/refresh
                const cleanUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
                updateAuthUI();
            } else {
                console.error('Authentication failed:', data.error);
                alert('Login failed: ' + (data.error || 'Unknown error'));
            }
        });
    }
});

async function HCpostData(code, redirectUri) {
  const response = await fetch(BACKEND_TOKEN_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code, redirect_uri: redirectUri }),
  });

  return response.json(); // Parse the JSON response from the server
}
