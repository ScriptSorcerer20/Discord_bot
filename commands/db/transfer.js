const { SlashCommandBuilder } = require('discord.js');
const { connectToDatabase } = require('../../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Send coins to another user.')
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('User to send coins to')
                .setRequired(true))
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount of coins to send')
                .setMinValue(1)
                .setRequired(true)),
    category: 'Currency',
    async execute(interaction) {
        const dbClient = await connectToDatabase();
        const db = dbClient.db('discord');
        const collection = db.collection('currency');

        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');

        if (target.bot) {
            return interaction.reply({
                content: 'You cannot transfer coins to a bot account.',
                ephemeral: true,
            });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({
                content: 'You cannot transfer coins to yourself.',
                ephemeral: true,
            });
        }

        const senderId = interaction.user.id;
        const debitResult = await collection.findOneAndUpdate(
            { userID: senderId, balance: { $gte: amount } },
            { $inc: { balance: -amount } },
            { returnDocument: 'after' }
        );

        if (!debitResult.value) {
            const senderData = await collection.findOne({ userID: senderId });
            const senderBalance = senderData?.balance ?? 0;
            return interaction.reply({
                content: `You only have **${senderBalance}** coins available.`,
                ephemeral: true,
            });
        }

        await collection.updateOne(
            { userID: target.id },
            { $inc: { balance: amount } },
            { upsert: true }
        );

        return interaction.reply({
            content: `You sent **${amount}** coins to ${target.tag}.`,
        });
    }
};
