const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} = require('discord.js');
const { recordModerationAction } = require('../../services/moderationRecords');
const { isCommandAllowed } = require('../../services/permissions');

const activeGuilds = new Set();

const fetchModerator = async (interaction) => {
    const [moderator, bot] = await Promise.all([
        interaction.guild.members.fetch({ user: interaction.user.id, force: true }),
        interaction.guild.members.fetchMe({ force: true }),
    ]);
    if (!moderator.permissions.has(PermissionFlagsBits.BanMembers)) {
        throw new Error('You need the Ban Members permission to use this command.');
    }
    if (!bot.permissions.has(PermissionFlagsBits.BanMembers)) {
        throw new Error('I need the Ban Members permission to use this command.');
    }
    return moderator;
};

const canBan = (member, moderator, interaction) =>
    member.id !== interaction.user.id &&
    member.id !== interaction.client.user.id &&
    member.id !== interaction.guild.ownerId &&
    member.bannable &&
    (moderator.id === interaction.guild.ownerId ||
        moderator.roles.highest.comparePositionTo(member.roles.highest) > 0);

module.exports = {
    mod: true,
    permissionGroup: 'moderation',
    category: 'Moderation',
    data: new SlashCommandBuilder()
        .setName('ban-role')
        .setDescription('Permanently ban members with a role after confirming a preview.')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addRoleOption(option => option
            .setName('role')
            .setDescription('The role whose members should be banned')
            .setRequired(true))
        .addStringOption(option => option
            .setName('reason')
            .setDescription('The reason for banning these members')
            .setMinLength(1)
            .setMaxLength(400)
            .setRequired(true)),
    async execute(interaction) {
        const guild = interaction.guild;
        const reject = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
        if (!guild) {
            return reject('This command can only be used inside a server.');
        }
        const role = interaction.options.getRole('role');
        const reason = interaction.options.getString('reason').trim();
        if (role.id === guild.id) {
            return reject('You cannot use this command with @everyone.');
        }
        if (!reason) {
            return reject('Please provide a reason for the bans.');
        }
        if (activeGuilds.has(guild.id)) {
            return reject('A role ban is already being previewed or processed in this server.');
        }

        activeGuilds.add(guild.id);
        const counts = { banned: 0, skipped: 0, failed: 0, logFailed: 0 };
        let started = false;
        let editReply = (payload) => interaction.editReply(payload);
        const summary = () => `Banned: ${counts.banned}. Skipped: ${counts.skipped}. Failed: ${counts.failed}.` +
            (counts.logFailed ? ` Moderation records could not be saved for ${counts.logFailed} successful bans.` : '');
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await guild.roles.fetch();
            const moderator = await fetchModerator(interaction);
            const candidateIds = [];
            let after;
            // REST pagination includes uncached members without requesting a full Gateway member cache.
            do {
                let page;
                try {
                    page = await guild.members.list({ limit: 1000, after, cache: false });
                } catch (error) {
                    console.error('Failed to list members for role ban:', error);
                    return await editReply({
                        content: 'Could not load all server members. Check that Server Members Intent is enabled ' +
                            'in the Discord Developer Portal, then try again. No members were banned.',
                    });
                }
                for (const member of page.values()) {
                    if (!member.roles.cache.has(role.id)) continue;
                    if (canBan(member, moderator, interaction)) candidateIds.push(member.id);
                    else counts.skipped++;
                }
                if (page.size < 1000) break;
                after = page.lastKey();
            } while (true);

            if (!candidateIds.length) {
                return await editReply({
                    content: `No eligible members have <@&${role.id}>. Skipped: ${counts.skipped}.`,
                    allowedMentions: { parse: [] },
                });
            }

            const confirmId = `ban-role:confirm:${interaction.id}`;
            const cancelId = `ban-role:cancel:${interaction.id}`;
            const reply = await editReply({
                content: `Permanently ban **${candidateIds.length}** members with <@&${role.id}>?\n` +
                    `Skipped: ${counts.skipped} (yourself, the server owner, this bot, or members outside the role hierarchy).\n` +
                    `Reason: ${reason}\nExisting messages will be kept. Confirm within 60 seconds.`,
                allowedMentions: { parse: [] },
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(confirmId).setLabel('Ban members').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
                )],
            });

            let confirmation;
            try {
                confirmation = await reply.awaitMessageComponent({
                    componentType: ComponentType.Button,
                    time: 60_000,
                    filter: component => component.user.id === interaction.user.id &&
                        [confirmId, cancelId].includes(component.customId),
                });
            } catch (error) {
                return await editReply({ content: 'Confirmation expired. No members were banned.', components: [] });
            }
            await confirmation.update({
                content: confirmation.customId === cancelId ? 'Cancelled. No members were banned.' : 'Checking permissions and banning members...',
                components: [],
            });
            // Use the fresh component token for the final result of a potentially long batch.
            editReply = (payload) => confirmation.editReply(payload);
            if (confirmation.customId === cancelId) return;

            await guild.roles.fetch();
            const currentModerator = await fetchModerator(interaction);
            const allowed = await isCommandAllowed({
                guildId: guild.id,
                userId: interaction.user.id,
                member: currentModerator,
                commandName: 'ban-role',
                permissionGroup: 'moderation',
            });
            if (!allowed) {
                return await editReply({ content: 'You no longer have permission to use this command. No members were banned.' });
            }

            started = true;
            let processed = 0;
            const deadline = Date.now() + 14 * 60_000;
            for (const memberId of candidateIds) {
                if (Date.now() >= deadline) break;
                // Permissions and role membership may have changed since the preview.
                const freshModerator = await fetchModerator(interaction);
                let member;
                try {
                    member = await guild.members.fetch({ user: memberId, force: true, cache: false });
                } catch (error) {
                    if (error.code === 10007) counts.skipped++; // Member left the server.
                    else {
                        counts.failed++;
                        console.error(`Failed to fetch role-ban member ${memberId}:`, error);
                    }
                    processed++;
                    continue;
                }
                processed++;
                if (!member.roles.cache.has(role.id) || !canBan(member, freshModerator, interaction)) {
                    counts.skipped++;
                    continue;
                }
                try {
                    await guild.bans.create(memberId, {
                        reason: `Role ban (${role.id}) by ${interaction.user.id}: ${reason}`,
                        deleteMessageSeconds: 0,
                    });
                    counts.banned++;
                } catch (error) {
                    counts.failed++;
                    console.error(`Failed to ban member ${memberId} with role ${role.id}:`, error);
                    continue;
                }
                try {
                    await recordModerationAction({
                        guildId: guild.id,
                        userId: memberId,
                        action: 'ban',
                        moderatorId: interaction.user.id,
                        reason,
                        metadata: { command: 'ban-role', roleId: role.id },
                        stateUpdates: { isBanned: true, bannedUntil: null },
                    });
                } catch (error) {
                    counts.logFailed++;
                    console.error(`Failed to record role ban for ${memberId}:`, error);
                }
            }
            const remaining = candidateIds.length - processed;
            return await editReply({
                content: `${summary()}` + (remaining ? ` Time limit reached; ${remaining} members were not processed. Run the command again to continue.` : ''),
                components: [],
            });
        } catch (error) {
            console.error('Role ban stopped:', error);
            return await editReply({
                content: `Role ban stopped: ${error.message}\n${started ? summary() + ' Remaining members were not processed.' : 'No members were banned.'}`,
                components: [],
                allowedMentions: { parse: [] },
            });
        } finally {
            activeGuilds.delete(guild.id);
        }
    },
};
