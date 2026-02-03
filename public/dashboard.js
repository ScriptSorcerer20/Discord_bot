const state = {
    guilds: [],
    filteredGuilds: [],
    selectedGuildId: null,
    roles: [],
    permissions: null,
    commands: [],
    botGuildIds: new Set(),
    botInstalled: false,
    dirty: false,
    originalPermissions: null,
    selectedWarningUser: null,
};

const elements = {
    errorBanner: document.getElementById('errorBanner'),
    userDisplay: document.getElementById('userDisplay'),
    sessionExpiry: document.getElementById('sessionExpiry'),
    logoutButton: document.getElementById('logoutButton'),
    guildList: document.getElementById('guildList'),
    guildListSkeleton: document.getElementById('guildListSkeleton'),
    guildEmpty: document.getElementById('guildEmpty'),
    guildSearch: document.getElementById('guildSearch'),
    guildHeaderIcon: document.getElementById('guildHeaderIcon'),
    guildHeaderName: document.getElementById('guildHeaderName'),
    guildStatusBadge: document.getElementById('guildStatusBadge'),
    guildStatusNote: document.getElementById('guildStatusNote'),
    inviteButton: document.getElementById('inviteButton'),
    refreshBotButton: document.getElementById('refreshBotButton'),
    tabs: document.querySelectorAll('.tab'),
    settingsPanel: document.getElementById('settingsPanel'),
    permissionsPanel: document.getElementById('permissionsPanel'),
    warningsPanel: document.getElementById('warningsPanel'),
    adminRolesPicker: document.getElementById('adminRolesPicker'),
    adminUserInput: document.getElementById('adminUserInput'),
    addAdminUserButton: document.getElementById('addAdminUserButton'),
    adminUserChips: document.getElementById('adminUserChips'),
    newCommandInput: document.getElementById('newCommandInput'),
    addCommandButton: document.getElementById('addCommandButton'),
    commandsList: document.getElementById('commandsList'),
    commandsEmpty: document.getElementById('commandsEmpty'),
    clearAllCommands: document.getElementById('clearAllCommands'),
    copyFromGuild: document.getElementById('copyFromGuild'),
    savePermissionsButton: document.getElementById('savePermissionsButton'),
    discardChangesButton: document.getElementById('discardChangesButton'),
    saveBar: document.getElementById('saveBar'),
    botInactiveCallout: document.getElementById('botInactiveCallout'),
    warningsUserInput: document.getElementById('warningsUserInput'),
    warningsUserSearch: document.getElementById('warningsUserSearch'),
    warningsUserResults: document.getElementById('warningsUserResults'),
    warningsSelectedUser: document.getElementById('warningsSelectedUser'),
    fetchWarningsButton: document.getElementById('fetchWarningsButton'),
    clearWarningsButton: document.getElementById('clearWarningsButton'),
    warningsList: document.getElementById('warningsList'),
    warningsEmpty: document.getElementById('warningsEmpty'),
    warningsSpinner: document.getElementById('warningsSpinner'),
    newWarningUserInput: document.getElementById('newWarningUserInput'),
    warningReasonInput: document.getElementById('warningReasonInput'),
    warningCharCount: document.getElementById('warningCharCount'),
    addWarningButton: document.getElementById('addWarningButton'),
    warningStatus: document.getElementById('warningStatus'),
    contentSkeleton: document.getElementById('contentSkeleton'),
    copyModal: document.getElementById('copyModal'),
    copyGuildSelect: document.getElementById('copyGuildSelect'),
    cancelCopyButton: document.getElementById('cancelCopyButton'),
    confirmCopyButton: document.getElementById('confirmCopyButton'),
};

const dashboardApi = window.dashboardApi;
const fetchDashboardJson = dashboardApi.fetchJson;

const COMMAND_NAME_REGEX = /^[a-z0-9_-]{1,32}$/i;

const clonePermissions = (permissions) => JSON.parse(JSON.stringify(permissions || {}));

const normalizePermissions = (permissions = {}) => ({
    adminRoleIds: Array.isArray(permissions.adminRoleIds) ? permissions.adminRoleIds : [],
    adminUserIds: Array.isArray(permissions.adminUserIds) ? permissions.adminUserIds : [],
    commandPermissions: permissions.commandPermissions || {},
});

const setLoadingGuilds = (isLoading) => {
    elements.guildList.hidden = isLoading;
    elements.guildListSkeleton.hidden = !isLoading;
};

const setLoadingDetails = (isLoading) => {
    elements.contentSkeleton.hidden = !isLoading;
    if (isLoading) {
        elements.settingsPanel.hidden = true;
        elements.permissionsPanel.hidden = true;
        elements.warningsPanel.hidden = true;
        return;
    }
    const activeTab = document.querySelector('.tab.active')?.dataset.tab || 'settings';
    elements.settingsPanel.hidden = activeTab !== 'settings';
    elements.permissionsPanel.hidden = activeTab !== 'permissions';
    elements.warningsPanel.hidden = activeTab !== 'warnings';
};

const setDirty = (isDirty) => {
    state.dirty = isDirty;
    elements.saveBar.hidden = !isDirty;
};

const parseIdList = (value) => {
    if (!value) {
        return [];
    }
    return Array.from(
        new Set(
            value
                .split(/[\s,\n]+/)
                .map((entry) => entry.trim())
                .filter(Boolean),
        ),
    );
};

const setError = (error) => {
    if (!error) {
        dashboardApi.clearErrorBanner(elements.errorBanner);
        return;
    }
    dashboardApi.setErrorBanner(elements.errorBanner, error.message || 'Something went wrong.', error.payload || error);
};

const handleFetchError = (error, fallback) => {
    if (error?.code === 'BOT_NOT_IN_GUILD') {
        return;
    }
    setError(error || {message: fallback});
};

const updateGuildHeader = (guild) => {
    if (!guild) {
        elements.guildHeaderName.textContent = 'Select a guild';
        elements.guildHeaderIcon.src = '';
        elements.guildStatusBadge.textContent = '';
        elements.guildStatusNote.textContent = '';
        return;
    }
    elements.guildHeaderName.textContent = guild.name;
    if (guild.icon) {
        elements.guildHeaderIcon.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
    } else {
        elements.guildHeaderIcon.removeAttribute('src');
    }
    if (state.botInstalled) {
        elements.guildStatusBadge.textContent = 'Bot added';
        elements.guildStatusBadge.className = 'status-badge status-badge--ok';
        elements.guildStatusNote.textContent = 'Settings are active.';
    } else {
        elements.guildStatusBadge.textContent = 'Not added';
        elements.guildStatusBadge.className = 'status-badge status-badge--warn';
        elements.guildStatusNote.textContent = 'The bot isn’t in this server yet. Invite it to configure settings.';
    }
};

const renderGuilds = () => {
    elements.guildList.innerHTML = '';
    if (state.filteredGuilds.length === 0) {
        elements.guildEmpty.hidden = false;
        return;
    }
    elements.guildEmpty.hidden = true;
    state.filteredGuilds.forEach((guild) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `guild-item${state.selectedGuildId === guild.id ? ' active' : ''}`;
        item.dataset.guildId = guild.id;
        const info = document.createElement('div');
        info.className = 'guild-item__info';
        const icon = document.createElement('img');
        if (guild.icon) {
            icon.src = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`;
            icon.alt = `${guild.name} icon`;
        } else {
            icon.alt = '';
        }
        const name = document.createElement('span');
        name.textContent = guild.name;
        info.appendChild(icon);
        info.appendChild(name);

        const badge = document.createElement('span');
        const isBotInGuild = state.botGuildIds.size === 0 ? null : state.botGuildIds.has(guild.id);
        badge.className = `status-pill ${isBotInGuild ? 'status-pill--ok' : 'status-pill--warn'}`;
        const dot = document.createElement('span');
        dot.className = 'status-pill__dot';
        const text = document.createElement('span');
        text.textContent = isBotInGuild ? 'Bot added' : 'Not added';
        badge.appendChild(dot);
        badge.appendChild(text);

        item.appendChild(info);
        item.appendChild(badge);
        item.addEventListener('click', () => selectGuild(guild.id));
        elements.guildList.appendChild(item);
    });
};

const renderRolePicker = (container, roles, selectedIds, onChange, options = {}) => {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = `multi-picker${options.disabled ? ' multi-picker--disabled' : ''}`;

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'multi-picker__search';
    search.placeholder = 'Search roles';
    const list = document.createElement('div');
    list.className = 'multi-picker__list';
    const chips = document.createElement('div');
    chips.className = 'chip-list';

    const renderChips = () => {
        chips.innerHTML = '';
        if (selectedIds.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'muted';
            empty.textContent = options.emptyMessage || 'No roles selected.';
            chips.appendChild(empty);
            return;
        }
        selectedIds.forEach((roleId) => {
            const role = roles.find((entry) => entry.id === roleId);
            if (!role) {
                return;
            }
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.textContent = role.name;
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.textContent = '✕';
            removeButton.addEventListener('click', () => {
                const next = selectedIds.filter((id) => id !== roleId);
                selectedIds.splice(0, selectedIds.length, ...next);
                onChange([...selectedIds]);
                renderList(search.value);
                renderChips();
            });
            chip.appendChild(removeButton);
            chips.appendChild(chip);
        });
    };

    const renderList = (query = '') => {
        list.innerHTML = '';
        const filteredRoles = roles
            .filter((role) => role.name.toLowerCase().includes(query.toLowerCase()))
            .sort((a, b) => b.position - a.position);
        if (filteredRoles.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'muted';
            empty.textContent = 'No matching roles.';
            list.appendChild(empty);
            return;
        }
        filteredRoles.forEach((role) => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = selectedIds.includes(role.id);
            checkbox.disabled = options.disabled;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    if (!selectedIds.includes(role.id)) {
                        selectedIds.push(role.id);
                    }
                } else {
                    const next = selectedIds.filter((id) => id !== role.id);
                    selectedIds.splice(0, selectedIds.length, ...next);
                }
                onChange([...selectedIds]);
                renderChips();
            });
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(role.name));
            list.appendChild(label);
        });
    };

    search.addEventListener('input', () => renderList(search.value));

    renderList();
    renderChips();

    wrapper.appendChild(search);
    wrapper.appendChild(list);
    wrapper.appendChild(chips);
    container.appendChild(wrapper);
};

const renderAdminUsers = () => {
    elements.adminUserChips.innerHTML = '';
    const adminUserIds = state.permissions?.adminUserIds || [];
    if (adminUserIds.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'muted';
        empty.textContent = 'No admin users added.';
        elements.adminUserChips.appendChild(empty);
        return;
    }

    adminUserIds.forEach((userId) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = userId;
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = '✕';
        removeButton.addEventListener('click', () => {
            state.permissions.adminUserIds = adminUserIds.filter((id) => id !== userId);
            setDirty(true);
            renderAdminUsers();
        });
        chip.appendChild(removeButton);
        elements.adminUserChips.appendChild(chip);
    });
};

const formatMemberDisplay = (member) => {
    const user = member?.user || {};
    const displayName = member?.nick || user.global_name || user.username || 'Unknown user';
    const tag = user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '';
    return `${displayName}${tag}`;
};

const setSelectedWarningUser = (member) => {
    state.selectedWarningUser = member || null;
    if (!member) {
        elements.warningsSelectedUser.textContent = 'No user selected.';
        return;
    }
    elements.warningsSelectedUser.textContent = `${formatMemberDisplay(member)} (${member.id})`;
    elements.warningsUserInput.value = member.id;
    elements.newWarningUserInput.value = member.id;
};

const setManualWarningUser = (userId) => {
    state.selectedWarningUser = null;
    if (!userId) {
        elements.warningsSelectedUser.textContent = 'No user selected.';
        return;
    }
    elements.warningsSelectedUser.textContent = `Using manual ID: ${userId}`;
};

const resetWarningSelection = () => {
    setSelectedWarningUser(null);
    elements.warningsUserResults.innerHTML = '';
    elements.warningsUserSearch.value = '';
    elements.warningsUserInput.value = '';
    elements.newWarningUserInput.value = '';
    elements.warningsList.innerHTML = '';
    elements.warningsEmpty.hidden = true;
};

const ensureCommandEntry = (commandName) => {
    if (!state.permissions.commandPermissions[commandName]) {
        state.permissions.commandPermissions[commandName] = {
            allowedRoleIds: [],
            allowedUserIds: [],
            restricted: false,
        };
    }
    const entry = state.permissions.commandPermissions[commandName];
    entry.allowedRoleIds = Array.isArray(entry.allowedRoleIds) ? entry.allowedRoleIds : [];
    entry.allowedUserIds = Array.isArray(entry.allowedUserIds) ? entry.allowedUserIds : [];
    if (typeof entry.restricted !== 'boolean') {
        entry.restricted = entry.allowedRoleIds.length > 0 || entry.allowedUserIds.length > 0;
    }
};

const renderCommands = () => {
    elements.commandsList.innerHTML = '';
    const commands = [...new Set(state.commands)].sort();
    if (commands.length === 0) {
        elements.commandsEmpty.hidden = false;
        return;
    }
    elements.commandsEmpty.hidden = true;

    commands.forEach((commandName) => {
        ensureCommandEntry(commandName);
        const commandConfig = state.permissions.commandPermissions[commandName];
        const isRestricted = Boolean(commandConfig.restricted);

        const card = document.createElement('div');
        card.className = `command-card${state.botInstalled ? '' : ' command-card--disabled'}`;
        const header = document.createElement('div');
        header.className = 'command-card__header';

        const title = document.createElement('strong');
        title.textContent = `/${commandName}`;

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'toggle';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = isRestricted;
        toggleLabel.appendChild(toggle);
        toggleLabel.appendChild(document.createTextNode('Restricted'));

        header.appendChild(title);
        header.appendChild(toggleLabel);

        const body = document.createElement('div');
        body.className = 'command-card__body';

        const roleSection = document.createElement('div');
        const roleLabel = document.createElement('p');
        roleLabel.className = 'muted';
        roleLabel.textContent = 'Allowed roles';
        const rolePicker = document.createElement('div');
        roleSection.appendChild(roleLabel);
        roleSection.appendChild(rolePicker);

        const userSection = document.createElement('div');
        const userLabel = document.createElement('p');
        userLabel.className = 'muted';
        userLabel.textContent = 'Allowed users';
        const userInput = document.createElement('input');
        userInput.type = 'text';
        userInput.placeholder = 'Paste user IDs';
        const addUserButton = document.createElement('button');
        addUserButton.type = 'button';
        addUserButton.className = 'button';
        addUserButton.textContent = 'Add';
        const userControls = document.createElement('div');
        userControls.className = 'input-row';
        userControls.appendChild(userInput);
        userControls.appendChild(addUserButton);
        const chipList = document.createElement('div');
        chipList.className = 'chip-list';

        const renderUserChips = () => {
            chipList.innerHTML = '';
            if (commandConfig.allowedUserIds.length === 0) {
                const empty = document.createElement('span');
                empty.className = 'muted';
                empty.textContent = 'No users added.';
                chipList.appendChild(empty);
                return;
            }
            commandConfig.allowedUserIds.forEach((userId) => {
                const chip = document.createElement('span');
                chip.className = 'chip';
                chip.textContent = userId;
                const remove = document.createElement('button');
                remove.type = 'button';
                remove.textContent = '✕';
                remove.addEventListener('click', () => {
                    commandConfig.allowedUserIds = commandConfig.allowedUserIds.filter((id) => id !== userId);
                    setDirty(true);
                    renderUserChips();
                });
                chip.appendChild(remove);
                chipList.appendChild(chip);
            });
        };

        const addUsers = () => {
            const values = parseIdList(userInput.value);
            if (values.length === 0) {
                return;
            }
            const merged = Array.from(new Set([...commandConfig.allowedUserIds, ...values]));
            commandConfig.allowedUserIds = merged;
            setDirty(true);
            userInput.value = '';
            renderUserChips();
        };

        addUserButton.addEventListener('click', addUsers);
        userInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addUsers();
            }
        });

        userSection.appendChild(userLabel);
        userSection.appendChild(userControls);
        userSection.appendChild(chipList);
        renderUserChips();

        const actions = document.createElement('div');
        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'button button--ghost';
        clearButton.textContent = 'Clear';
        clearButton.addEventListener('click', () => {
            commandConfig.allowedRoleIds = [];
            commandConfig.allowedUserIds = [];
            commandConfig.restricted = false;
            setDirty(true);
            renderCommands();
        });
        actions.appendChild(clearButton);

        body.appendChild(roleSection);
        body.appendChild(userSection);
        body.appendChild(actions);

        toggle.addEventListener('change', () => {
            setDirty(true);
            commandConfig.restricted = toggle.checked;
            if (!toggle.checked) {
                commandConfig.allowedRoleIds = [];
                commandConfig.allowedUserIds = [];
            }
            renderCommands();
        });

        const controlsDisabled = !state.botInstalled || !isRestricted;
        userInput.disabled = controlsDisabled;
        addUserButton.disabled = controlsDisabled;

        renderRolePicker(
            rolePicker,
            state.roles,
            commandConfig.allowedRoleIds,
            (selected) => {
                commandConfig.allowedRoleIds = selected;
                setDirty(true);
            },
            {
                disabled: !state.botInstalled || !isRestricted,
                emptyMessage: isRestricted ? 'Select roles to allow.' : 'Allow all roles.',
            },
        );

        card.appendChild(header);
        card.appendChild(body);
        elements.commandsList.appendChild(card);
    });
};

const renderPanels = () => {
    renderRolePicker(
        elements.adminRolesPicker,
        state.roles,
        state.permissions.adminRoleIds,
        (selected) => {
            state.permissions.adminRoleIds = selected;
            setDirty(true);
        },
        {
            disabled: !state.botInstalled,
            emptyMessage: state.botInstalled ? 'Select roles to grant admin access.' : 'Invite bot to load roles.',
        },
    );
    renderAdminUsers();
    renderCommands();

    if (!state.botInstalled) {
        elements.settingsPanel.classList.add('panel--disabled');
        elements.permissionsPanel.classList.add('panel--disabled');
        elements.botInactiveCallout.hidden = false;
    } else {
        elements.settingsPanel.classList.remove('panel--disabled');
        elements.permissionsPanel.classList.remove('panel--disabled');
        elements.botInactiveCallout.hidden = true;
    }
};

const updateBotStatusControls = () => {
    if (state.botInstalled) {
        elements.inviteButton.hidden = true;
        elements.refreshBotButton.hidden = true;
    } else {
        elements.inviteButton.hidden = false;
        elements.refreshBotButton.hidden = false;
    }
};

const loadSession = async () => {
    const data = await fetchDashboardJson('/api/me');
    elements.userDisplay.textContent = dashboardApi.formatUserDisplay(data.user);
    if (data.expiresAt) {
        const expires = new Date(data.expiresAt);
        elements.sessionExpiry.textContent = `Session expires ${expires.toLocaleString()}`;
    }
};

const loadGuilds = async () => {
    setLoadingGuilds(true);
    try {
        const data = await fetchDashboardJson('/api/guilds');
        state.guilds = data.guilds || [];
        state.filteredGuilds = [...state.guilds];
        if (state.guilds.length > 0 && !state.selectedGuildId) {
            state.selectedGuildId = state.guilds[0].id;
        }
        renderGuilds();
    } finally {
        setLoadingGuilds(false);
    }
};

const loadBotGuilds = async () => {
    try {
        const data = await fetchDashboardJson('/api/bot/guilds');
        state.botGuildIds = new Set(data.guildIds || []);
    } catch (error) {
        state.botGuildIds = new Set();
        handleFetchError(error, 'Failed to fetch bot status.');
    }
};

const updateBotInstalled = () => {
    state.botInstalled = state.selectedGuildId ? state.botGuildIds.has(state.selectedGuildId) : false;
};

const loadGuildDetails = async () => {
    if (!state.selectedGuildId) {
        return;
    }
    setLoadingDetails(true);
    setError(null);
    setDirty(false);
    resetWarningSelection();

    const guild = state.guilds.find((entry) => entry.id === state.selectedGuildId);
    updateBotInstalled();
    updateGuildHeader(guild);
    updateBotStatusControls();

    try {
        const [permissionsData, commandsData] = await Promise.all([
            fetchDashboardJson(`/api/guilds/${state.selectedGuildId}/permissions`),
            fetchDashboardJson(`/api/guilds/${state.selectedGuildId}/commands`),
        ]);

        state.permissions = normalizePermissions(permissionsData.permissions || {});
        state.permissions.commandPermissions = state.permissions.commandPermissions || {};
        state.commands = commandsData.commands || [];

        Object.keys(state.permissions.commandPermissions).forEach((commandName) => {
            if (!state.commands.includes(commandName)) {
                state.commands.push(commandName);
            }
        });

        if (state.botInstalled) {
            try {
                const rolesData = await fetchDashboardJson(`/api/guilds/${state.selectedGuildId}/roles`);
                state.roles = rolesData.roles || [];
            } catch (error) {
                if (error?.code === 'BOT_NOT_IN_GUILD') {
                    state.botInstalled = false;
                    state.roles = [];
                } else {
                    handleFetchError(error, 'Failed to fetch roles.');
                }
            }
        } else {
            state.roles = [];
        }

        updateGuildHeader(guild);
        updateBotStatusControls();
        state.originalPermissions = clonePermissions(state.permissions);
        renderPanels();
        const activeTab = document.querySelector('.tab.active')?.dataset.tab || 'settings';
        switchTab(activeTab);
    } catch (error) {
        handleFetchError(error, 'Failed to load guild data.');
    } finally {
        setLoadingDetails(false);
    }
};

const selectGuild = async (guildId) => {
    if (state.dirty) {
        const proceed = window.confirm('You have unsaved changes. Discard them and switch guilds?');
        if (!proceed) {
            return;
        }
    }
    state.selectedGuildId = guildId;
    renderGuilds();
    await loadGuildDetails();
};

const addAdminUser = () => {
    const values = parseIdList(elements.adminUserInput.value);
    if (values.length === 0) {
        return;
    }
    state.permissions.adminUserIds = Array.from(new Set([...state.permissions.adminUserIds, ...values]));
    elements.adminUserInput.value = '';
    setDirty(true);
    renderAdminUsers();
};

const addCommand = () => {
    const value = elements.newCommandInput.value.trim();
    if (!value) {
        return;
    }
    if (!COMMAND_NAME_REGEX.test(value)) {
        setError({message: 'Command name must be 1-32 characters and use letters, numbers, - or _.'});
        return;
    }
    if (!state.commands.includes(value)) {
        state.commands.push(value);
        setDirty(true);
    }
    elements.newCommandInput.value = '';
    renderCommands();
};

const savePermissions = async () => {
    if (!state.selectedGuildId) {
        return;
    }

    setLoadingDetails(true);
    try {
        const data = await fetchDashboardJson(`/api/guilds/${state.selectedGuildId}/permissions`, {
            method: 'PATCH',
            body: JSON.stringify(state.permissions),
        });
        state.permissions = normalizePermissions(data.permissions || {});
        state.originalPermissions = clonePermissions(state.permissions);
        setDirty(false);
        dashboardApi.showToast('Permissions saved.', 'success');
        renderPanels();
    } catch (error) {
        handleFetchError(error, 'Failed to save permissions.');
    } finally {
        setLoadingDetails(false);
    }
};

const discardChanges = () => {
    if (!state.originalPermissions) {
        return;
    }
    state.permissions = clonePermissions(state.originalPermissions);
    setDirty(false);
    renderPanels();
};

const switchTab = (tabName) => {
    elements.tabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    elements.settingsPanel.hidden = tabName !== 'settings';
    elements.permissionsPanel.hidden = tabName !== 'permissions';
    elements.warningsPanel.hidden = tabName !== 'warnings';
};

const resolveWarningUserId = (value) => {
    if (value && value.trim()) {
        return value.trim();
    }
    return state.selectedWarningUser?.id || '';
};

const renderWarningMembers = (members = []) => {
    elements.warningsUserResults.innerHTML = '';
    if (!members.length) {
        const empty = document.createElement('span');
        empty.className = 'muted';
        empty.textContent = 'No members found.';
        elements.warningsUserResults.appendChild(empty);
        return;
    }

    members.forEach((member) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `member-item${state.selectedWarningUser?.id === member.id ? ' active' : ''}`;
        const meta = document.createElement('div');
        meta.className = 'member-item__meta';
        const name = document.createElement('span');
        name.className = 'member-item__name';
        name.textContent = formatMemberDisplay(member);
        const id = document.createElement('span');
        id.className = 'member-item__id';
        id.textContent = member.id;
        meta.appendChild(name);
        meta.appendChild(id);
        button.appendChild(meta);
        button.addEventListener('click', () => {
            setSelectedWarningUser(member);
            renderWarningMembers(members);
        });
        elements.warningsUserResults.appendChild(button);
    });
};

const searchWarningMembers = async (query) => {
    if (!state.selectedGuildId || !query || query.trim().length < 2) {
        elements.warningsUserResults.innerHTML = '';
        return;
    }
    try {
        const data = await fetchDashboardJson(
            `/api/guilds/${state.selectedGuildId}/members?query=${encodeURIComponent(query.trim())}`,
        );
        const members = data.members || [];
        renderWarningMembers(members);
    } catch (error) {
        handleFetchError(error, 'Failed to search members.');
    }
};

const fetchWarnings = async () => {
    const userId = resolveWarningUserId(elements.warningsUserInput.value);
    if (!userId) {
        setError({message: 'Enter a user ID to fetch warnings.'});
        return;
    }
    elements.warningsSpinner.hidden = false;
    try {
        const data = await fetchDashboardJson(`/api/guilds/${state.selectedGuildId}/warnings/${userId}`);
        const warnings = data.warnings || [];
        elements.warningsList.innerHTML = '';
        if (warnings.length === 0) {
            elements.warningsEmpty.hidden = false;
        } else {
            elements.warningsEmpty.hidden = true;
            warnings.forEach((warning) => {
                const item = document.createElement('li');
                item.className = 'warning-item';
                const text = document.createElement('p');
                text.textContent = warning.reason;
                const meta = document.createElement('div');
                meta.className = 'warning-item__meta';
                const dateText = warning.createdAt ? new Date(warning.createdAt).toLocaleString() : 'Unknown date';
                const moderator = document.createElement('span');
                moderator.textContent = `Moderator: ${warning.moderatorId || 'Unknown'}`;
                const copyButton = document.createElement('button');
                copyButton.type = 'button';
                copyButton.className = 'button button--ghost';
                copyButton.textContent = 'Copy moderator ID';
                copyButton.addEventListener('click', async () => {
                    if (!warning.moderatorId) {
                        return;
                    }
                    try {
                        await navigator.clipboard.writeText(warning.moderatorId);
                        dashboardApi.showToast('Moderator ID copied.', 'success');
                    } catch (error) {
                        dashboardApi.showToast('Unable to copy moderator ID.', 'error');
                    }
                });
                meta.appendChild(moderator);
                meta.appendChild(document.createElement('span')).textContent = dateText;
                item.appendChild(text);
                item.appendChild(meta);
                item.appendChild(copyButton);
                elements.warningsList.appendChild(item);
            });
        }
        setError(null);
    } catch (error) {
        handleFetchError(error, 'Failed to fetch warnings.');
    } finally {
        elements.warningsSpinner.hidden = true;
    }
};

const updateWarningCount = () => {
    const length = elements.warningReasonInput.value.length;
    elements.warningCharCount.textContent = `${length}/200`;
};

const addWarning = async () => {
    const userId = resolveWarningUserId(elements.newWarningUserInput.value);
    const reason = elements.warningReasonInput.value.trim();
    if (!userId || !reason) {
        elements.warningStatus.textContent = 'User ID and reason are required.';
        return;
    }
    if (reason.length > 200) {
        elements.warningStatus.textContent = 'Reason must be under 200 characters.';
        return;
    }

    elements.warningStatus.textContent = '';
    try {
        const data = await fetchDashboardJson(`/api/guilds/${state.selectedGuildId}/warnings/${userId}`, {
            method: 'POST',
            body: JSON.stringify({reason}),
        });
        elements.warningStatus.textContent = `Warning added. Total warnings: ${data.warnings?.length || 0}`;
        elements.warningReasonInput.value = '';
        updateWarningCount();
        dashboardApi.showToast('Warning saved.', 'success');
    } catch (error) {
        handleFetchError(error, 'Failed to add warning.');
    }
};

const clearWarnings = async () => {
    const userId = resolveWarningUserId(elements.warningsUserInput.value);
    if (!userId) {
        setError({message: 'Select a user to clear warnings.'});
        return;
    }
    const proceed = window.confirm('Clear all warnings for this user?');
    if (!proceed) {
        return;
    }
    try {
        await fetchDashboardJson(`/api/guilds/${state.selectedGuildId}/warnings/${userId}`, {
            method: 'DELETE',
        });
        elements.warningsList.innerHTML = '';
        elements.warningsEmpty.hidden = false;
        elements.warningStatus.textContent = 'Warnings cleared.';
        dashboardApi.showToast('Warnings cleared.', 'success');
    } catch (error) {
        handleFetchError(error, 'Failed to clear warnings.');
    }
};

const refreshBotStatus = async () => {
    await loadBotGuilds();
    updateBotInstalled();
    const guild = state.guilds.find((entry) => entry.id === state.selectedGuildId);
    updateGuildHeader(guild);
    updateBotStatusControls();
    renderPanels();
};

const openInvite = async () => {
    try {
        const data = await fetchDashboardJson(`/api/invite-url?guildId=${state.selectedGuildId}`);
        if (data.inviteUrl) {
            window.open(data.inviteUrl, '_blank', 'noopener,noreferrer');
        }
    } catch (error) {
        handleFetchError(error, 'Failed to generate invite URL.');
    }
};

const openCopyModal = () => {
    elements.copyGuildSelect.innerHTML = '';
    state.guilds
        .filter((guild) => guild.id !== state.selectedGuildId)
        .forEach((guild) => {
            const option = document.createElement('option');
            option.value = guild.id;
            option.textContent = guild.name;
            elements.copyGuildSelect.appendChild(option);
        });
    elements.copyModal.hidden = false;
};

const closeCopyModal = () => {
    elements.copyModal.hidden = true;
};

const confirmCopy = async () => {
    const guildId = elements.copyGuildSelect.value;
    if (!guildId) {
        closeCopyModal();
        return;
    }
    try {
        const data = await fetchDashboardJson(`/api/guilds/${guildId}/permissions`);
        state.permissions = normalizePermissions(data.permissions || {});
        setDirty(true);
        renderPanels();
        dashboardApi.showToast('Permissions copied. Review before saving.', 'success');
    } catch (error) {
        handleFetchError(error, 'Failed to copy permissions.');
    } finally {
        closeCopyModal();
    }
};

const initDashboard = async () => {
    try {
        await loadSession();
        await Promise.all([loadGuilds(), loadBotGuilds()]);
        renderGuilds();
        if (state.selectedGuildId) {
            await loadGuildDetails();
        }
    } catch (error) {
        setError({message: 'Please log in to access the dashboard.'});
        window.location.href = '/';
        return;
    }

    elements.logoutButton.addEventListener('click', async () => {
        await fetch('/auth/logout', {method: 'POST', credentials: 'include'});
        window.location.href = '/';
    });

    elements.tabs.forEach((tab) => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    elements.addAdminUserButton.addEventListener('click', addAdminUser);
    elements.adminUserInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            addAdminUser();
        }
    });
    elements.addCommandButton.addEventListener('click', addCommand);
    elements.savePermissionsButton.addEventListener('click', savePermissions);
    elements.discardChangesButton.addEventListener('click', discardChanges);
    elements.fetchWarningsButton.addEventListener('click', fetchWarnings);
    elements.clearWarningsButton.addEventListener('click', clearWarnings);
    elements.addWarningButton.addEventListener('click', addWarning);
    elements.warningReasonInput.addEventListener('input', updateWarningCount);
    elements.warningsUserSearch.addEventListener(
        'input',
        dashboardApi.debounce((event) => {
            searchWarningMembers(event.target.value);
        }, 250),
    );
    elements.warningsUserInput.addEventListener('input', (event) => {
        setManualWarningUser(event.target.value.trim());
    });
    elements.newWarningUserInput.addEventListener('input', (event) => {
        if (event.target.value.trim()) {
            setManualWarningUser(event.target.value.trim());
        }
    });
    elements.inviteButton.addEventListener('click', openInvite);
    elements.refreshBotButton.addEventListener('click', refreshBotStatus);
    elements.clearAllCommands.addEventListener('click', () => {
        Object.keys(state.permissions.commandPermissions).forEach((commandName) => {
            state.permissions.commandPermissions[commandName] = {
                allowedRoleIds: [],
                allowedUserIds: [],
                restricted: false,
            };
        });
        setDirty(true);
        renderCommands();
    });
    elements.copyFromGuild.addEventListener('click', openCopyModal);
    elements.cancelCopyButton.addEventListener('click', closeCopyModal);
    elements.confirmCopyButton.addEventListener('click', confirmCopy);
    updateWarningCount();

    elements.guildSearch.addEventListener(
        'input',
        dashboardApi.debounce((event) => {
            const query = event.target.value.toLowerCase();
            state.filteredGuilds = state.guilds.filter((guild) => guild.name.toLowerCase().includes(query));
            renderGuilds();
        }, 200),
    );

    window.addEventListener('beforeunload', (event) => {
        if (state.dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});
