const { Events } = require('discord.js');
const { connectToDatabase } = require('../db.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);

        try {
            await connectToDatabase();
            
        } catch (err) {
            console.error("MongoDB connection error:", err);
        }
    },
};
