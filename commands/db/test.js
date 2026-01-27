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
    category: 'Database',
    async execute(interaction) {
        const dbClient = await connectToDatabase();
        const message = interaction.options.getString('message');
        const db = dbClient.db('discord');
        const collection = db.collection('test');
        await collection.insertOne({ userId: interaction.user.id, message: message });
        await interaction.reply('Successfully inserted your data into MongoDB.');
    },
};
