const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const express = require('express');
const {addWarning, getWarnings, clearWarnings} = require('./services/warnings');
const {getGuildPermissions, updateGuildPermissions} = require('./services/permissions');
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const PERMISSION_BITS = {
    ADMINISTRATOR: 0x8n,
    MANAGE_GUILD: 0x20n,
};

const loadConfig = () => {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        return require(configPath);
    }
    return {};
};

const config = loadConfig();

const DISCORD_CLIENT_ID =
    process.env.DISCORD_CLIENT_ID ||
    config.discordClientId ||
    config.clientId ||
    config.appId;
const DISCORD_CLIENT_SECRET =
    process.env.DISCORD_CLIENT_SECRET ||
    config.discordClientSecret ||
    config.clientSecret;
const DISCORD_REDIRECT_URI =
    process.env.DISCORD_REDIRECT_URI ||
    config.discordRedirectUri ||
    config.redirectUri;
const DISCORD_BOT_TOKEN =
    process.env.DISCORD_BOT_TOKEN ||
    config.discordBotToken ||
    config.token;
const DASHBOARD_INVITE_PERMISSIONS = Number.parseInt(
    process.env.DASHBOARD_INVITE_PERMISSIONS || config.dashboardInvitePermissions || '0',
    10,
);
const DASHBOARD_CLIENT_URL =
    process.env.DASHBOARD_CLIENT_URL ||
    config.dashboardClientUrl ||
    config.clientUrl;
const SESSION_TTL_MS = Number.parseInt(
    process.env.DASHBOARD_SESSION_TTL_MS || config.dashboardSessionTtlMs,
    10,
);

console.log('[oauth config]', {
    DISCORD_CLIENT_ID_present: Boolean(DISCORD_CLIENT_ID && String(DISCORD_CLIENT_ID).trim()),
    DISCORD_CLIENT_SECRET_present: Boolean(DISCORD_CLIENT_SECRET && String(DISCORD_CLIENT_SECRET).trim()),
    DISCORD_REDIRECT_URI: DISCORD_REDIRECT_URI || null,
    configFilePath: path.join(__dirname, 'config.json'),
    configFileExists: fs.existsSync(path.join(__dirname, 'config.json')),
});

const DISCORD_API_BASE = 'https://discord.com/api';
const DISCORD_OAUTH_BASE = 'https://discord.com/oauth2';
const COMMANDS_PATH = path.join(__dirname, 'commands.json');
const GUILD_CACHE_TTL_MS = 5 * 60 * 1000;
const BOT_GUILD_CACHE_TTL_MS = 60 * 1000;
const BOT_TOKEN_ERROR_MESSAGE = 'Missing Discord bot token.';

const sessionStore = new Map();
const botGuildCache = {
    guildIds: null,
    fetchedAt: 0,
};

const parseCookies = (headerValue) => {
    const cookies = {};
    if (!headerValue) {
        return cookies;
    }

    headerValue.split(';').forEach((cookie) => {
        const [rawName, ...rest] = cookie.trim().split('=');
        if (!rawName) {
            return;
        }
        cookies[rawName] = decodeURIComponent(rest.join('='));
    });

    return cookies;
};

const setCookie = (res, name, value, options = {}) => {
    const directives = [`${name}=${encodeURIComponent(value)}`];
    if (options.maxAge) {
        directives.push(`Max-Age=${options.maxAge}`);
    }
    directives.push(`Path=${options.path || '/'}`);
    if (options.httpOnly !== false) {
        directives.push('HttpOnly');
    }
    if (options.sameSite) {
        directives.push(`SameSite=${options.sameSite}`);
    }
    if (options.secure) {
        directives.push('Secure');
    }

    res.append('Set-Cookie', directives.join('; '));
};

const clearCookie = (res, name) => {
    setCookie(res, name, '', {maxAge: 0});
};

const createSession = (payload) => {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (Number.isNaN(SESSION_TTL_MS) ? DEFAULT_SESSION_TTL_MS : SESSION_TTL_MS);

    sessionStore.set(sessionId, {
        ...payload,
        expiresAt,
    });

    return {sessionId, expiresAt};
};

const getSession = (sessionId) => {
    const session = sessionStore.get(sessionId);
    if (!session) {
        return null;
    }
    if (session.expiresAt <= Date.now()) {
        sessionStore.delete(sessionId);
        return null;
    }
    return session;
};

const destroySession = (sessionId) => {
    sessionStore.delete(sessionId);
};

const ensureOAuthConfig = () => {
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
        return null;
    }
    return {
        clientId: DISCORD_CLIENT_ID,
        clientSecret: DISCORD_CLIENT_SECRET,
        redirectUri: DISCORD_REDIRECT_URI,
    };
};

const getDiscordStatusCode = (error) => {
    const status = error?.response?.status;
    return typeof status === 'number' ? status : null;
};

const sendDiscordApiError = (res, error, fallbackMessage) => {
    const status = getDiscordStatusCode(error);
    if (status === 401 || status === 403) {
        return res.status(401).json({error: 'DISCORD_AUTH', message: 'Discord authentication expired'});
    }
    if (status === 429) {
        return res.status(503).json({error: 'DISCORD_RATE_LIMIT', message: 'Discord rate limit exceeded'});
    }
    return res.status(502).json({error: 'DISCORD_REQUEST_FAILED', message: fallbackMessage});
};

const buildAuthorizationUrl = (state) => {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds',
        state,
        prompt: 'consent',
    });
    return `${DISCORD_OAUTH_BASE}/authorize?${params.toString()}`;
};

const fetchDiscordAccessToken = async (code) => {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
    });

    const response = await axios.post(`${DISCORD_API_BASE}/oauth2/token`, params.toString(), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    return response.data;
};

const fetchDiscordUser = async (accessToken) => {
    const response = await axios.get(`${DISCORD_API_BASE}/users/@me`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    return response.data;
};

const fetchDiscordUserGuilds = async (accessToken) => {
    const response = await axios.get(`${DISCORD_API_BASE}/users/@me/guilds`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    return response.data;
};

const fetchDiscordGuildRoles = async (guildId) => {
    if (!DISCORD_BOT_TOKEN) {
        throw new Error(BOT_TOKEN_ERROR_MESSAGE);
    }

    const response = await axios.get(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
        headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
    });

    return response.data;
};

const fetchDiscordGuildMembersSearch = async (guildId, query) => {
    if (!DISCORD_BOT_TOKEN) {
        throw new Error(BOT_TOKEN_ERROR_MESSAGE);
    }

    const response = await axios.get(`${DISCORD_API_BASE}/guilds/${guildId}/members/search`, {
        headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
        params: {
            query,
            limit: 20,
        },
    });

    return response.data;
};

const fetchDiscordBotGuilds = async () => {
    if (!DISCORD_BOT_TOKEN) {
        throw new Error(BOT_TOKEN_ERROR_MESSAGE);
    }

    const response = await axios.get(`${DISCORD_API_BASE}/users/@me/guilds`, {
        headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
    });

    return response.data;
};

const getCachedBotGuildIds = () => {
    if (!Array.isArray(botGuildCache.guildIds)) {
        return null;
    }
    if (!botGuildCache.fetchedAt) {
        return null;
    }
    if (Date.now() - botGuildCache.fetchedAt > BOT_GUILD_CACHE_TTL_MS) {
        return null;
    }
    return botGuildCache.guildIds;
};

const setCachedBotGuildIds = (guildIds) => {
    botGuildCache.guildIds = guildIds;
    botGuildCache.fetchedAt = Date.now();
};

const buildInviteUrl = (guildId) => {
    if (!DISCORD_CLIENT_ID) {
        return null;
    }
    const permissions = Number.isNaN(DASHBOARD_INVITE_PERMISSIONS) ? 0 : DASHBOARD_INVITE_PERMISSIONS;
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        scope: 'bot applications.commands',
        permissions: String(permissions),
        disable_guild_select: 'true',
    });
    if (guildId) {
        params.set('guild_id', guildId);
    }
    return `${DISCORD_OAUTH_BASE}/authorize?${params.toString()}`;
};

const cacheSessionGuilds = (session, guilds) => {
    session.guilds = guilds;
    session.guildsFetchedAt = Date.now();
};

const getCachedGuilds = (session) => {
    if (!Array.isArray(session.guilds)) {
        return null;
    }

    if (!session.guildsFetchedAt) {
        return null;
    }

    if (Date.now() - session.guildsFetchedAt > GUILD_CACHE_TTL_MS) {
        return null;
    }

    return session.guilds;
};

const parsePermissionBits = (permissionValue) => {
    if (!permissionValue) {
        return 0n;
    }

    try {
        return BigInt(permissionValue);
    } catch (error) {
        return 0n;
    }
};

const isHttpsRequest = (req) => {
    if (req.secure) {
        return true;
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    if (typeof forwardedProto === 'string' && forwardedProto.split(',')[0].trim() === 'https') {
        return true;
    }

    return Boolean(config.cookieSecure);
};

const loadCommands = () => {
    if (!fs.existsSync(COMMANDS_PATH)) {
        return [];
    }

    try {
        const raw = fs.readFileSync(COMMANDS_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
    } catch (error) {
        console.error('Failed to load commands.json', {message: error.message});
        return [];
    }
};

const canManageGuild = (guild) => {
    const permissions = parsePermissionBits(guild.permissions);
    return (
        (permissions & PERMISSION_BITS.ADMINISTRATOR) === PERMISSION_BITS.ADMINISTRATOR ||
        (permissions & PERMISSION_BITS.MANAGE_GUILD) === PERMISSION_BITS.MANAGE_GUILD
    );
};

const ensureSession = (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies.dashboard_session;
    if (!sessionId) {
        return res.status(401).json({error: 'Unauthorized'});
    }

    const session = getSession(sessionId);
    if (!session) {
        return res.status(401).json({error: 'Unauthorized'});
    }

    req.session = session;
    req.sessionId = sessionId;
    return next();
};

const ensureManageableGuild = async (req, res, next) => {
    try {
        let guilds = getCachedGuilds(req.session);
        if (!guilds) {
            guilds = await fetchDiscordUserGuilds(req.session.accessToken);
            cacheSessionGuilds(req.session, guilds);
        }
        const guild = guilds.find((entry) => entry.id === req.params.guildId);
        if (!guild) {
            return res.status(404).json({error: 'Guild not found'});
        }
        if (!canManageGuild(guild)) {
            return res.status(403).json({error: 'Forbidden'});
        }

        req.guild = guild;
        return next();
    } catch (error) {
        return sendDiscordApiError(res, error, 'Failed to fetch guilds');
    }
};

const createDashboardApp = () => {
    const app = express();

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    app.get('/auth/discord', (req, res) => {
        if (!ensureOAuthConfig()) {
            return res.status(500).json({error: 'Missing Discord OAuth configuration'});
        }

        const state = crypto.randomBytes(16).toString('hex');
        setCookie(res, 'oauth_state', state, {
            httpOnly: true,
            sameSite: 'Lax',
            secure: isHttpsRequest(req),
            maxAge: 300,
        });

        return res.redirect(buildAuthorizationUrl(state));
    });

    app.get('/auth/discord/callback', async (req, res) => {
        if (!ensureOAuthConfig()) {
            return res.status(500).json({error: 'Missing Discord OAuth configuration'});
        }

        const {code, state} = req.query;
        const cookies = parseCookies(req.headers.cookie);
        if (!code || !state || cookies.oauth_state !== state) {
            return res.status(400).json({error: 'Invalid OAuth state'});
        }

        try {
            const tokenData = await fetchDiscordAccessToken(code);
            const user = await fetchDiscordUser(tokenData.access_token);

            const session = createSession({
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                tokenType: tokenData.token_type,
                scope: tokenData.scope,
                user,
            });

            setCookie(res, 'dashboard_session', session.sessionId, {
                httpOnly: true,
                sameSite: 'Lax',
                secure: isHttpsRequest(req),
                maxAge: Math.floor((session.expiresAt - Date.now()) / 1000),
            });
            clearCookie(res, 'oauth_state');

            if (DASHBOARD_CLIENT_URL) {
                return res.redirect(DASHBOARD_CLIENT_URL);
            }

            if (req.accepts('html')) {
                return res.redirect('/dashboard.html');
            }

            return res.status(200).json({user});
        } catch (error) {
            console.error('Discord OAuth failed', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data?.error || error.response?.data?.error_description,
            });

            return res.status(502).json({
                error: 'Failed to authenticate with Discord',
                details: error.response?.data?.error_description || error.message,
            });
        }
    });

    app.post('/auth/logout', ensureSession, (req, res) => {
        destroySession(req.sessionId);
        clearCookie(res, 'dashboard_session');
        return res.status(204).send();
    });

    app.get('/api/me', ensureSession, (req, res) => {
        return res.json({
            user: req.session.user,
            expiresAt: req.session.expiresAt,
        });
    });

    app.get('/api/guilds', ensureSession, async (req, res) => {
        try {
            const guilds = await fetchDiscordUserGuilds(req.session.accessToken);
            cacheSessionGuilds(req.session, guilds);
            const manageableGuilds = guilds.filter(canManageGuild);
            return res.json({guilds: manageableGuilds});
        } catch (error) {
            return sendDiscordApiError(res, error, 'Failed to fetch guilds');
        }
    });

    app.get('/api/bot/guilds', ensureSession, async (req, res) => {
        try {
            const cached = getCachedBotGuildIds();
            if (cached) {
                return res.json({guildIds: cached});
            }
            const guilds = await fetchDiscordBotGuilds();
            const guildIds = Array.isArray(guilds) ? guilds.map((guild) => guild.id) : [];
            setCachedBotGuildIds(guildIds);
            return res.json({guildIds});
        } catch (error) {
            if (error.message === BOT_TOKEN_ERROR_MESSAGE) {
                return res.status(503).json({error: 'BOT_TOKEN_MISSING', message: 'Discord bot token not configured.'});
            }
            return sendDiscordApiError(res, error, 'Failed to fetch bot guilds');
        }
    });

    app.get('/api/invite-url', ensureSession, (req, res) => {
        if (!DISCORD_CLIENT_ID) {
            return res.status(500).json({error: 'MISSING_CLIENT_ID', message: 'Discord client ID not configured.'});
        }
        const inviteUrl = buildInviteUrl(req.query.guildId);
        return res.json({inviteUrl});
    });

    app.get(
        '/api/guilds/:guildId/permissions',
        ensureSession,
        ensureManageableGuild,
        async (req, res) => {
            try {
                const permissions = await getGuildPermissions(req.params.guildId);
                return res.json({permissions});
            } catch (error) {
                console.error('Failed to fetch guild permissions', {
                    guildId: req.params.guildId,
                    message: error.message,
                });
                return res.status(503).json({error: 'Permissions store unavailable'});
            }
        },
    );

    app.patch(
        '/api/guilds/:guildId/permissions',
        ensureSession,
        ensureManageableGuild,
        async (req, res) => {
            try {
                const permissions = await updateGuildPermissions({
                    guildId: req.params.guildId,
                    permissions: req.body || {},
                });
                return res.json({permissions});
            } catch (error) {
                console.error('Failed to update guild permissions', {
                    guildId: req.params.guildId,
                    message: error.message,
                });
                return res.status(503).json({error: 'Permissions store unavailable'});
            }
        },
    );

    app.get(
        '/api/guilds/:guildId/roles',
        ensureSession,
        ensureManageableGuild,
        async (req, res) => {
            try {
                const roles = await fetchDiscordGuildRoles(req.params.guildId);
                return res.json({roles});
            } catch (error) {
                const status = getDiscordStatusCode(error);
                if (status === 403 || status === 404) {
                    return res.status(409).json({
                        error: 'BOT_NOT_IN_GUILD',
                        message: 'Bot not added to this guild.',
                        inviteUrl: buildInviteUrl(req.params.guildId),
                    });
                }
                if (error.message === BOT_TOKEN_ERROR_MESSAGE) {
                    return res.status(503).json({error: 'BOT_TOKEN_MISSING', message: 'Discord bot token not configured.'});
                }
                return sendDiscordApiError(res, error, 'Failed to fetch roles');
            }
        },
    );

    app.get(
        '/api/guilds/:guildId/members',
        ensureSession,
        ensureManageableGuild,
        async (req, res) => {
            const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
            if (query.length < 2) {
                return res.json({members: []});
            }
            try {
                const members = await fetchDiscordGuildMembersSearch(req.params.guildId, query);
                const normalized = (members || [])
                    .map((member) => {
                        const user = member.user || {};
                        if (!user.id) {
                            return null;
                        }
                        return {
                            id: user.id,
                            user: {
                                id: user.id,
                                username: user.username || '',
                                discriminator: user.discriminator || '',
                                global_name: user.global_name || '',
                                avatar: user.avatar || '',
                            },
                            nick: member.nick || '',
                        };
                    })
                    .filter(Boolean);
                return res.json({members: normalized});
            } catch (error) {
                const status = getDiscordStatusCode(error);
                if (status === 403 || status === 404) {
                    return res.status(409).json({
                        error: 'BOT_NOT_IN_GUILD',
                        message: 'Bot not added to this guild.',
                        inviteUrl: buildInviteUrl(req.params.guildId),
                    });
                }
                if (error.message === BOT_TOKEN_ERROR_MESSAGE) {
                    return res.status(503).json({error: 'BOT_TOKEN_MISSING', message: 'Discord bot token not configured.'});
                }
                return sendDiscordApiError(res, error, 'Failed to search guild members');
            }
        },
    );

    app.get(
        '/api/guilds/:guildId/commands',
        ensureSession,
        ensureManageableGuild,
        (req, res) => {
            const commands = loadCommands();
            return res.json({commands});
        },
    );

    app.get(
        '/api/guilds/:guildId/warnings/:userId',
        ensureSession,
        ensureManageableGuild,
        async (req, res) => {
            try {
                const warnings = await getWarnings({
                    guildId: req.params.guildId,
                    userId: req.params.userId,
                });
                const normalizedWarnings = warnings.map((warning) => ({
                    ...warning,
                    createdAt: warning.createdAt ? new Date(warning.createdAt).toISOString() : null,
                }));
                return res.json({warnings: normalizedWarnings});
            } catch (error) {
                return res.status(500).json({error: 'Failed to fetch warnings'});
            }
        },
    );

    app.post(
        '/api/guilds/:guildId/warnings/:userId',
        ensureSession,
        ensureManageableGuild,
        async (req, res) => {
            const {reason} = req.body || {};
            if (!reason) {
                return res.status(400).json({error: 'Reason is required'});
            }
            try {
                const result = await addWarning({
                    guildId: req.params.guildId,
                    userId: req.params.userId,
                    moderatorId: req.session.user?.id,
                    reason,
                });
                const warnings = (result.warnings || []).map((warning) => ({
                    ...warning,
                    createdAt: warning.createdAt ? new Date(warning.createdAt).toISOString() : null,
                }));
                const warningEntry = result.warningEntry
                    ? {
                          ...result.warningEntry,
                          createdAt: result.warningEntry.createdAt
                              ? new Date(result.warningEntry.createdAt).toISOString()
                              : null,
                      }
                    : null;
                return res.status(201).json({
                    ...result,
                    warnings,
                    warningEntry,
                });
            } catch (error) {
                return res.status(500).json({error: 'Failed to add warning'});
            }
        },
    );

    app.delete(
        '/api/guilds/:guildId/warnings/:userId',
        ensureSession,
        ensureManageableGuild,
        async (req, res) => {
            try {
                const warnings = await clearWarnings({
                    guildId: req.params.guildId,
                    userId: req.params.userId,
                });
                return res.json({warnings});
            } catch (error) {
                return res.status(500).json({error: 'Failed to clear warnings'});
            }
        },
    );
    return app;
};

if (require.main === module) {
    const port = Number.parseInt(process.env.DASHBOARD_PORT || 3000, 10);
    const app = createDashboardApp();
    app.listen(port, () => {
        console.log(`Dashboard API listening on port ${port}`);
    });
}

module.exports = {
    createDashboardApp,
};
