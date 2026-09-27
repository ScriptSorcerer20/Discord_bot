const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const ensureRoleEditable = (role) => {
    if (role.managed) {
        return 'That role is managed by an integration and cannot be modified.';
    }

    if (!role.editable) {
        return 'I cannot manage that role. Check my role permissions and hierarchy.';
    }

    return null;
};

module.exports = {
    permissionGroup: 'moderation',
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Assign or remove roles from members.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a role to a member.')
                .addUserOption(option =>
                    option
                        .setName('target')
                        .setDescription('The member to update')
                        .setRequired(true))
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to add')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a role from a member.')
                .addUserOption(option =>
                    option
                        .setName('target')
                        .setDescription('The member to update')
                        .setRequired(true))
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to remove')
                        .setRequired(true))),
    category: 'Moderation',
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'This command can only be used inside a server.', ephemeral: true });
        }
        const target = interaction.options.getUser('target');
        const role = interaction.options.getRole('role');
        const action = interaction.options.getSubcommand();

        const roleError = ensureRoleEditable(role);
        if (roleError) {
            return interaction.reply({ content: roleError, ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(target.id);

        if (action === 'add') {
            if (member.roles.cache.has(role.id)) {
                return interaction.reply({
                    content: `${target.tag} already has ${role.name}.`,
                    ephemeral: true,
                });
            }

            await member.roles.add(role);

            return interaction.reply({
                content: `Added ${role.name} to ${target.tag}.`,
            });
        }

        if (!member.roles.cache.has(role.id)) {
            return interaction.reply({
                content: `${target.tag} does not have ${role.name}.`,
                ephemeral: true,
            });
        }

        await member.roles.remove(role);

        return interaction.reply({
            content: `Removed ${role.name} from ${target.tag}.`,
        });
    },
};
