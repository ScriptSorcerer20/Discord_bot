const { connectToDatabase } = require('../db');
const { updateStrikes } = require('./moderationRecords');

const WARNING_COLLECTION = 'warnings';

const getWarningsCollection = async () => {
    const client = await connectToDatabase();
    return client.db('discord').collection(WARNING_COLLECTION);
};

const addWarning = async ({ guildId, userId, moderatorId, reason }) => {
    const collection = await getWarningsCollection();
    const warningEntry = {
        reason,
        moderatorId,
        createdAt: new Date(),
    };

    const result = await collection.findOneAndUpdate(
        { guildId, userId },
        {
            $push: { warnings: warningEntry },
            $setOnInsert: { guildId, userId },
        },
        { upsert: true, returnDocument: 'after' },
    );

    const warnings = result.value?.warnings ?? [];
    const strikeCount = warnings.length;

    await updateStrikes({ guildId, userId, strikes: strikeCount });

    return { warnings, warningEntry, strikeCount };
};

const getWarnings = async ({ guildId, userId }) => {
    const collection = await getWarningsCollection();
    const record = await collection.findOne({ guildId, userId });

    return record?.warnings ?? [];
};

const clearWarnings = async ({ guildId, userId }) => {
    const collection = await getWarningsCollection();
    const result = await collection.findOneAndUpdate(
        { guildId, userId },
        { $set: { warnings: [] } },
        { returnDocument: 'after', upsert: true },
    );

    await updateStrikes({ guildId, userId, strikes: 0 });

    return result.value?.warnings ?? [];
};

module.exports = {
    addWarning,
    getWarnings,
    clearWarnings,
};
