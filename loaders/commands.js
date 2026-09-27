const fs = require('node:fs');
const path = require('node:path');

const isJavaScriptFile = (file) => file.endsWith('.js');

const getCommandFilePaths = (commandsPath) => {
    const commandFilePaths = [];
    const entries = fs.readdirSync(commandsPath, { withFileTypes: true });

    for (const entry of entries) {
        const entryPath = path.join(commandsPath, entry.name);
        if (entry.isDirectory()) {
            commandFilePaths.push(...getCommandFilePaths(entryPath));
            continue;
        }
        if (entry.isFile() && isJavaScriptFile(entry.name)) {
            commandFilePaths.push(entryPath);
        }
    }

    return commandFilePaths.sort((left, right) => left.localeCompare(right));
};

const loadCommandModules = (commandsPath) => {
    const commandFiles = getCommandFilePaths(commandsPath);
    const commands = [];
    const invalidCommands = [];
    const duplicateCommands = [];
    const loadErrors = [];
    const commandNames = new Map();

    for (const filePath of commandFiles) {
        let command;
        try {
            delete require.cache[require.resolve(filePath)];
            command = require(filePath);
        } catch (error) {
            loadErrors.push({ filePath, error });
            continue;
        }

        const commandName = command?.data?.name;
        const isValidCommand =
            typeof commandName === 'string' &&
            commandName.length > 0 &&
            typeof command.execute === 'function';

        if (!isValidCommand) {
            invalidCommands.push(filePath);
            continue;
        }

        if (commandNames.has(commandName)) {
            duplicateCommands.push({
                commandName,
                filePath,
                existingFilePath: commandNames.get(commandName),
            });
            continue;
        }

        commandNames.set(commandName, filePath);
        commands.push(command);
    }

    return {
        commands,
        duplicateCommands,
        invalidCommands,
        loadErrors,
    };
};

module.exports = {
    getCommandFilePaths,
    loadCommandModules,
};
