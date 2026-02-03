const createFetchError = async (response) => {
    let payload = {};
    try {
        payload = await response.json();
    } catch (error) {
        payload = {};
    }
    const message = payload.message || payload.error || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload.error;
    error.details = payload.details;
    error.payload = payload;
    return error;
};

const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });

    if (!response.ok) {
        throw await createFetchError(response);
    }

    return response.json().catch(() => ({}));
};

const showToast = (message, type = 'success') => {
    const container = document.getElementById('toastContainer');
    if (!container) {
        return;
    }
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast--visible');
    }, 10);
    setTimeout(() => {
        toast.classList.remove('toast--visible');
        setTimeout(() => toast.remove(), 200);
    }, 3200);
};

const setErrorBanner = (bannerEl, message, details) => {
    if (!bannerEl) {
        return;
    }
    const messageEl = bannerEl.querySelector('[data-role="error-message"]');
    const copyButton = bannerEl.querySelector('[data-role="error-copy"]');
    if (messageEl) {
        messageEl.textContent = message;
    }
    if (copyButton) {
        copyButton.onclick = async () => {
            const payload = details || {message};
            try {
                await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                showToast('Error details copied.', 'success');
            } catch (error) {
                showToast('Unable to copy details.', 'error');
            }
        };
    }
    bannerEl.hidden = false;
};

const clearErrorBanner = (bannerEl) => {
    if (!bannerEl) {
        return;
    }
    bannerEl.hidden = true;
};

const formatUserDisplay = (user) => {
    if (!user) {
        return 'Not signed in';
    }
    const tag = user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '';
    return `${user.username}${tag}`;
};

const debounce = (callback, wait = 300) => {
    let timeoutId;
    return (...args) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => callback(...args), wait);
    };
};

const initIndexPage = async () => {
    const sessionStatus = document.getElementById('sessionStatus');
    const loginButton = document.getElementById('loginButton');
    const dashboardButton = document.getElementById('dashboardButton');
    const logoutButton = document.getElementById('logoutButton');
    const banner = document.getElementById('banner');

    if (!sessionStatus || !loginButton) {
        return;
    }

    try {
        const data = await fetchJson('/api/me');
        sessionStatus.textContent = `Signed in as ${formatUserDisplay(data.user)}.`;
        loginButton.hidden = true;
        dashboardButton.hidden = false;
        logoutButton.hidden = false;
        if (banner) {
            banner.textContent = '';
            banner.style.display = 'none';
        }
    } catch (error) {
        sessionStatus.textContent = 'You are not signed in yet.';
        loginButton.hidden = false;
        dashboardButton.hidden = true;
        logoutButton.hidden = true;
        if (banner) {
            banner.textContent = 'Log in with Discord to access the dashboard.';
            banner.style.display = 'block';
        }
    }

    logoutButton?.addEventListener('click', async () => {
        try {
            await fetch('/auth/logout', {method: 'POST', credentials: 'include'});
            sessionStatus.textContent = 'Logged out successfully.';
            loginButton.hidden = false;
            dashboardButton.hidden = true;
            logoutButton.hidden = true;
        } catch (error) {
            if (banner) {
                banner.textContent = error.message || 'Failed to log out.';
                banner.style.display = 'block';
            }
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    initIndexPage();
});

window.dashboardApi = {
    fetchJson,
    showToast,
    setErrorBanner,
    clearErrorBanner,
    formatUserDisplay,
    debounce,
};
