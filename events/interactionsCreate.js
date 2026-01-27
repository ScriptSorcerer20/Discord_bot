const {Events, MessageFlags} = require('discord.js');
const {isCommandAllowed} = require('../services/permissions');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }
        try {
            const allowed = await isCommandAllowed({
                guildId: interaction.guildId,
                userId: interaction.user.id,
                member: interaction.member,
                commandName: interaction.commandName,
                permissionGroup: command.permissionGroup,
            });
            if (!allowed) {
                await interaction.reply({
                    content: 'You do not have permission to use this command.',
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'There was an error while executing this command!',
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: 'There was an error while executing this command!',
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    },
};
