const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const express = require('express');
const {addWarning, getWarnings} = require('./services/warnings');
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

const sessionStore = new Map();

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

const buildAuthorizationUrl = (state) => {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        redirect_uri: DISCORD_REDIRECT_URI,
        response_type: 'code',
        scope: 'identify guilds',
        state,
        prompt: 'consent',
    });

    return `${DISCORD_API_BASE}/oauth2/authorize?${params.toString()}`;
};

const fetchDiscordAccessToken = async (code) => {
    const params = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
    });

    const response = await axios.post(`${DISCORD_API_BASE}/oauth2/token`, params, {
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
        throw new Error('Missing Discord bot token.');
    }

    const response = await axios.get(`${DISCORD_API_BASE}/guilds/${guildId}/roles`, {
        headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
    });

    return response.data;
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
        const guilds = await fetchDiscordUserGuilds(req.session.accessToken);
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
        return res.status(502).json({error: 'Failed to fetch guilds'});
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
            secure: req.secure,
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

            const {sessionId, expiresAt} = createSession({
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                tokenType: tokenData.token_type,
                scope: tokenData.scope,
                user,
            });

            setCookie(res, 'dashboard_session', sessionId, {
                httpOnly: true,
                sameSite: 'Lax',
                secure: req.secure,
                maxAge: Math.floor((expiresAt - Date.now()) / 1000),
            });
            clearCookie(res, 'oauth_state');

            if (DASHBOARD_CLIENT_URL) {
                return res.redirect(DASHBOARD_CLIENT_URL);
            }

            if (req.accepts('html')) {
                return res.redirect('/');
            }

            return res.status(200).json({user});
        } catch (error) {
            console.error('Discord OAuth failed', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data,
            });

            return res.status(502).json({
                error: 'Failed to authenticate with Discord',
                details: error.response?.data || error.message,
            });
        }
    });

    app.post('/auth/logout', ensureSession, (req, res) => {
        destroySession(req.sessionId);
        clearCookie(res, 'dashboard_session');
        return res.status(204).send();
    });

    app.get('/api/guilds', ensureSession, async (req, res) => {
        try {
            const guilds = await fetchDiscordUserGuilds(req.session.accessToken);
            const manageableGuilds = guilds.filter(canManageGuild);
            return res.json({guilds: manageableGuilds});
        } catch (error) {
            return res.status(502).json({error: 'Failed to fetch guilds'});
        }
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
                return res.status(500).json({error: 'Failed to fetch permissions'});
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
                return res.status(500).json({error: 'Failed to update permissions'});
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
                return res.status(500).json({error: 'Failed to fetch roles'});
            }
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
                return res.json({warnings});
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
                return res.status(201).json(result);
            } catch (error) {
                return res.status(500).json({error: 'Failed to add warning'});
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
