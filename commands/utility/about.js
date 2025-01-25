const {SlashCommandBuilder} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("about")
        .setDescription("Information about this bot"),
    async execute(interaction) {
        await interaction.reply({
            content: "This bot has some general commands for moderation, but includes on or two unqiue features, like the currenc system. It's a small project to enhanced the programming skills of the creator.",
            ephemeral: true
        })
    }
}