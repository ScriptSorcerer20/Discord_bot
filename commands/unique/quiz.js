const quiz = require('./quiz.json');
const {SlashCommandBuilder} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("quiz")
        .setDescription("Start a cool quiz"),
    async execute(interaction) {
        const item = quiz[Math.floor(Math.random() * quiz.length)];
        await interaction.reply({
            content: `**Quiz Time!**\n${item.question}\n\n_You have 30 seconds to answer!_`,
        });

        // Define a filter to check the correct answer
        const collectorFilter = (response) => {
            return (
                response.author.id === interaction.user.id && // Ensure it's the same user
                item.answers.some(
                    (answer) => answer.toLowerCase() === response.content.toLowerCase()
                )
            );
        };

        try {
            // Await messages in the same channel
            const collected = await interaction.channel.awaitMessages({
                filter: collectorFilter,
                max: 1,
                time: 30000, // 30 seconds
                errors: ['time'],
            });

            // If a message is collected, reply with the correct response
            const correctAnswer = collected.first();
            await interaction.followUp(
                `${correctAnswer.author} got the correct answer: **${correctAnswer.content}**! 🎉`
            );
        } catch (err) {
            // If no one answers in time
            await interaction.followUp(
                `⏳ Time's up! Nobody got the correct answer. The correct answers were: **${item.answers.join(', ')}**.`
            );
        }
    },
};