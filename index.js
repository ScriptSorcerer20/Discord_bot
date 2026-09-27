const path = require('node:path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { getConfigValue } = require('./config');
const { loadCommandModules } = require('./loaders/commands');
const { loadEventModules } = require('./loaders/events');
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const {
    commands,
    duplicateCommands,
    invalidCommands,
    loadErrors: commandLoadErrors,
} = loadCommandModules(commandsPath);
const eventsPath = path.join(__dirname, 'events');
const {
    events: eventModules,
    invalidEvents,
    loadErrors: eventLoadErrors,
} = loadEventModules(eventsPath);

for (const command of commands) {
    client.commands.set(command.data.name, command);
}

for (const filePath of invalidCommands) {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
}

for (const { commandName, filePath, existingFilePath } of duplicateCommands) {
    console.error(
        `[ERROR] Duplicate command name "${commandName}" in ${filePath}. Already registered by ${existingFilePath}.`,
    );
}

for (const { filePath, error } of commandLoadErrors) {
    console.error(`[ERROR] Failed to load command at ${filePath}:`, error);
}

for (const filePath of invalidEvents) {
    console.log(`[WARNING] The event at ${filePath} is missing a required "name" or "execute" property.`);
}

for (const { filePath, error } of eventLoadErrors) {
    console.error(`[ERROR] Failed to load event at ${filePath}:`, error);
}

for (const { event } of eventModules) {
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

if (duplicateCommands.length > 0 || commandLoadErrors.length > 0 || eventLoadErrors.length > 0) {
    console.error('Startup aborted because one or more modules failed validation.');
    process.exit(1);
}

const token = getConfigValue('DISCORD_BOT_TOKEN', 'token', 'discordBotToken');
if (!token) {
    console.error('Missing Discord bot token. Set DISCORD_BOT_TOKEN or config.json token.');
    process.exit(1);
}

client.login(token);
