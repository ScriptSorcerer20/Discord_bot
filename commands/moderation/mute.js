const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("mute")
        .setDescription("mute misbehaving people")
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The member to mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option
                .setName('duration')
                .setDescription('The duration of the Mute (Minutes)')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('The reason of the mute')),
    async execute(interaction) {
        // Get the user and duration from the command options
        const target = interaction.options.getUser('target');
        const duration = interaction.options.getInteger('duration');

        // Convert duration to milliseconds
        const durationMs = duration * 60 * 1000;

        try {
            // Apply the timeout
            await target.timeout(durationMs);

            await interaction.reply({
                content: `${target.tag} has been muted for ${duration} minutes.`
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: 'I was unable to mute the member.',
                ephemeral: true,
            });
        }
    },
};