const { Events } = require('discord.js');
const { connectToDatabase } = require('../db.js');

module.exports = {
    name: Events.ClientReady,
    async execute(client) {
        const dbClient = await connectToDatabase();
        const db = dbClient.db('discord');
        const tempBanCollection = db.collection('tempban');

        // 2) Define a function to schedule unbans
        async function scheduleUnban(banData) {
            const delay = banData.banTime - Date.now();

            if (delay <= 0) {
                return;
            }
            setTimeout(async () => {
                try {
                    const guild = await client.guilds.fetch(banData.guildId);
                    await guild.bans.remove(banData.userId);

                    await tempBanCollection.deleteOne({ _id: banData._id });
                } catch (err) {
                    console.error('Error unbanning member:', err);
                }
            }, delay);
        }

        try {
            const allBans = await tempBanCollection.find({}).toArray();
            allBans.forEach(scheduleUnban);

            tempBanCollection.watch().on('change', (change) => {
                if (change.operationType === 'insert') {
                    const newBan = change.fullDocument;
                    scheduleUnban(newBan);
                }
            });
        } catch (err) {
            console.error('Error setting up unban system:', err);
        }
    },
};
