const { SlashCommandBuilder} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Gives all available commands.'),
    async execute(interaction) {
        // Map over the full command objects to get names and descriptions
        const commandDetails = interaction.client.commands.map(cmd => ({
            name: cmd.data.name,
            description: cmd.data.description,
        }));

        // Format the commands into a user-friendly help message
        const helpMessage = commandDetails
            .map(detail => `/${detail.name} - ${detail.description}`)
            .join('\n');

        // Send the help message
        await interaction.reply(`Here are all the available commands:\n\n${helpMessage}`);

    },
};