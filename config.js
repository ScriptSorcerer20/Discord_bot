const fs = require('node:fs');
const path = require('node:path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
let cachedConfig = null;

const loadConfig = () => {
    if (cachedConfig) {
        return cachedConfig;
    }

    if (!fs.existsSync(CONFIG_PATH)) {
        cachedConfig = {};
        return cachedConfig;
    }

    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        cachedConfig = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.error('Failed to parse config.json', { message: error.message });
        cachedConfig = {};
    }

    return cachedConfig;
};

const getConfig = () => loadConfig();

const getConfigValue = (envKey, ...configKeys) => {
    const envValue = process.env[envKey];
    if (typeof envValue === 'string' && envValue.trim() !== '') {
        return envValue.trim();
    }

    const config = loadConfig();
    for (const key of configKeys) {
        const value = config?.[key];
        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim();
        }
    }

    return undefined;
};

module.exports = {
    CONFIG_PATH,
    getConfig,
    getConfigValue,
};
