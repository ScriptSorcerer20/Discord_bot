const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { connectToDatabase } = require('../../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('Admin: grant coins to a user.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of coins to give')
                .setMinValue(1)
                .setRequired(true))
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('User to receive coins')
                .setRequired(true)),
    category: 'Currency',
    async execute(interaction) {
        const dbClient = await connectToDatabase();
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        if (target.bot) {
            return interaction.reply({
                content: 'You cannot grant coins to bot accounts.',
                ephemeral: true,
            });
        }
        const db = dbClient.db('discord');
        const collection = db.collection('currency');
        await collection.updateOne(
            { userID: target.id },
            { $inc: { balance: amount } },
            { upsert: true }
        );
        return interaction.reply({
            content: `You granted **${amount}** coins to ${target.tag}.`,
        });
    }
};
