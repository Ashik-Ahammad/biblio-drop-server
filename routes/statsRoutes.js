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

router.get("/top-librarians", async (req, res) => {
  try {
    const { usersCollection, ordersCollection } = getCollections();
    
    // Aggregate top 3 librarian emails from Delivered orders
    const topEmails = await ordersCollection.aggregate([
      { $match: { status: "Delivered" } },
      { $group: { _id: "$book.librarianEmail", deliveries: { $sum: 1 } } },
      { $sort: { deliveries: -1 } },
      { $limit: 3 }
    ]).toArray();

    const topLibrarians = await Promise.all(topEmails.map(async (entry) => {
      const email = entry._id;
      let user = null;
      if (email) {
        user = await usersCollection.findOne({ email });
      }
      
      const name = user?.name || (email ? email.split("@")[0] : "Unknown");
      const avatar = user?.image || `https://ui-avatars.com/api/?name=${email}&background=10b981&color=fff`;
      
      return {
        name,
        avatar,
        deliveries: entry.deliveries
      };
    }));

    res.status(200).json(topLibrarians);
  } catch (error) {
    console.error("Error fetching top librarians:", error);
    res.status(500).json({ message: "Error fetching top librarians" });
  }
});

router.get("/popular-categories", async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const categoriesCount = await booksCollection.aggregate([
      { $match: { category: { $exists: true, $ne: "" }, status: { $ne: "Pending" } } }, 
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]).toArray();
    
    const result = {};
    categoriesCount.forEach(item => {
      result[item._id] = item.count;
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching popular categories:", error);
    res.status(500).json({ message: "Error fetching popular categories" });
  }
});

module.exports = router;