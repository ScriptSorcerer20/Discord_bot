const path = require('node:path');
const { loadCommandModules } = require('../loaders/commands');
const { loadEventModules } = require('../loaders/events');
const { createDashboardApp } = require('../dashboardServer');

const commandsPath = path.join(__dirname, '..', 'commands');
const eventsPath = path.join(__dirname, '..', 'events');

const commandResult = loadCommandModules(commandsPath);
const eventResult = loadEventModules(eventsPath);

let hasFailures = false;

const printFailures = (heading, values) => {
    if (!values || values.length === 0) {
        return;
    }

    hasFailures = true;
    console.error(heading);
    for (const value of values) {
        console.error(`- ${value}`);
    }
};

printFailures('Invalid command modules:', commandResult.invalidCommands);
printFailures(
    'Duplicate command names:',
    commandResult.duplicateCommands.map(
        ({ commandName, filePath, existingFilePath }) =>
            `${commandName}: ${filePath} conflicts with ${existingFilePath}`,
    ),
);
printFailures(
    'Command load errors:',
    commandResult.loadErrors.map(({ filePath, error }) => `${filePath}: ${error.message}`),
);
printFailures('Invalid event modules:', eventResult.invalidEvents);
printFailures(
    'Event load errors:',
    eventResult.loadErrors.map(({ filePath, error }) => `${filePath}: ${error.message}`),
);

if (typeof createDashboardApp !== 'function') {
    hasFailures = true;
    console.error('Dashboard app factory is not exported correctly.');
}

if (!hasFailures) {
    console.log(
        `Verification passed: ${commandResult.commands.length} commands and ${eventResult.events.length} events loaded successfully.`,
    );
}

process.exit(hasFailures ? 1 : 0);
