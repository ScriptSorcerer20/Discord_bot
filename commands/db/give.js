// exampleCommand.js
const { SlashCommandBuilder } = require('discord.js');
const { connectToDatabase } = require('../../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('give somebody coins')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('amount of the coins')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to give coins to')
                .setRequired(true)),
    async execute(interaction) {
        const dbClient = await connectToDatabase();
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');

        // Choose a DB + Collection
        const db = dbClient.db('discord');
        const collection = db.collection('currency');

        let targetData = await collection.findOne({ userID: target.id });
        if (!targetData) {
            await collection.insertOne({ userID: target.id, balance: 0 });
        }

        // Perform the transaction: subtract from sender and add to target.
        await collection.updateOne({ userID: target.id }, { $inc: { balance: amount } }, { upsert: true });

        return interaction.reply({ content: `You have given ${amount} coins to ${target.tag}.` });
    }
};