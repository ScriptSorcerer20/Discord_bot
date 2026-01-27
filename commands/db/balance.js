const { SlashCommandBuilder } = require('discord.js');
const { connectToDatabase } = require('../../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your coin balance or another user\'s balance.')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to check (defaults to you)')
                .setRequired(false)),
    category: 'Currency',
    async execute(interaction) {
        const dbClient = await connectToDatabase();
        const db = dbClient.db('discord');
        const collection = db.collection('currency');
        const target = interaction.options.getUser('user') ?? interaction.user;
        const targetData = await collection.findOne({ userID: target.id });
        const balance = targetData?.balance ?? 0;
        return interaction.reply({
            content: `${target.tag} has **${balance}** coins.`,
        });
    }
};
