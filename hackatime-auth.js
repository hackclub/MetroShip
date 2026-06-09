// Replace 'YOUR_CLIENT_ID' with the Client ID provided by Hack Club OAuth
const CLIENT_ID = '2ciUev1XVQ1kwX5LMTWGnk0V1kabE8fH9tqAvHcWVTY';

async function updateReviewerLink() {
    const email = localStorage.getItem('email');
    const link = document.getElementById('reviewer-link');
    if (!link) return;
    if (!email) { link.style.display = 'none'; return; }
    try {
        const res = await fetch('/api/is-reviewer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const { isReviewer } = await res.json();
        link.style.display = isReviewer ? 'inline' : 'none';
    } catch {
        link.style.display = 'none';
    }
}

// Standardize the redirect URI to the origin root
const HTREDIRECT_URI = window.location.origin + window.location.pathname; // Keep this one as it matches your dashboard
// When using serverless functions, this is often a relative path on your same domain
const HTBACKEND_TOKEN_EXCHANGE_URL = '/api/hackatime-exchange'; // Replace with your actual deployed function URL

document.getElementById('htlogin-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const authUrl = new URL('https://hackatime.hackclub.com/oauth/authorize');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', HTREDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'profile read');

    window.location.href = authUrl.toString();
});

document.getElementById('htlogout-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('htloggedIn');
    localStorage.removeItem('htaccessToken');
    updateAuthUI();
    // Optional: redirect to home or refresh
    window.location.reload();
});

function updateAuthUI() {
    const htisLoggedIn = localStorage.getItem('htloggedIn') === 'true';
    const htloginLink = document.getElementById('htlogin-link');
    const htuserStatus = document.getElementById('htuser-status');
    const htlogoutLink = document.getElementById('htlogout-link');
    const projects = document.getElementById('projects');
    const newProject = document.getElementById('new-project');
    const prizes = document.getElementById('prizes');
    //const projectScript = document.getElementById('project-script');


    if (htisLoggedIn) {
        if (htloginLink) htloginLink.style.display = 'none';
        if (htuserStatus) htuserStatus.style.display = 'inline';
        if (htuserStatus) htuserStatus.textContent = 'Hackatime Logged In \n';
        //if (userStatus) userStatus.style.color = 'red';
        if (htlogoutLink) htlogoutLink.style.display = 'inline';
        if (htlogoutLink) htlogoutLink.textContent = 'Logout';
        if (projects) projects.href = 'projects2.html';
        if (projects) projects.style.display = 'inline';
        //if (loadProjects) loadProjects.style.display = 'inline';
        if (newProject) {
            newProject.textContent = 'New Project';
            const userEmail = localStorage.getItem('email') || '';
            const formBase = 'https://airtable.com/app9IYnpxO1DtNd97/pagMZ83gw96vY9fVc/form';
            newProject.href = userEmail
                ? `${formBase}?prefill_Email=${encodeURIComponent(userEmail)}`
                : formBase;
            newProject.target = '_blank';
        }
        if (prizes) {
            prizes.href = 'prizes.html';
            prizes.style.display = 'inline';
        }

        //if (projectScript) projectScript.src = 'projects2.js';


    } else {
        if (htloginLink) htloginLink.style.display = 'inline';
        if (htloginLink) htloginLink.textContent = 'Login: Hackatime';
        if (htuserStatus) htuserStatus.style.display = 'none';
        if (htlogoutLink) htlogoutLink.style.display = 'none';
        if (projects) projects.style.display = 'none';
        if (projects) projects.href = '#';
        if (prizes) {
            prizes.href = '#';
            prizes.style.display = 'none';
        }

    }
    updateReviewerLink();
}

window.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    if (localStorage.getItem('htloggedIn') === 'false' && !localStorage.getItem('htaccessToken')){
        updateAuthUI();
    }
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (code && !localStorage.getItem('htloggedIn')) { // Check for state and prevent re-exchanging
        console.log('HT Authorization code received:', code);
        HTpostData(code, HTREDIRECT_URI).then(data => {
            if (data.success) {
                localStorage.setItem('htloggedIn', 'true');
                localStorage.setItem('htaccessToken', data.accessToken);
                if (typeof handler === 'function') {
                    handler().then(() => updateReviewerLink());
                }
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

async function HTpostData(code, redirectUri) {
    console.log({code: code});
    console.log({redirectUri: redirectUri});

    const response = await fetch(HTBACKEND_TOKEN_EXCHANGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, redirect_uri: redirectUri }),
    });
  
  return response.json(); // Parse the JSON response from the server
}
