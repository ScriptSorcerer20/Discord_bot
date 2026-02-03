const { connectToDatabase } = require('../db');

const DEFAULT_GUILD_PERMISSIONS = {
    adminRoleIds: [],
    adminUserIds: [],
    commandPermissions: {},
};

const COMMAND_NAME_REGEX = /^[a-z0-9_-]{1,32}$/i;

const normalizeIdArray = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }

    const normalized = value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0);

    return Array.from(new Set(normalized));
};

const sanitizeCommandPermissions = (commandPermissions = {}) => {
    if (!commandPermissions || typeof commandPermissions !== 'object') {
        return {};
    }

    const sanitized = {};
    for (const [commandName, commandConfig] of Object.entries(commandPermissions)) {
        if (!COMMAND_NAME_REGEX.test(commandName)) {
            continue;
        }

        sanitized[commandName] = {
            allowedRoleIds: normalizeIdArray(commandConfig?.allowedRoleIds),
            allowedUserIds: normalizeIdArray(commandConfig?.allowedUserIds),
        };
    }

    return sanitized;
};

const normalizePermissionConfig = (config = {}) => {
    const safeConfig = config && typeof config === 'object' ? config : {};

    return {
        ...DEFAULT_GUILD_PERMISSIONS,
        adminRoleIds: normalizeIdArray(safeConfig.adminRoleIds),
        adminUserIds: normalizeIdArray(safeConfig.adminUserIds),
        commandPermissions: sanitizeCommandPermissions(safeConfig.commandPermissions),
    };
};

const memberHasRole = (member, roleIds) =>
    roleIds.some((roleId) => member.roles?.cache?.has(roleId));

const getGuildPermissions = async (guildId) => {
    const dbClient = await connectToDatabase();
    const db = dbClient.db('discord');
    const collection = db.collection('guild_permissions');
    const config = await collection.findOne({ guildId });

    return normalizePermissionConfig(config);
};

const updateGuildPermissions = async ({ guildId, permissions }) => {
    if (!guildId) {
        throw new Error('Guild ID is required');
    }

    const dbClient = await connectToDatabase();
    const db = dbClient.db('discord');
    const collection = db.collection('guild_permissions');

    const normalizedPermissions = normalizePermissionConfig(permissions);
    const payload = {
        guildId,
        ...normalizedPermissions,
        updatedAt: new Date(),
    };

    await collection.updateOne({ guildId }, { $set: payload }, { upsert: true });

    return payload;
};

const isCommandAllowed = async ({
    guildId,
    userId,
    member,
    commandName,
    permissionGroup,
}) => {
    if (!guildId) return true;

    const permissions = await getGuildPermissions(guildId);
    const isAdmin =
        permissions.adminUserIds.includes(userId) ||
        (member && memberHasRole(member, permissions.adminRoleIds));

    if (isAdmin) {
        return true;
    }

    const commandPermissions = permissions.commandPermissions?.[commandName];
    if (!commandPermissions) {
        return true;
    }

    const allowedUserIds = Array.isArray(commandPermissions.allowedUserIds)
        ? commandPermissions.allowedUserIds
        : [];
    const allowedRoleIds = Array.isArray(commandPermissions.allowedRoleIds)
        ? commandPermissions.allowedRoleIds
        : [];

    if (allowedUserIds.length === 0 && allowedRoleIds.length === 0) {
        return true;
    }

    if (allowedUserIds.includes(userId)) {
        return true;
    }

    return member ? memberHasRole(member, allowedRoleIds) : false;
};

module.exports = {
    getGuildPermissions,
    updateGuildPermissions,
    isCommandAllowed,
};
