const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { connectToDatabase } = require('../../db.js');

module.exports = {
    mod: true,
    data: new SlashCommandBuilder()
        .setName("temp-ban")
        .setDescription("Kick misbehaving people")
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('The member to kick')
                .setRequired(true))
        .addIntegerOption(option =>
            option
                .setName('durationms')
                .setDescription('Duration of the temporary ban (in milliseconds).')
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
    async execute(interaction) {
        const user = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');
        const durationms = interaction.options.getInteger('durationms');
        const deleteMessages = interaction.options.getInteger('delete-messages');

        // If you want to parse time like "1d", "10m", etc., use ms package:
        let banUntil;
        try {
            banUntil = Date.now() + durationms;
        } catch (e) {
            // If parsing fails, handle error
            return interaction.reply({
                content: 'Invalid duration format. Please use something like "10m" or "1d".',
                ephemeral: true
            });
        }


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
            await tempBanCollection.insertOne({
                guildId: interaction.guild.id,
                userId: user.id,
                banTime: banUntil,
                reason: reason,
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
