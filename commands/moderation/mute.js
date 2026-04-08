const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { recordModerationAction } = require('../../services/moderationRecords');

module.exports = {
    permissionGroup: 'moderation',
    data: new SlashCommandBuilder()
        .setName("mute")
        .setDescription("Temporarily mute a member with a timeout.")
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The member to mute')
                .setRequired(true))
        .addIntegerOption(option =>
            option
                .setName('duration')
                .setDescription('The duration of the mute (in minutes)')
                .setMinValue(1)
                .setMaxValue(40320)
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('The reason of the mute')),
    category: 'Moderation',
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'This command can only be used inside a server.',
                ephemeral: true,
            });
        }
        const target = interaction.options.getUser('target');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const durationMs = duration * 60 * 1000;
        const member = await interaction.guild.members.fetch(target.id);

        if (!member.moderatable) {
            return interaction.reply({
                content: 'I cannot mute that member. Check my role permissions and hierarchy.',
                ephemeral: true,
            });
        }

        await member.timeout(durationMs, reason);
        await recordModerationAction({
            guildId: interaction.guildId,
            userId: target.id,
            action: 'mute',
            moderatorId: interaction.user.id,
            reason,
            metadata: { durationMinutes: duration },
            stateUpdates: { mutedUntil: new Date(Date.now() + durationMs) },
        });

        return interaction.reply({
            content: `Muted ${target.tag} for **${duration} minutes**. Reason: ${reason}`,
        });
    },
};
