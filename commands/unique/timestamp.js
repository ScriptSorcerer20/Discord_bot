const { SlashCommandBuilder } = require('discord.js');
const moment = require('moment'); // Install moment.js with `npm install moment`

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timestamp')
        .setDescription('Convert a human-readable date to a Discord timestamp.')
        .addStringOption(option =>
            option
                .setName('date')
                .setDescription('The date to convert (e.g., YYYY-MM-DD HH:mm)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('format')
                .setDescription('The format for the timestamp')
                .setRequired(false)
                .addChoices(
                    { name: 'Short time', value: 't' },
                    { name: 'Long time', value: 'T' },
                    { name: 'Short date', value: 'd' },
                    { name: 'Long date', value: 'D' },
                    { name: 'Full date and time', value: 'f' },
                    { name: 'Full date and time with weekday', value: 'F' },
                    { name: 'Relative time', value: 'R' },
                )),
    async execute(interaction) {
        // Get user input
        const dateInput = interaction.options.getString('date');
        const format = interaction.options.getString('format') || 'f'; // Default to 'f' format

        try {
            // Convert the date to a Unix timestamp
            const unixTimestamp = moment(dateInput, 'YYYY-MM-DD HH:mm').unix();

            if (isNaN(unixTimestamp)) {
                return interaction.reply({
                    content: 'Invalid date. Use the format `YYYY-MM-DD HH:mm`.',
                    ephemeral: true,
                });
            }

            // Construct the Discord timestamp
            const discordTimestamp = `<t:${unixTimestamp}:${format}>`;

            // Reply with the result
            await interaction.reply(
                `Here’s your Discord timestamp:\n${discordTimestamp}`
            );
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content:
                    'Invalid date format. Please use the format `YYYY-MM-DD HH:mm` (e.g., `2025-01-25 14:30`).',
                ephemeral: true,
            });
        }
    },
};