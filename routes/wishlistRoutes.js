const express = require("express");
const { getCollections } = require("../config/db");
const { verifyToken } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/toggle", verifyToken, async (req, res) => {
  try {
    const { wishlistCollection } = getCollections();
    const { email, book } = req.body;
    const existing = await wishlistCollection.findOne({ email: email, bookId: book._id });
    if (existing) {
      await wishlistCollection.deleteOne({ _id: existing._id });
      res.status(200).json({ success: true, action: "removed", message: "Removed from wishlist" });
    } else {
      const wishlistItem = { email, bookId: book._id, title: book.title, author: book.author || "Unknown", coverImage: book.coverImage, deliveryFee: book.deliveryFee, addedAt: new Date() };
      await wishlistCollection.insertOne(wishlistItem);
      res.status(200).json({ success: true, action: "added", message: "Added to wishlist" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/check", verifyToken, async (req, res) => {
  try {
    const { wishlistCollection } = getCollections();
    const { email, bookId } = req.query;
    if (!email || !bookId) return res.json({ inWishlist: false });
    const item = await wishlistCollection.findOne({ email, bookId });
    res.status(200).json({ success: true, inWishlist: !!item });
  } catch (error) {
    res.status(500).json({ success: false, inWishlist: false });
  }
});

router.get("/:email", verifyToken, async (req, res) => {
  try {
    const { wishlistCollection } = getCollections();
    const wishlist = await wishlistCollection.find({ email: req.params.email }).sort({ addedAt: -1 }).toArray();
    res.status(200).json({ success: true, data: wishlist });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching wishlist" });
  }
});

module.exports = router;