const { Events } = require('discord.js');
const { connectToDatabase } = require('../db.js');
const { clearBanStatus } = require('../services/moderationRecords');

module.exports = {
    name: Events.ClientReady,
    async execute(client) {
        const dbClient = await connectToDatabase();
        const db = dbClient.db('discord');
        const tempBanCollection = db.collection('tempban');
        const scheduledBanIds = new Set();
        let pollingInterval = null;
        async function scheduleUnban(banData) {
            const banId = banData?._id?.toString();
            if (banId && scheduledBanIds.has(banId)) {
                return;
            }
            if (banId) {
                scheduledBanIds.add(banId);
            }
            const delay = banData.banTime - Date.now();

            if (delay <= 0) {
                return;
            }
            setTimeout(async () => {
                try {
                    const guild = await client.guilds.fetch(banData.guildId);
                    await guild.bans.remove(banData.userId);

                    await tempBanCollection.deleteOne({ _id: banData._id });
                    await clearBanStatus({
                        guildId: banData.guildId,
                        userId: banData.userId,
                    });
                } catch (err) {
                    console.error('Error unbanning member:', err);
                } finally {
                    if (banId) {
                        scheduledBanIds.delete(banId);
                    }
                }
            }, delay);
        }

        async function loadAndScheduleBans() {
            const allBans = await tempBanCollection.find({}).toArray();
            allBans.forEach(scheduleUnban);
        }

        function startPollingFallback() {
            if (pollingInterval) {
                return;
            }
            pollingInterval = setInterval(() => {
                loadAndScheduleBans().catch((err) => {
                    console.error('Error polling temp bans:', err);
                });
            }, 60_000);
        }

        try {
            await loadAndScheduleBans();

            const changeStream = tempBanCollection.watch();
            changeStream.on('change', (change) => {
                if (change.operationType === 'insert') {
                    const newBan = change.fullDocument;
                    scheduleUnban(newBan);
                }
            });
            changeStream.on('error', (err) => {
                if (err?.code === 40573) {
                    startPollingFallback();
                } else {
                    console.error('Change stream error:', err);
                }
            });
        } catch (err) {
            if (err?.code === 40573) {
                startPollingFallback();
            } else {
                console.error('Error setting up unban system:', err);
            }
        }
    },
};
