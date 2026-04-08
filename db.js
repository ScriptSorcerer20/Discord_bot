const { MongoClient, ServerApiVersion } = require('mongodb');
const { getConfigValue } = require('./config');

let dbClient;

async function connectToDatabase() {
    if (!dbClient) {
        const mongodbUri = getConfigValue('MONGODB_URI', 'mongodb', 'mongodbUri');
        if (!mongodbUri) {
            throw new Error('Missing MongoDB connection string. Set MONGODB_URI or config.json mongodb.');
        }

        dbClient = new MongoClient(mongodbUri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        });
        await dbClient.connect();
        console.log("Connected to MongoDB!");
        await dbClient.db("admin").command({ping: 1});
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    }
    return dbClient;
}

module.exports = {
    connectToDatabase
};
