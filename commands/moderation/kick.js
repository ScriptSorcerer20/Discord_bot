const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick misbehaving people")
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The member to kick')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('The reason of the kick')),
    async execute(interaction) {
        const user = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            const member = await interaction.guild.members.fetch(user.id);

            await member.kick(reason);

            await interaction.reply(`Kicked ${user.tag} for: ${reason}`);
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: 'I was not able to kick the user..',
                ephemeral: true,
            });
        }
    },
};
