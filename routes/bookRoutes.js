const express = require("express");
const { ObjectId } = require("mongodb");
const { getCollections } = require("../config/db");
const { verifyToken, verifyAdmin, verifyLibrarian } = require("../middlewares/authMiddleware");

const router = express.Router();

// Public Routes
router.get("/featured", async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const books = await booksCollection.find({ status: "Published" }).sort({ createdAt: -1 }).limit(6).toArray();
    res.json({ success: true, data: books });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching featured books" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const { search, category, minPrice, maxPrice, sort, availability, email, role, page = 1, limit = 12 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    let matchStage = { status: "Published" };
    if (role === "admin") matchStage = {};
    else if (role === "librarian" && email) matchStage = { $or: [{ status: "Published" }, { librarianEmail: email }] };

    if (category && category !== "All") matchStage.category = category;
    if (minPrice || maxPrice) {
      matchStage.deliveryFee = {};
      if (minPrice) matchStage.deliveryFee.$gte = Number(minPrice);
      if (maxPrice) matchStage.deliveryFee.$lte = Number(maxPrice);
    }
    if (search && search.trim() !== "") {
      matchStage = {
        $and: [
          matchStage,
          { $or: [{ title: { $regex: search, $options: "i" } }, { author: { $regex: search, $options: "i" } }, { category: { $regex: search, $options: "i" } }] }
        ]
      };
    }

    let pipeline = [{ $match: matchStage }];
    if (availability === "Checked Out" || availability === "Available Only") {
      pipeline.push({
        $lookup: { from: "orders", localField: "_id", foreignField: "book.id", as: "ordersData" }
      });
      if (availability === "Checked Out") {
        pipeline.push({ $match: { ordersData: { $elemMatch: { status: "Delivered" } } } });
      } else if (availability === "Available Only") {
        pipeline.push({ $match: { ordersData: { $not: { $elemMatch: { status: "Delivered" } } } } });
      }
    }

    let sortOption = { createdAt: -1 };
    if (sort === "oldest") sortOption = { createdAt: 1 };
    else if (sort === "priceAsc") sortOption = { deliveryFee: 1 };
    else if (sort === "priceDesc") sortOption = { deliveryFee: -1 };
    else if (sort === "nameAsc") sortOption = { title: 1 };
    else if (sort === "nameDesc") sortOption = { title: -1 };

    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await booksCollection.aggregate(countPipeline).toArray();
    const totalData = countResult.length > 0 ? countResult[0].total : 0;

    const dataPipeline = [...pipeline, { $sort: sortOption }, { $skip: skip }, { $limit: Number(limit) }, { $project: { ordersData: 0 } }];
    const result = await booksCollection.aggregate(dataPipeline).toArray();

    res.status(200).json({
      success: true, data: result,
      pagination: { page: Number(page), totalPages: Math.ceil(totalData / Number(limit)) || 1, totalItems: totalData }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching books" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const book = await booksCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (book) res.json({ success: true, data: book });
    else res.status(404).json({ success: false, message: "Book not found" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Invalid ID or Server Error" });
  }
});

// Admin Routes
router.get("/pending", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const books = await booksCollection.find({ status: "Pending Approval" }).sort({ createdAt: -1 }).toArray();
    res.status(200).json({ success: true, data: books });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching pending books" });
  }
});

router.patch("/:id/approve", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    await booksCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: "Published" } });
    res.status(200).json({ success: true, message: "Book approved successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error approving book" });
  }
});

router.get("/admin/all", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const { page = 1, limit = 12 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const query = { status: { $ne: "Pending Approval" } };
    const totalData = await booksCollection.countDocuments(query);
    const result = await booksCollection.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).toArray();

    res.status(200).json({
      success: true, data: result,
      pagination: { page: Number(page), totalPages: Math.ceil(totalData / Number(limit)) || 1, totalItems: totalData }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching admin books" });
  }
});

// Librarian & Admin Routes
router.delete("/:id", verifyToken, verifyLibrarian, async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const result = await booksCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.status(200).json({ success: result.deletedCount > 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting book" });
  }
});

router.patch("/:id/unpublish", verifyToken, verifyLibrarian, async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const nextStatus = req.body.currentStatus === "Published" ? "Unpublished" : "Published";
    await booksCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: nextStatus } });
    res.status(200).json({ success: true, nextStatus });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating status" });
  }
});

router.patch("/:id", verifyToken, verifyLibrarian, async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const updateData = req.body;
    delete updateData._id;
    const result = await booksCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateData });
    if (result.matchedCount > 0) res.status(200).json({ success: true, message: "Book updated successfully" });
    else res.status(404).json({ success: false, message: "Book not found" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/", verifyToken, verifyLibrarian, async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const bookData = req.body;
    if (!bookData.title || !bookData.author || !bookData.coverImage) return res.status(400).json({ success: false, message: "Missing required fields" });

    const newBook = { ...bookData, status: "Pending Approval", createdAt: new Date() };
    const result = await booksCollection.insertOne(newBook);
    res.status(201).json({ success: true, message: "Book added pending approval", insertedId: result.insertedId });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/librarian/:email", verifyToken, verifyLibrarian, async (req, res) => {
  try {
    const { booksCollection } = getCollections();
    const books = await booksCollection.find({ librarianEmail: req.params.email }).sort({ createdAt: -1 }).toArray();
    res.status(200).json({ success: true, data: books });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching books" });
  }
});

module.exports = router;