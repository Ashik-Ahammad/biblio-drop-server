const express = require("express");
const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { verifyToken, verifyAdmin } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { usersCollection } = getCollections();
    const users = await usersCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching users" });
  }
});

router.patch("/role", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { usersCollection } = getCollections();
    const { userId, role } = req.body;
    if (!userId || !role) return res.status(400).json({ success: false, message: "Missing fields" });
    const result = await usersCollection.updateOne({ _id: new ObjectId(userId) }, { $set: { role: role } });
    if (result.matchedCount > 0) res.status(200).json({ success: true, message: "Role updated" });
    else res.status(404).json({ success: false, message: "User not found" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { usersCollection } = getCollections();
    const result = await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount > 0) res.status(200).json({ success: true, message: "User deleted" });
    else res.status(404).json({ success: false, message: "User not found" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting user" });
  }
});

router.patch("/update-role", verifyToken, async (req, res) => {
  try {
    const { usersCollection } = getCollections();
    const { email, role } = req.body;
    if (!email || !role) return res.status(400).json({ success: false, message: "Required fields missing" });
    const result = await usersCollection.updateOne({ email }, { $set: { role, isRoleSelected: true } });
    if (result.modifiedCount > 0) res.status(200).json({ success: true, message: "Role updated" });
    else res.status(400).json({ success: false, message: "User not found or role set" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/:email", verifyToken, async (req, res) => {
  try {
    const { usersCollection } = getCollections();
    const user = await usersCollection.findOne({ email: req.params.email });
    if (user) res.status(200).json({ success: true, role: user.role, isRoleSelected: user.isRoleSelected || false });
    else res.status(404).json({ success: false, message: "User not found" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;