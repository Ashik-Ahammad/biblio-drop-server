const express = require("express");
const { getCollections } = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { booksCollection, usersCollection, ordersCollection } = getCollections();
    const totalBooks = await booksCollection.countDocuments();
    const totalReaders = await usersCollection.countDocuments();
    const totalOrders = await ordersCollection.countDocuments();

    res.status(200).json({ totalBooks, totalReaders, totalOrders });
  } catch (error) {
    res.status(500).json({ message: "Error fetching stats" });
  }
});

module.exports = router;