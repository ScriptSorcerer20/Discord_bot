const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { recordModerationAction } = require('../../services/moderationRecords');

module.exports = {
    permissionGroup: 'moderation',
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick misbehaving people")
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The member to kick')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('The reason of the kick')),
    category: 'Moderation',
    async execute(interaction) {
        const user = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            const member = await interaction.guild.members.fetch(user.id);

            if (!member.kickable) {
                return interaction.reply({
                    content: 'I cannot kick that member. Check my role permissions and hierarchy.',
                    ephemeral: true,
                });
            }
            await member.kick(reason);
            await recordModerationAction({
                guildId: interaction.guildId,
                userId: user.id,
                action: 'kick',
                moderatorId: interaction.user.id,
                reason,
                metadata: {},
            });
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
