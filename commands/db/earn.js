const { SlashCommandBuilder } = require('discord.js');
const { connectToDatabase } = require('../../db.js');

const REWARD_AMOUNT = 100;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

const formatDuration = (ms) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (!hours && !minutes) parts.push(`${seconds}s`);
    return parts.join(' ');
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('earn')
        .setDescription('Claim your daily coin reward.'),
    category: 'Currency',
    async execute(interaction) {
        const dbClient = await connectToDatabase();
        const db = dbClient.db('discord');
        const collection = db.collection('currency');
        const now = new Date();
        const userId = interaction.user.id;
        const userData = await collection.findOne({ userID: userId });
        const lastClaim = userData?.lastClaimedAt ? new Date(userData.lastClaimedAt) : null;
        if (lastClaim) {
            const elapsed = now - lastClaim;
            if (elapsed < COOLDOWN_MS) {
                const remaining = COOLDOWN_MS - elapsed;
                return interaction.reply({
                    content: `You already claimed your reward. Try again in **${formatDuration(remaining)}**.`,
                    ephemeral: true,
                });
            }
        }
        await collection.updateOne(
            { userID: userId },
            {
                $set: { lastClaimedAt: now.toISOString() },
                $inc: { balance: REWARD_AMOUNT },
            },
            { upsert: true }
        );
        return interaction.reply({
            content: `You earned **${REWARD_AMOUNT}** coins! Come back tomorrow for more.`,
        });
    }
};
