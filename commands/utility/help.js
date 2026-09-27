const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Gives all available commands.'),
    category: 'Utility',
    async execute(interaction) {
        const commandDetails = interaction.client.commands
            .map((cmd) => ({
                name: cmd.data.name,
                description: cmd.data.description,
                category: cmd.category ?? 'Other',
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        const grouped = commandDetails.reduce((acc, command) => {
            const group = acc[command.category] ?? [];
            group.push(command);
            acc[command.category] = group;
            return acc;
        }, {});

        const fields = Object.keys(grouped)
            .sort((a, b) => a.localeCompare(b))
            .map((category) => ({
                name: category,
                value: grouped[category]
                    .map((command) => `- **/${command.name}**: ${command.description}`)
                    .join('\n'),
            }));

        const embed = new EmbedBuilder()
            .setColor(0x4b7bec)
            .setTitle('Available Commands')
            .setDescription('Here is everything I can do right now.')
            .addFields(fields)
            .setFooter({ text: `${commandDetails.length} commands loaded.` });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
