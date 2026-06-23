const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

// Load environment variables
dotenv.config();

const app = express();

// Configure CORS and JSON parsing
app.use(
  cors({
    origin: [`${process.env.CLIENT_URL}`],
    credentials: true,
  }),
);
app.use(express.json());

const port = process.env.PORT || 8000;
const uri = process.env.MONGO_URI;

// Initialize MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Setup JWKS for token verification
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

// Verify JWT token middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload; // Attach user payload to request
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

async function run() {
  try {
    await client.connect();
    const database = client.db(process.env.DB_NAME);

    // Database Collections
    const usersCollection = database.collection("user");
    const booksCollection = database.collection("books");
    const ordersCollection = database.collection("orders");
    const reviewsCollection = database.collection("reviews");
    const wishlistCollection = database.collection("wishlist");

    // ==========================================
    // Role Verification Middlewares
    // ==========================================

    // Verify Admin Role
    const verifyAdmin = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.user?.email });
      if (user?.role !== "admin")
        return res.status(403).json({ message: "Admin access only" });
      next();
    };

    // Verify Librarian Role (Admin can also access)
    const verifyLibrarian = async (req, res, next) => {
      const user = await usersCollection.findOne({ email: req.user?.email });
      if (user?.role !== "librarian" && user?.role !== "admin")
        return res.status(403).json({ message: "Librarian access only" });
      next();
    };

    // ==========================================
    // Admin APIs (Strictly verifyAdmin)
    // ==========================================

    // Fetch all pending books (Admin only)
    app.get(
      "/api/books/pending",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const books = await booksCollection
            .find({ status: "Pending Approval" })
            .sort({ createdAt: -1 })
            .toArray();
          res.status(200).json({ success: true, data: books });
        } catch (error) {
          res
            .status(500)
            .json({ success: false, message: "Error fetching pending books" });
        }
      },
    );

    // Approve a book (Admin only)
    app.patch(
      "/api/books/:id/approve",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          await booksCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status: "Published" } },
          );
          res
            .status(200)
            .json({ success: true, message: "Book approved successfully" });
        } catch (error) {
          res
            .status(500)
            .json({ success: false, message: "Error approving book" });
        }
      },
    );

    // Get all orders (Admin only)
    app.get("/api/orders", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const orders = await ordersCollection
          .aggregate([
            { $sort: { orderedAt: -1 } },
            {
              $lookup: {
                from: "books",
                localField: "book.id",
                foreignField: "_id",
                as: "bookDetails",
              },
            },
            {
              $unwind: {
                path: "$bookDetails",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                "book.category": {
                  $ifNull: ["$bookDetails.category", "Uncategorized"],
                },
              },
            },
            { $project: { bookDetails: 0 } },
          ])
          .toArray();
        res.status(200).json({ success: true, data: orders });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Error fetching orders" });
      }
    });

    // Get all books for admin management (Secured Admin API)
    app.get("/api/books/admin/all", verifyToken, verifyAdmin,
      async (req, res) => {
        try {
          const { page = 1, limit = 12 } = req.query;
          const skip = (Number(page) - 1) * Number(limit);

          const query = { status: { $ne: "Pending Approval" } };

          const totalData = await booksCollection.countDocuments(query);
          const result = await booksCollection
            .find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .toArray();

          res.status(200).json({
            success: true,
            data: result,
            pagination: {
              page: Number(page),
              totalPages: Math.ceil(totalData / Number(limit)) || 1,
              totalItems: totalData,
            },
          });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: "Error fetching admin books",
          });
        }
      },
    );

    // Get All Users (Admin only)
    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json(users);
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Error fetching users" });
      }
    });

    // Update User Role (Admin only)
    app.patch("/api/users/role", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { userId, role } = req.body;
        if (!userId || !role)
          return res
            .status(400)
            .json({ success: false, message: "Missing fields" });
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { role: role } },
        );
        if (result.matchedCount > 0)
          res.status(200).json({ success: true, message: "Role updated" });
        else
          res.status(404).json({ success: false, message: "User not found" });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Delete User (Admin only)
    app.delete("/api/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });
        if (result.deletedCount > 0)
          res.status(200).json({ success: true, message: "User deleted" });
        else
          res.status(404).json({ success: false, message: "User not found" });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Error deleting user" });
      }
    });

    // ==========================================
    // Librarian APIs (Strictly verifyLibrarian)
    // ==========================================

    // Delete Book (Librarian/Admin)
    app.delete(
      "/api/books/:id",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        try {
          const result = await booksCollection.deleteOne({
            _id: new ObjectId(req.params.id),
          });
          res.status(200).json({ success: result.deletedCount > 0 });
        } catch (error) {
          res
            .status(500)
            .json({ success: false, message: "Error deleting book" });
        }
      },
    );

    // Toggle Book Status (Librarian/Admin)
    app.patch(
      "/api/books/:id/unpublish",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        try {
          const { currentStatus } = req.body;
          const nextStatus =
            currentStatus === "Published" ? "Unpublished" : "Published";
          await booksCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status: nextStatus } },
          );
          res.status(200).json({ success: true, nextStatus });
        } catch (error) {
          res
            .status(500)
            .json({ success: false, message: "Error updating status" });
        }
      },
    );

    // Update Book Details (Librarian/Admin)
    app.patch(
      "/api/books/:id",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        try {
          const updateData = req.body;
          delete updateData._id;
          const result = await booksCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData },
          );
          if (result.matchedCount > 0)
            res
              .status(200)
              .json({ success: true, message: "Book updated successfully" });
          else
            res.status(404).json({ success: false, message: "Book not found" });
        } catch (error) {
          res
            .status(500)
            .json({ success: false, message: "Internal server error" });
        }
      },
    );

    // Add New Book (Librarian/Admin)
    app.post("/api/books", verifyToken, verifyLibrarian, async (req, res) => {
      try {
        const bookData = req.body;
        if (!bookData.title || !bookData.author || !bookData.coverImage)
          return res
            .status(400)
            .json({ success: false, message: "Missing required fields" });
        const newBook = {
          ...bookData,
          status: "Pending Approval",
          createdAt: new Date(),
        };
        const result = await booksCollection.insertOne(newBook);
        res.status(201).json({
          success: true,
          message: "Book added pending approval",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Get orders for a specific librarian (Librarian/Admin)
    app.get(
      "/api/orders/librarian/:email",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        try {
          const orders = await ordersCollection
            .find({ "book.librarianEmail": req.params.email })
            .sort({ orderedAt: -1 })
            .toArray();
          res.status(200).json({ success: true, data: orders });
        } catch (error) {
          res
            .status(500)
            .json({ success: false, message: "Error fetching orders" });
        }
      },
    );

    // Update order status (Librarian/Admin)
    app.patch(
      "/api/orders/:id/status",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        try {
          await ordersCollection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { status: req.body.status } },
          );
          res
            .status(200)
            .json({ success: true, message: "Order status updated" });
        } catch (error) {
          res
            .status(500)
            .json({ success: false, message: "Error updating order" });
        }
      },
    );

    // Get ONLY books owned by specific librarian (Librarian/Admin)
    app.get(
      "/api/books/librarian/:email",
      verifyToken,
      verifyLibrarian,
      async (req, res) => {
        try {
          const books = await booksCollection
            .find({ librarianEmail: req.params.email })
            .sort({ createdAt: -1 })
            .toArray();
          res.status(200).json({ success: true, data: books });
        } catch (error) {
          res
            .status(500)
            .json({ success: false, message: "Error fetching books" });
        }
      },
    );

    // ==========================================
    // Public APIs (No verification required)
    // ==========================================

    // Get Featured Books (Public)
    app.get("/api/books/featured", async (req, res) => {
      try {
        const books = await booksCollection
          .find({ status: "Published" })
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();
        res.json({ success: true, data: books });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Error fetching featured books" });
      }
    });

   // Get All Books API (Public)
    app.get("/api/books", async (req, res) => {
      try {
        const { search, category, minPrice, maxPrice, sort, availability, email, role, page = 1, limit = 12 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        //  Base matching
        let matchStage = { status: "Published" };

        if (role === "admin") {
          matchStage = {};
        } else if (role === "librarian" && email) {
          matchStage = { $or: [{ status: "Published" }, { librarianEmail: email }] };
        }

        // Category Filter
        if (category && category !== "All") {
          matchStage.category = category;
        }

        // Price Range Filter
        if (minPrice || maxPrice) {
          matchStage.deliveryFee = {};
          if (minPrice) matchStage.deliveryFee.$gte = Number(minPrice);
          if (maxPrice) matchStage.deliveryFee.$lte = Number(maxPrice);
        }

        // Text Search
        if (search && search.trim() !== "") {
          matchStage = {
            $and: [
              matchStage,
              {
                $or: [
                  { title: { $regex: search, $options: "i" } },
                  { author: { $regex: search, $options: "i" } },
                  { category: { $regex: search, $options: "i" } }
                ]
              }
            ]
          };
        }

        // --- AGGREGATION ---
        let pipeline = [{ $match: matchStage }];

        // Availability Filter Lookup Orders
        if (availability === "Checked Out" || availability === "Available Only") {
          pipeline.push({
            $lookup: {
              from: "orders", // Orders collection join
              localField: "_id",
              foreignField: "book.id",
              as: "ordersData"
            }
          });

          if (availability === "Checked Out") {
            // if status delivered
            pipeline.push({
              $match: { "ordersData": { $elemMatch: { status: "Delivered" } } }
            });
          } else if (availability === "Available Only") {
            // if no delivered order
            pipeline.push({
              $match: { "ordersData": { $not: { $elemMatch: { status: "Delivered" } } } }
            });
          }
        }

        // Sorting Logic
        let sortOption = { createdAt: -1 }; // Default Newest
        if (sort === "oldest") sortOption = { createdAt: 1 };
        else if (sort === "priceAsc") sortOption = { deliveryFee: 1 };
        else if (sort === "priceDesc") sortOption = { deliveryFee: -1 };
        else if (sort === "nameAsc") sortOption = { title: 1 };
        else if (sort === "nameDesc") sortOption = { title: -1 };

        //  Get Total Count for Pagination
        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await booksCollection.aggregate(countPipeline).toArray();
        const totalData = countResult.length > 0 ? countResult[0].total : 0;

        //  Get Paginated Data
        const dataPipeline = [
          ...pipeline,
          { $sort: sortOption },
          { $skip: skip },
          { $limit: Number(limit) },
          { $project: { ordersData: 0 } }
        ];
        const result = await booksCollection.aggregate(dataPipeline).toArray();

        res.status(200).json({
          success: true,
          data: result,
          pagination: {
            page: Number(page),
            totalPages: Math.ceil(totalData / Number(limit)) || 1,
            totalItems: totalData,
          },
        });
      } catch (error) {
        console.error("Books API Error:", error);
        res.status(500).json({ success: false, message: "Error fetching books" });
      }
    });

    // Get Single Book By Id (Public)
    app.get("/api/books/:id", async (req, res) => {
      try {
        const book = await booksCollection.findOne({
          _id: new ObjectId(req.params.id),
        });
        if (book) res.json({ success: true, data: book });
        else
          res.status(404).json({ success: false, message: "Book not found" });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Invalid ID or Server Error" });
      }
    });

    // Review eligibility check (Secured)
    app.get("/api/reviews/check-eligibility", verifyToken, async (req, res) => {
      try {
        const { email, bookId } = req.query;

        if (!email || !bookId) {
          return res.status(400).json({ success: false, canReview: false });
        }

        const order = await ordersCollection.findOne({
          "user.email": email,
          "book.id": new ObjectId(bookId),
          status: "Delivered",
        });

        res.status(200).json({ success: true, canReview: !!order });
      } catch (error) {
        console.error("Eligibility check error:", error);
        res.status(500).json({ success: false, canReview: false });
      }
    });

    // Get all reviews for a book
    app.get("/api/reviews/:bookId", async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find({ bookId: req.params.bookId })
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json({ success: true, data: reviews });
      } catch (error) {
        res.status(500).json({ success: false, data: [] });
      }
    });

    // Get all reviews for a book
    app.get("/api/reviews/:bookId", async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find({ bookId: req.params.bookId })
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json({ success: true, data: reviews });
      } catch (error) {
        res.status(500).json({ success: false, data: [] });
      }
    });

    // ==========================================
    // Regular User APIs (Require verifyToken)
    // ==========================================

    // Check Duplicate Order (Secured)
    app.get("/api/orders/check-duplicate", verifyToken, async (req, res) => {
      try {
        const { email, bookId } = req.query;
        if (!email || !bookId) return res.json({ hasOrdered: false });
        const order = await ordersCollection.findOne({
          "user.email": email,
          "book.id": new ObjectId(bookId),
        });
        res.status(200).json({ success: true, hasOrdered: !!order });
      } catch (error) {
        res.status(500).json({ success: false, hasOrdered: false });
      }
    });

    // Post Order Data (Secured)
    app.post("/api/orders", verifyToken, async (req, res) => {
      try {
        const data = req.body;
        if (!data.userId || !data.bookId || !data.sessionId)
          return res
            .status(400)
            .json({ success: false, message: "Missing fields" });
        const newOrder = {
          user: {
            id: data.userId,
            name: data.userName,
            email: data.userEmail,
            role: data.userRole,
          },
          book: {
            id: new ObjectId(data.bookId),
            title: data.bookTitle,
            coverImage: data.coverImage,
            deliveryFee: parseFloat(data.deliveryFee),
            author: data.author,
            librarianEmail: data.librarianEmail,
          },
          stripeSessionId: data.sessionId,
          status: "Pending Delivery",
          orderedAt: new Date(),
        };
        const orderResult = await ordersCollection.insertOne(newOrder);
        res
          .status(201)
          .json({ success: true, orderId: orderResult.insertedId });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // User Order History (Secured)
    app.get("/api/orders/user/:email", verifyToken, async (req, res) => {
      try {
        const orders = await ordersCollection
          .find({ "user.email": req.params.email })
          .sort({ orderedAt: -1 })
          .toArray();
        const ordersWithCategory = await Promise.all(
          orders.map(async (order) => {
            const bookDetails = await booksCollection.findOne({
              _id: new ObjectId(order.book.id),
            });
            return {
              ...order,
              book: {
                ...order.book,
                category: bookDetails ? bookDetails.category : "Uncategorized",
              },
            };
          }),
        );
        res.status(200).json({ success: true, data: ordersWithCategory });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Update Initial Role selection (Secured)
    app.patch("/api/users/update-role", verifyToken, async (req, res) => {
      try {
        const { email, role } = req.body;
        if (!email || !role)
          return res
            .status(400)
            .json({ success: false, message: "Required fields missing" });
        const result = await usersCollection.updateOne(
          { email },
          { $set: { role, isRoleSelected: true } },
        );
        if (result.modifiedCount > 0)
          res.status(200).json({ success: true, message: "Role updated" });
        else
          res
            .status(400)
            .json({ success: false, message: "User not found or role set" });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Check User Role (Secured)
    app.get("/api/users/:email", verifyToken, async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.params.email });
        if (user)
          res.status(200).json({
            success: true,
            role: user.role,
            isRoleSelected: user.isRoleSelected || false,
          });
        else
          res.status(404).json({ success: false, message: "User not found" });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Post a review (Secured)
    app.post("/api/reviews", verifyToken, async (req, res) => {
      try {
        const reviewData = { ...req.body, createdAt: new Date() };
        const result = await reviewsCollection.insertOne(reviewData);
        res.status(201).json({ success: true, result });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Failed to submit review" });
      }
    });

    // Get reviews by specific user (Secured)
    app.get("/api/reviews/user/:email", verifyToken, async (req, res) => {
      try {
        const reviews = await reviewsCollection
          .find({ userEmail: req.params.email })
          .sort({ createdAt: -1 })
          .toArray();
        const reviewsWithBooks = await Promise.all(
          reviews.map(async (review) => {
            const book = await booksCollection.findOne({
              _id: new ObjectId(review.bookId),
            });
            return {
              ...review,
              bookTitle: book ? book.title : "Deleted Book",
              bookImage: book ? book.coverImage : null,
            };
          }),
        );
        res.status(200).json({ success: true, data: reviewsWithBooks });
      } catch (error) {
        res.status(500).json({ success: false, data: [] });
      }
    });

    // Update a review (Secured)
    app.patch("/api/reviews/:id", verifyToken, async (req, res) => {
      try {
        const { rating, comment } = req.body;
        await reviewsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { rating, comment, updatedAt: new Date() } },
        );
        res.status(200).json({ success: true, message: "Review updated" });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Error updating review" });
      }
    });

    // Delete a review (Secured)
    app.delete("/api/reviews/:id", verifyToken, async (req, res) => {
      try {
        await reviewsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.status(200).json({ success: true, message: "Review deleted" });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Error deleting review" });
      }
    });

    // Toggle Wishlist (Secured)
    app.post("/api/wishlist/toggle", verifyToken, async (req, res) => {
      try {
        const { email, book } = req.body;
        const existing = await wishlistCollection.findOne({
          email: email,
          bookId: book._id,
        });
        if (existing) {
          await wishlistCollection.deleteOne({ _id: existing._id });
          res.status(200).json({
            success: true,
            action: "removed",
            message: "Removed from wishlist",
          });
        } else {
          const wishlistItem = {
            email,
            bookId: book._id,
            title: book.title,
            author: book.author || "Unknown",
            coverImage: book.coverImage,
            deliveryFee: book.deliveryFee,
            addedAt: new Date(),
          };
          await wishlistCollection.insertOne(wishlistItem);
          res.status(200).json({
            success: true,
            action: "added",
            message: "Added to wishlist",
          });
        }
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Check wishlist status (Secured)
    app.get("/api/wishlist/check", verifyToken, async (req, res) => {
      try {
        const { email, bookId } = req.query;
        if (!email || !bookId) return res.json({ inWishlist: false });
        const item = await wishlistCollection.findOne({ email, bookId });
        res.status(200).json({ success: true, inWishlist: !!item });
      } catch (error) {
        res.status(500).json({ success: false, inWishlist: false });
      }
    });

    // Get Full Wishlist (Secured)
    app.get("/api/wishlist/:email", verifyToken, async (req, res) => {
      try {
        const wishlist = await wishlistCollection
          .find({ email: req.params.email })
          .sort({ addedAt: -1 })
          .toArray();
        res.status(200).json({ success: true, data: wishlist });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Error fetching wishlist" });
      }
    });

    // Get Stats Count
    app.get("/api/public-stats", async (req, res) => {
      try {
        const totalBooks = await booksCollection.countDocuments();
        const totalReaders = await usersCollection.countDocuments();
        const totalOrders = await ordersCollection.countDocuments();

        res.status(200).json({
          totalBooks,
          totalReaders,
          totalOrders,
        });
      } catch (error) {
        res.status(500).json({ message: "Error fetching stats" });
      }
    });

    console.log("BiblioDrop MongoDB Connected Successfully");
  } finally {
    // Keep connection
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("BiblioDrop ~ Server is running securely");
});

app.listen(port, () => {
  console.log(`BiblioDrop-Server running on port ${port}`);
});
