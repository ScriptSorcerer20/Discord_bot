const path = require('node:path');
const { REST, Routes } = require('discord.js');
const { getConfigValue } = require('./config');
const { loadCommandModules } = require('./loaders/commands');

const commandsPath = path.join(__dirname, 'commands');
const {
    commands,
    duplicateCommands,
    invalidCommands,
    loadErrors,
} = loadCommandModules(commandsPath);
const commandsData = commands.map((command) => command.data.toJSON());
const clientId = getConfigValue('DISCORD_CLIENT_ID', 'discordClientId', 'clientId', 'appId');
const token = getConfigValue('DISCORD_BOT_TOKEN', 'discordBotToken', 'token');

for (const filePath of invalidCommands) {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
}

for (const { commandName, filePath, existingFilePath } of duplicateCommands) {
    console.error(
        `[ERROR] Duplicate command name "${commandName}" in ${filePath}. Already registered by ${existingFilePath}.`,
    );
}

for (const { filePath, error } of loadErrors) {
    console.error(`[ERROR] Failed to load command at ${filePath}:`, error);
}

if (!clientId || !token) {
    console.error('Missing Discord client ID or bot token. Set env vars or config.json values.');
    process.exit(1);
}

if (duplicateCommands.length > 0 || loadErrors.length > 0) {
    console.error('Command deployment aborted because one or more command modules failed validation.');
    process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
    try {
        console.log(`Started refreshing ${commandsData.length} application (/) commands.`);
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commandsData },
        );
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
