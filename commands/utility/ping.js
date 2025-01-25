const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check if the bots responsivnes'),
    async execute(interaction) {
        await interaction.reply({ content: 'Pong! (Online)', ephemeral: true });
    },
};