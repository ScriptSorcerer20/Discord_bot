const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { addWarning } = require('../../services/warnings');
const { getGuildSettings } = require('../../services/guildSettings');
const { recordModerationAction } = require('../../services/moderationRecords');
const { connectToDatabase } = require('../../db');

const MAX_REASON_LENGTH = 500;

module.exports = {
    permissionGroup: 'moderation',
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a member and track strikes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The member to warn')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('The reason for the warning')
                .setRequired(true)),
    category: 'Moderation',
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');

        if (!interaction.guildId) {
            return interaction.reply({
                content: 'Warnings can only be issued inside a server.',
                ephemeral: true,
            });
        }
        if (reason.length > MAX_REASON_LENGTH) {
            return interaction.reply({
                content: `Reason must be ${MAX_REASON_LENGTH} characters or fewer.`,
                ephemeral: true,
            });
        }

        const { warnings, strikeCount } = await addWarning({
            guildId: interaction.guildId,
            userId: target.id,
            moderatorId: interaction.user.id,
            reason,
        });

        const settings = await getGuildSettings(interaction.guildId);
        const thresholds = settings.moderation?.strikeThresholds ?? {};
        const muteThreshold = Number.isInteger(thresholds.mute) ? thresholds.mute : null;
        const kickThreshold = Number.isInteger(thresholds.kick) ? thresholds.kick : null;
        const banThreshold = Number.isInteger(thresholds.ban) ? thresholds.ban : null;
        const muteDurationMinutes = settings.moderation?.muteDurationMinutes ?? 0;
        const banDurationMs = settings.moderation?.banDurationMs ?? 0;

        let actionTaken = null;

        if (banThreshold && strikeCount === banThreshold) {
            actionTaken = 'ban';
        } else if (kickThreshold && strikeCount === kickThreshold) {
            actionTaken = 'kick';
        } else if (muteThreshold && strikeCount === muteThreshold) {
            actionTaken = 'mute';
        }

        if (actionTaken === 'mute') {
            try {
                const member = await interaction.guild.members.fetch(target.id);
                if (member.moderatable && muteDurationMinutes > 0) {
                    const durationMs = muteDurationMinutes * 60 * 1000;
                    await member.timeout(durationMs, 'Strike threshold reached');
                    await recordModerationAction({
                        guildId: interaction.guildId,
                        userId: target.id,
                        action: 'mute',
                        moderatorId: interaction.user.id,
                        reason: 'Strike threshold reached',
                        metadata: { strikeCount, durationMinutes: muteDurationMinutes },
                        stateUpdates: { mutedUntil: new Date(Date.now() + durationMs) },
                    });
                }
            } catch (error) {
                console.error('Failed to auto-mute member:', error);
            }
        }

        if (actionTaken === 'kick') {
            try {
                const member = await interaction.guild.members.fetch(target.id);
                if (member.kickable) {
                    await member.kick('Strike threshold reached');
                    await recordModerationAction({
                        guildId: interaction.guildId,
                        userId: target.id,
                        action: 'kick',
                        moderatorId: interaction.user.id,
                        reason: 'Strike threshold reached',
                        metadata: { strikeCount },
                    });
                }
            } catch (error) {
                console.error('Failed to auto-kick member:', error);
            }
        }

        if (actionTaken === 'ban') {
            try {
                const banReason = 'Strike threshold reached';
                const shouldTempBan = Number.isInteger(banDurationMs) && banDurationMs > 0;

                await interaction.guild.bans.create(target.id, {
                    reason: banReason,
                });

                if (shouldTempBan) {
                    const dbClient = await connectToDatabase();
                    const db = dbClient.db('discord');
                    const tempBanCollection = db.collection('tempban');
                    const banUntil = Date.now() + banDurationMs;
                    await tempBanCollection.insertOne({
                        guildId: interaction.guildId,
                        userId: target.id,
                        banTime: banUntil,
                        reason: banReason,
                    });
                }

                await recordModerationAction({
                    guildId: interaction.guildId,
                    userId: target.id,
                    action: 'ban',
                    moderatorId: interaction.user.id,
                    reason: banReason,
                    metadata: { strikeCount, banDurationMs },
                    stateUpdates: {
                        isBanned: true,
                        bannedUntil: shouldTempBan ? new Date(Date.now() + banDurationMs) : null,
                    },
                });
            } catch (error) {
                console.error('Failed to auto-ban member:', error);
            }
        }

        return interaction.reply({
            content: `${target.tag} has been warned. Total strikes: **${warnings.length}**.`,
        });
    },
};
