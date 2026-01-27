const {MongoClient, ServerApiVersion} = require('mongodb');
const {mongodb} = require("./config.json");

let dbClient;

async function connectToDatabase() {
    if (!dbClient) {
        dbClient = new MongoClient(mongodb, {
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
