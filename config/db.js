const { MongoClient, ServerApiVersion } = require("mongodb");
const dotenv = require("dotenv");
dotenv.config();

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let database;

async function connectDB() {
  if (!database) {
    // await client.connect();
    database = client.db(process.env.DB_NAME);
    console.log("BiblioDrop MongoDB Connected Successfully");
  }
  return database;
}

function getCollections() {
  if (!database) throw new Error("Database not connected yet!");
  return {
    usersCollection: database.collection("user"),
    booksCollection: database.collection("books"),
    ordersCollection: database.collection("orders"),
    reviewsCollection: database.collection("reviews"),
    wishlistCollection: database.collection("wishlist"),
  };
}

module.exports = { connectDB, getCollections };