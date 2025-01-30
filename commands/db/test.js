// exampleCommand.js
const { SlashCommandBuilder } = require('discord.js');
const { connectToDatabase } = require('../../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('example')
        .setDescription('An example DB usage')
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('string to store')
                .setRequired(true)),
    async execute(interaction) {
        const dbClient = await connectToDatabase();
        const message = interaction.options.getString('message');

        // Choose a DB + Collection
        const db = dbClient.db('discord');
        const collection = db.collection('test');

        // Example: Insert something
        await collection.insertOne({ userId: interaction.user.id, message: message });

        await interaction.reply('Successfully inserted your data into MongoDB.');
    },
};
