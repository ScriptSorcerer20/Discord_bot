const fs = require('node:fs');
const path = require('node:path');

const isJavaScriptFile = (file) => file.endsWith('.js');

const getEventFilePaths = (eventsPath) =>
    fs
        .readdirSync(eventsPath)
        .filter(isJavaScriptFile)
        .sort((left, right) => left.localeCompare(right))
        .map((file) => path.join(eventsPath, file));

const loadEventModules = (eventsPath) => {
    const eventFiles = getEventFilePaths(eventsPath);
    const events = [];
    const invalidEvents = [];
    const loadErrors = [];

    for (const filePath of eventFiles) {
        let event;
        try {
            delete require.cache[require.resolve(filePath)];
            event = require(filePath);
        } catch (error) {
            loadErrors.push({ filePath, error });
            continue;
        }

        if (typeof event?.name !== 'string' || typeof event?.execute !== 'function') {
            invalidEvents.push(filePath);
            continue;
        }

        events.push({ filePath, event });
    }

    return {
        events,
        invalidEvents,
        loadErrors,
    };
};

module.exports = {
    getEventFilePaths,
    loadEventModules,
};
