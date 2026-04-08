const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { connectToDatabase } = require('../../db.js');
const { recordModerationAction } = require('../../services/moderationRecords');

module.exports = {
    mod: true,
    permissionGroup: 'moderation',
    data: new SlashCommandBuilder()
        .setName("temp-ban")
        .setDescription("Temporarily ban a member.")
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The member to ban')
                .setRequired(true))
        .addIntegerOption(option =>
            option
                .setName('durationms')
                .setDescription('Duration of the temporary ban (in milliseconds).')
                .setMinValue(60_000)
                .setMaxValue(2_592_000_000)
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(true))
    .addIntegerOption(option =>
        option
            .setName('delete-messages')
            .setDescription('Number of days to delete messages')
            .setMinValue(0).setMaxValue(7)),
    category: 'Moderation',
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'This command can only be used inside a server.',
                ephemeral: true,
            });
        }
        const user = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');
        const durationms = interaction.options.getInteger('durationms');
        const deleteMessages = interaction.options.getInteger('delete-messages');

        if (user.bot) {
            return interaction.reply({
                content: 'You cannot temp-ban a bot account.',
                ephemeral: true,
            });
        }

        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: 'You cannot temp-ban yourself.',
                ephemeral: true,
            });
        }

        // If you want to parse time like "1d", "10m", etc., use ms package:
        if (!Number.isFinite(durationms) || durationms <= 0) {
            return interaction.reply({
                content: 'Invalid duration. Provide a positive number of milliseconds.',
                ephemeral: true,
            });
        }

        const banUntil = Date.now() + durationms;


        // A function to send ephemeral messages
        async function sendEphemeral(message) {
            const embed = new EmbedBuilder()
                .setColor("Blurple")
                .setDescription(message);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // Check if user is already banned
        const bans = await interaction.guild.bans.fetch();
        if (bans.has(user.id)) {
            return sendEphemeral("That user is already banned");
        }

        // --------- STORE BAN DATA IN MONGODB ---------
        try {
            // 1. Get or create the MongoDB client
            const dbClient = await connectToDatabase();

            // 2. Access a DB and a collection
            const db = dbClient.db("discord");
            const tempBanCollection = db.collection("tempban");

            // 3. Insert the ban record
            const banRecord = {
                guildId: interaction.guild.id,
                userId: user.id,
                banTime: banUntil,
                reason: reason,
            };
            await tempBanCollection.insertOne(banRecord);
            await recordModerationAction({
                guildId: interaction.guild.id,
                userId: user.id,
                action: 'temp-ban',
                moderatorId: interaction.user.id,
                reason,
                metadata: { durationMs: durationms },
                stateUpdates: {
                    isBanned: true,
                    bannedUntil: new Date(banUntil),
                },
            });
        } catch (err) {
            console.error(err);
            return sendEphemeral("Could not insert ban record into DB.");
        }

        // --------- BAN THE USER IN DISCORD ---------
        let error = false;
        try {
            await interaction.guild.bans.create(user.id, {
                reason: reason,
                deleteMessageDays: deleteMessages,
            });
        } catch (err) {
            error = true;
            console.error(err);
        }

        if (error) {
            return sendEphemeral("Something went wrong banning the user.");
        } else {
            return sendEphemeral(
                `${user} has been banned for **${durationms}** for *${reason}*`
            );
        }
    },
};
