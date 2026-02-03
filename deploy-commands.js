const path = require('node:path');
const { REST, Routes } = require('discord.js');
const { clientId, token } = require('./config.json');
const { loadCommandModules } = require('./loaders/commands');
const commandsPath = path.join(__dirname, 'commands');
const { commands, invalidCommands } = loadCommandModules(commandsPath);
const commandsData = commands.map((command) => command.data.toJSON());

for (const filePath of invalidCommands) {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
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
