const $ = (sel) => document.querySelector(sel);

const tabLogin = $('#tab-login');
const tabSignup = $('#tab-signup');

const loginForm = $('#login-form');
const signupForm = $('#signup-form');

const loginBtn = $('#login-btn');
const signupBtn = $('#signup-btn');

const showSignupLink = $('#show-signup-link');
const showLoginLink = $('#show-login-link');

const authMsg = $('#auth-msg');

function showMsg(text, isError = false) {
    if (!authMsg) return;
    authMsg.style.display = 'block';
    authMsg.textContent = text;
    authMsg.style.color = isError ? '#b91c1c' : '#0f5132';
    setTimeout(() => {
        authMsg.style.display = 'none';
    }, 6000);
}

function showLogin() {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabSignup) tabSignup.classList.remove('active');
    if (loginForm) loginForm.classList.remove('hidden');
    if (signupForm) signupForm.classList.add('hidden');
    if (tabLogin) tabLogin.setAttribute('aria-pressed', 'true');
    if (tabSignup) tabSignup.setAttribute('aria-pressed', 'false');
}

function showSignup() {
    if (tabSignup) tabSignup.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
    if (signupForm) signupForm.classList.remove('hidden');
    if (loginForm) loginForm.classList.add('hidden');
    if (tabSignup) tabSignup.setAttribute('aria-pressed', 'true');
    if (tabLogin) tabLogin.setAttribute('aria-pressed', 'false');
}

if (tabLogin) tabLogin.addEventListener('click', showLogin);
if (tabSignup) tabSignup.addEventListener('click', showSignup);
if (showSignupLink) showSignupLink.addEventListener('click', (e) => { e.preventDefault(); showSignup(); });
if (showLoginLink) showLoginLink.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    let data;
    try {
        data = await res.json();
    } catch (err) {
        throw new Error(`Server returned non-JSON response (status ${res.status})`);
    }
    if (!res.ok) {
        const message = data && data.error ? data.error : `Request failed (status ${res.status})`;
        throw new Error(message);
    }
    return data;
}

async function handleSignup() {
    const full_name = (document.getElementById('su-fullname') || {}).value?.trim();
    const email = (document.getElementById('su-email') || {}).value?.trim();
    const phone = (document.getElementById('su-phone') || {}).value?.trim();
    const country = (document.getElementById('su-country') || {}).value?.trim();
    const role = (document.getElementById('su-role') || {}).value;
    const username = (document.getElementById('su-username') || {}).value?.trim();
    const password = (document.getElementById('su-password') || {}).value;

    if (!full_name || !email || !username || !password) {
        showMsg('Please fill name, email, username and password.', true);
        return;
    }

    if (signupBtn) signupBtn.disabled = true;
    try {
        const payload = { full_name, email, phone, country, role, username, password };

        const data = await fetchJson('/api/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (data && data.success) {
            showMsg('Account created. Redirecting...', false);
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 800);
        } else {
            showMsg('Signup failed (unknown response).', true);
        }
    } catch (err) {
        showMsg(err.message || 'Signup failed', true);
    } finally {
        if (signupBtn) signupBtn.disabled = false;
    }
}

async function handleLogin() {
    const username = (document.getElementById('login-username') || {}).value?.trim();
    const password = (document.getElementById('login-password') || {}).value;

    if (!username || !password) {
        showMsg('Please enter username and password.', true);
        return;
    }

    if (loginBtn) loginBtn.disabled = true;
    try {
        const payload = { username, password };
        const data = await fetchJson('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (data && data.success) {
            showMsg('Login successful. Redirecting...', false);
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 600);
        } else {
            showMsg('Login failed (unknown response).', true);
        }
    } catch (err) {
        showMsg(err.message || 'Login failed', true);
    } finally {
        if (loginBtn) loginBtn.disabled = false;
    }
}

if (signupBtn) signupBtn.addEventListener('click', (e) => { e.preventDefault(); handleSignup(); });
if (loginBtn) loginBtn.addEventListener('click', (e) => { e.preventDefault(); handleLogin(); });

if (loginForm) {
    loginForm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin();
        }
    });
}
if (signupForm) {
    signupForm.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSignup();
        }
    });
}

showLogin();
