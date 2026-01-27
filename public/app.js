const state = {
    guilds: [],
    selectedGuildId: null,
};

const elements = {
    loginButton: document.getElementById('loginButton'),
    logoutButton: document.getElementById('logoutButton'),
    sessionStatus: document.getElementById('sessionStatus'),
    guildCard: document.getElementById('guildCard'),
    warningsCard: document.getElementById('warningsCard'),
    guildSelect: document.getElementById('guildSelect'),
    permissionsEditor: document.getElementById('permissionsEditor'),
    updatePermissionsButton: document.getElementById('updatePermissionsButton'),
    rolesList: document.getElementById('rolesList'),
    warningUserId: document.getElementById('warningUserId'),
    loadWarningsButton: document.getElementById('loadWarningsButton'),
    warningsList: document.getElementById('warningsList'),
    newWarningUserId: document.getElementById('newWarningUserId'),
    warningReason: document.getElementById('warningReason'),
    addWarningButton: document.getElementById('addWarningButton'),
    warningResult: document.getElementById('warningResult'),
};

const setStatus = (message, isAuthed) => {
    elements.sessionStatus.textContent = message;
    elements.logoutButton.hidden = !isAuthed;
    elements.guildCard.hidden = !isAuthed;
    elements.warningsCard.hidden = !isAuthed;
};

const fetchJson = async (url, options) => {
    const response = await fetch(url, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        ...options,
    });

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = body.error || `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    return response.json().catch(() => ({}));
};

const loadGuilds = async () => {
    const data = await fetchJson('/api/guilds');
    state.guilds = data.guilds || [];
    elements.guildSelect.innerHTML = '';

    state.guilds.forEach((guild) => {
        const option = document.createElement('option');
        option.value = guild.id;
        option.textContent = guild.name;
        elements.guildSelect.appendChild(option);
    });

    if (state.guilds.length > 0) {
        state.selectedGuildId = state.guilds[0].id;
        elements.guildSelect.value = state.selectedGuildId;
        await loadGuildDetails();
    }
};

const renderRoles = (roles) => {
    elements.rolesList.innerHTML = '';
    roles.forEach((role) => {
        const item = document.createElement('li');
        item.textContent = `${role.name} (${role.id})`;
        elements.rolesList.appendChild(item);
    });

    if (roles.length === 0) {
        const item = document.createElement('li');
        item.textContent = 'No roles returned.';
        elements.rolesList.appendChild(item);
    }
};

const loadGuildDetails = async () => {
    if (!state.selectedGuildId) {
        return;
    }

    const [permissionsData, rolesData] = await Promise.all([
        fetchJson(`/api/guilds/${state.selectedGuildId}/permissions`),
        fetchJson(`/api/guilds/${state.selectedGuildId}/roles`),
    ]);

    elements.permissionsEditor.value = JSON.stringify(permissionsData.permissions || {}, null, 2);
    renderRoles(rolesData.roles || []);
};

const updatePermissions = async () => {
    if (!state.selectedGuildId) {
        return;
    }

    const rawValue = elements.permissionsEditor.value.trim();
    if (!rawValue) {
        return;
    }

    let payload;
    try {
        payload = JSON.parse(rawValue);
    } catch (error) {
        elements.permissionsEditor.focus();
        throw new Error('Permissions JSON is invalid.');
    }

    const data = await fetchJson(`/api/guilds/${state.selectedGuildId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    });

    elements.permissionsEditor.value = JSON.stringify(data.permissions || {}, null, 2);
};

const loadWarnings = async (userId) => {
    if (!state.selectedGuildId || !userId) {
        return;
    }

    const data = await fetchJson(`/api/guilds/${state.selectedGuildId}/warnings/${userId}`);
    elements.warningsList.innerHTML = '';

    const warnings = data.warnings || [];
    if (warnings.length === 0) {
        const item = document.createElement('li');
        item.textContent = 'No warnings found.';
        elements.warningsList.appendChild(item);
        return;
    }

    warnings.forEach((warning) => {
        const item = document.createElement('li');
        const issuedAt = warning.createdAt ? new Date(warning.createdAt).toLocaleString() : 'Unknown date';
        item.textContent = `${warning.reason} — ${issuedAt}`;
        elements.warningsList.appendChild(item);
    });
};

const addWarning = async () => {
    if (!state.selectedGuildId) {
        return;
    }

    const userId = elements.newWarningUserId.value.trim();
    const reason = elements.warningReason.value.trim();

    if (!userId || !reason) {
        elements.warningResult.textContent = 'User ID and reason are required.';
        return;
    }

    const data = await fetchJson(`/api/guilds/${state.selectedGuildId}/warnings/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
    });

    elements.warningResult.textContent = `Warning added: ${data.warning?.reason || reason}`;
    elements.warningReason.value = '';
};

const showError = (message) => {
    elements.warningResult.textContent = message;
};

const init = async () => {
    elements.loginButton.addEventListener('click', () => {
        window.location.href = '/auth/discord';
    });

    elements.logoutButton.addEventListener('click', async () => {
        await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
        setStatus('Logged out. Sign in to manage guilds.', false);
    });

    elements.guildSelect.addEventListener('change', async (event) => {
        state.selectedGuildId = event.target.value;
        await loadGuildDetails();
    });

    elements.updatePermissionsButton.addEventListener('click', async () => {
        elements.warningResult.textContent = '';
        try {
            await updatePermissions();
            elements.warningResult.textContent = 'Permissions updated successfully.';
        } catch (error) {
            showError(error.message);
        }
    });

    elements.loadWarningsButton.addEventListener('click', async () => {
        try {
            await loadWarnings(elements.warningUserId.value.trim());
        } catch (error) {
            showError(error.message);
        }
    });

    elements.addWarningButton.addEventListener('click', async () => {
        try {
            await addWarning();
        } catch (error) {
            showError(error.message);
        }
    });

    try {
        await loadGuilds();
        setStatus('Authenticated. Choose a guild to get started.', true);
    } catch (error) {
        setStatus('Sign in with Discord to manage your guilds.', false);
    }
};

init();
