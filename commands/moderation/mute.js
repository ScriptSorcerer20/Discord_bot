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
        const target = interaction.options.getUser('target');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason');

        // Convert duration to milliseconds
        const durationMs = duration * 60 * 1000;

        const guildmember = await interaction.guild.members.fetch(target.id);

        const muteRole = interaction.guild.roles.find(role => role.name === "mute");
        if (!muteRole) {

        } else {
            await guildmember.roles.add(muteRole, reason);
        }
    },
};