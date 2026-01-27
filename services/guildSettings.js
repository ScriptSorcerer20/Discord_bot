const { connectToDatabase } = require('../db');

const DEFAULT_GUILD_SETTINGS = {
    moderation: {
        strikeThresholds: {
            mute: 2,
            kick: 3,
            ban: 5,
        },
        muteDurationMinutes: 30,
        banDurationMs: 0,
    },
};

const normalizeGuildSettings = (settings = {}) => {
    const moderation = settings.moderation ?? {};
    const strikeThresholds = moderation.strikeThresholds ?? {};
    return {
        ...DEFAULT_GUILD_SETTINGS,
        ...settings,
        moderation: {
            ...DEFAULT_GUILD_SETTINGS.moderation,
            ...moderation,
            strikeThresholds: {
                ...DEFAULT_GUILD_SETTINGS.moderation.strikeThresholds,
                ...strikeThresholds,
            },
        },
    };
};

const getGuildSettings = async (guildId) => {
    if (!guildId) {
        return normalizeGuildSettings();
    }
    const dbClient = await connectToDatabase();
    const db = dbClient.db('discord');
    const collection = db.collection('guild_settings');
    const settings = await collection.findOne({ guildId });
    return normalizeGuildSettings(settings);
};

module.exports = {
    getGuildSettings,
};
