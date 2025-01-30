const {SlashCommandBuilder, EmbedBuilder} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("about")
        .setDescription("Information about this bot and creator"),
    async execute(interaction) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('About Page')
            .setDescription('I build this bot for managing my servers. (to lazy to write mor text rn)')
            .setImage('https://i.postimg.cc/QdZZwKVD/Screenshot-2024-12-25-005933.png')
            .setTimestamp();

        await interaction.reply({
            embeds: [exampleEmbed]
        })
    }
}