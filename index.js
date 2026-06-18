const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);


const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");


// dotenv config
dotenv.config();


const app = express();


// middleware
app.use(cors());
app.use(express.json());


const port = process.env.PORT || 8008;


const uri = process.env.MONGO_URI;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


async function run() {
  try {
    await client.connect();
    const database = client.db(process.env.DB_NAME);


    console.log("BiblioDrop MongoDB Connected");
  } finally {
  }
}


run().catch(console.dir);


// home route
app.get("/", (req, res) => {
  res.send("BiblioDrop ~ Server is running");
});


app.listen(port, () => {
  console.log(`BiblioDrop-Server running on port ${port}`);
});
