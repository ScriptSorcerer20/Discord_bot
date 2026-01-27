const fs = require('node:fs');
const path = require('node:path');

const isJavaScriptFile = (file) => file.endsWith('.js');

const getEventFilePaths = (eventsPath) =>
    fs
        .readdirSync(eventsPath)
        .filter(isJavaScriptFile)
        .map((file) => path.join(eventsPath, file));

const loadEventModules = (eventsPath) => {
    const eventFiles = getEventFilePaths(eventsPath);
    return eventFiles.map((filePath) => ({
        filePath,
        event: require(filePath),
    }));
};

module.exports = {
    loadEventModules,
};
