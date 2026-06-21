const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

// dotenv config
dotenv.config();

const app = express();

// middleware
app.use(
  cors({
    origin: [`${process.env.CLIENT_URL}`],
    credentials: true,
  }),
);
app.use(express.json());

const port = process.env.PORT || 8000;
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//jwks
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

//middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log(payload);
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

async function run() {
  try {
    await client.connect();
    const database = client.db(process.env.DB_NAME);

    const usersCollection = database.collection("user");
    const booksCollection = database.collection("books");
    const ordersCollection = database.collection("orders");
    const reviewsCollection = database.collection("reviews");
    const wishlistCollection = database.collection("wishlist");

    // ==========================================
    // Admin & Book Approvals APIs
    // ==========================================

    // Fetch all pending books for admin approval table
    app.get("/api/books/pending", async (req, res) => {
      try {
        const books = await booksCollection
          .find({ status: "Pending Approval" })
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json({ success: true, data: books });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching pending books" });
      }
    });

    // Approve a book (Admin changes status to Published)
    app.patch("/api/books/:id/approve", async (req, res) => {
      try {
        const result = await booksCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: "Published" } }
        );
        res.status(200).json({ success: true, message: "Book approved successfully" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error approving book" });
      }
    });

    // Admin Get All Orders
    app.get("/api/orders", async (req, res) => {
      try {
        const orders = await ordersCollection.aggregate([
          { $sort: { orderedAt: -1 } },

          {
            $lookup: {
              from: "books",
              localField: "book.id",
              foreignField: "_id",
              as: "bookDetails"
            }
          },

          {
            $unwind: {
              path: "$bookDetails",
              preserveNullAndEmptyArrays: true
            }
          },


          {
            $addFields: {
              "book.category": { $ifNull: ["$bookDetails.category", "Uncategorized"] }
            }
          },

          {
            $project: {
              bookDetails: 0
            }
          }
        ]).toArray();

        res.status(200).json({ success: true, data: orders });
      } catch (error) {
        console.error("Aggregation Error:", error);
        res.status(500).json({ success: false, message: "Error fetching orders" });
      }
    });


    // ==========================================
    // Librarian Controls (Delete, Unpublish & Update)
    // ==========================================

    // Delete Book
    app.delete("/api/books/:id", async (req, res) => {
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
    });

    // Unpublish / Publish Toggle
    app.patch("/api/books/:id/unpublish", async (req, res) => {
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
    });

    // Update Book Details
    app.patch("/api/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;

        // Removing _id to prevent MongoDB immutable field error
        delete updateData._id;

        const result = await booksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );

        if (result.matchedCount > 0) {
          res
            .status(200)
            .json({ success: true, message: "Book updated successfully" });
        } else {
          res
            .status(404)
            .json({ success: false, message: "Book not found in database" });
        }
      } catch (error) {
        console.error("Error updating book in Express:", error);
        res
          .status(500)
          .json({
            success: false,
            message: "Internal server error in backend",
          });
      }
    });

    // ==========================================
    // Add New Book API (Librarian)
    // ==========================================
    app.post("/api/books", async (req, res) => {
      try {
        const bookData = req.body;

        // Validation
        if (!bookData.title || !bookData.author || !bookData.coverImage) {
          return res
            .status(400)
            .json({ success: false, message: "Missing required fields" });
        }

        // status strictly set to "Pending Approval" initially
        const newBook = {
          ...bookData,
          status: "Pending Approval",
          createdAt: new Date(),
        };

        const result = await booksCollection.insertOne(newBook);

        res.status(201).json({
          success: true,
          message: "Book added successfully and is pending approval",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding book:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Get Featured Books
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

    // Get All Books API - Browse Books Page
    app.get("/api/books", async (req, res) => {
      try {
        const { email, role } = req.query;
        let query = { status: "Published" };

        // Handle role-based visibility
        if (role === "admin") {
          query = {};
        } else if (role === "librarian" && email) {
          query = {
            $or: [{ status: "Published" }, { librarianEmail: email }],
          };
        }

        const books = await booksCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json({ success: true, data: books });
      } catch (error) {
        console.error("Error fetching all books:", error);
        res
          .status(500)
          .json({ success: false, message: "Error fetching books" });
      }
    });

    // Get All Books By Id API - Books Details Page
    app.get("/api/books/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const book = await booksCollection.findOne(query);

        if (book) {
          res.json({ success: true, data: book });
        } else {
          res.status(404).json({ success: false, message: "Book not found" });
        }
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Invalid ID or Server Error" });
      }
    });


    // ==========================================
    // Order System APIs
    // ==========================================

    // Check Duplicate Order
    app.get("/api/orders/check-duplicate", async (req, res) => {
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

    // Order data post
    app.post("/api/orders", async (req, res) => {
      try {
        const {
          userId,
          userName,
          userEmail,
          userRole,
          bookId,
          bookTitle,
          deliveryFee,
          coverImage,
          sessionId,
          author,
          librarianEmail,
        } = req.body;

        if (!userId || !bookId || !sessionId) {
          return res
            .status(400)
            .json({ success: false, message: "Missing required fields" });
        }

        const newOrder = {
          user: {
            id: userId,
            name: userName,
            email: userEmail,
            role: userRole,
          },
          book: {
            id: new ObjectId(bookId),
            title: bookTitle,
            coverImage: coverImage,
            deliveryFee: parseFloat(deliveryFee),
            author: author,
            librarianEmail: librarianEmail,
          },
          stripeSessionId: sessionId,
          status: "Pending Delivery",
          orderedAt: new Date(),
        };

        const orderResult = await ordersCollection.insertOne(newOrder);

        // Keeping inventory clean: No main book status change to "Pending Delivery"
        // We track delivery flow solely via the Orders collection now.

        res
          .status(201)
          .json({ success: true, orderId: orderResult.insertedId });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Get orders for a librarian's books
    app.get("/api/orders/librarian/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const orders = await ordersCollection
          .find({ "book.librarianEmail": email })
          .sort({ orderedAt: -1 })
          .toArray();
        res.status(200).json({ success: true, data: orders });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching orders" });
      }
    });

    // Update order status from librarian
    app.patch("/api/orders/:id/status", async (req, res) => {
      try {
        const { status } = req.body;
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status: status } }
        );
        res.status(200).json({ success: true, message: "Order status updated" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error updating order" });
      }
    });

    // Get ONLY the books owned by a specific librarian
    app.get("/api/books/librarian/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const books = await booksCollection
          .find({ librarianEmail: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json({ success: true, data: books });
      } catch (error) {
        console.error("Error fetching librarian books:", error);
        res.status(500).json({ success: false, message: "Error fetching books" });
      }
    });

    // User Order History API

    app.get("/api/orders/user/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const orders = await ordersCollection
          .find({ "user.email": email })
          .sort({ orderedAt: -1 })
          .toArray();

        const ordersWithCategory = [];

        for (let i = 0; i < orders.length; i++) {
          const order = orders[i];
          const bookDetails = await booksCollection.findOne({
            _id: new ObjectId(order.book.id)
          });

          ordersWithCategory.push({
            ...order,
            book: {
              ...order.book,
              category: bookDetails ? bookDetails.category : "Uncategorized"
            }
          });
        }

        res.status(200).json({ success: true, data: ordersWithCategory });
      } catch (error) {
        console.error("Error fetching user orders:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // ==========================================
    // User Role Update APIs
    // ==========================================
    app.patch("/api/users/update-role", async (req, res) => {
      try {
        const { email, role } = req.body;

        if (!email || !role) {
          return res
            .status(400)
            .json({ success: false, message: "Email and role are required" });
        }

        const filter = { email: email };
        const updateDoc = {
          $set: {
            role: role,
            isRoleSelected: true,
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount > 0) {
          res
            .status(200)
            .json({ success: true, message: "Role updated successfully" });
        } else {
          res.status(400).json({
            success: false,
            message: "User not found or role already set",
          });
        }
      } catch (error) {
        console.error("Role update error:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    // Check User Role API
    app.get("/api/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email: email });

        if (user) {
          res.status(200).json({
            success: true,
            role: user.role,
            isRoleSelected: user.isRoleSelected || false,
          });
        } else {
          res.status(404).json({ success: false, message: "User not found" });
        }
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });


    // get users
    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.status(200).json(users);
      } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching users" });
      }
    });

    app.patch("/api/users/role", async (req, res) => {
      try {
        const { userId, role } = req.body;

        if (!userId || !role) {
          return res.status(400).json({ success: false, message: "User ID and role are required" });
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { role: role } }
        );

        if (result.matchedCount > 0) {
          res.status(200).json({ success: true, message: "Role updated successfully" });
        } else {
          res.status(404).json({ success: false, message: "User not found" });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: "Internal server error" });
      }
    });

    app.delete("/api/users/:id", async (req, res) => {
      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(req.params.id),
        });

        if (result.deletedCount > 0) {
          res.status(200).json({ success: true, message: "User deleted successfully" });
        } else {
          res.status(404).json({ success: false, message: "User not found" });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting user" });
      }
    });

    // ==========================================
    // Review System APIs
    // ==========================================

    // Review eligibility check
    app.get("/api/reviews/check-eligibility", async (req, res) => {
      try {
        const { email, bookId } = req.query;
        const order = await ordersCollection.findOne({
          "user.email": email,
          "book.id": new ObjectId(bookId),
          status: "Delivered",
        });
        res.status(200).json({ success: true, canReview: !!order });
      } catch (error) {
        res.status(500).json({ success: false, canReview: false });
      }
    });

    // Get all reviews
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

    // Post a review
    app.post("/api/reviews", async (req, res) => {
      try {
        const reviewData = req.body;
        reviewData.createdAt = new Date();
        const result = await reviewsCollection.insertOne(reviewData);
        res.status(201).json({ success: true, result });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Failed to submit review" });
      }
    });

    // Get all reviews written by a specific user (USING PROMISE.ALL)
    app.get("/api/reviews/user/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const reviews = await reviewsCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        // Resolving all promises concurrently for faster execution
        const reviewsWithBooks = await Promise.all(
          reviews.map(async (review) => {
            const book = await booksCollection.findOne({ _id: new ObjectId(review.bookId) });
            return {
              ...review,
              bookTitle: book ? book.title : "Deleted Book",
              bookImage: book ? book.coverImage : null
            };
          })
        );

        res.status(200).json({ success: true, data: reviewsWithBooks });
      } catch (error) {
        console.error("Error fetching user reviews:", error);
        res.status(500).json({ success: false, data: [] });
      }
    });

    // Update a review
    app.patch("/api/reviews/:id", async (req, res) => {
      try {
        const { rating, comment } = req.body;
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { rating, comment, updatedAt: new Date() } }
        );
        res.status(200).json({ success: true, message: "Review updated successfully" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error updating review" });
      }
    });

    // Delete a review
    app.delete("/api/reviews/:id", async (req, res) => {
      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.status(200).json({ success: true, message: "Review deleted successfully" });
      } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting review" });
      }
    });

    // ==========================================
    // Wishlist System APIs
    // ==========================================

    //  Toggle Wishlist (Add or Remove)
    app.post("/api/wishlist/toggle", async (req, res) => {
      try {
        const { email, book } = req.body;

        // Check if the book is already in the wishlist
        const existing = await wishlistCollection.findOne({
          email: email,
          bookId: book._id,
        });

        if (existing) {
          // If exists, remove it
          await wishlistCollection.deleteOne({ _id: existing._id });
          res
            .status(200)
            .json({
              success: true,
              action: "removed",
              message: "Removed from wishlist",
            });
        } else {
          // If not exists, save the book details directly
          const wishlistItem = {
            email: email,
            bookId: book._id,
            title: book.title,
            author: book.author || "Unknown",
            coverImage: book.coverImage,
            deliveryFee: book.deliveryFee,
            addedAt: new Date(),
          };
          await wishlistCollection.insertOne(wishlistItem);
          res
            .status(200)
            .json({
              success: true,
              action: "added",
              message: "Added to wishlist",
            });
        }
      } catch (error) {
        console.error("Wishlist Toggle Error:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error" });
      }
    });

    //  Check if a book is in user's wishlist
    app.get("/api/wishlist/check", async (req, res) => {
      try {
        const { email, bookId } = req.query;
        if (!email || !bookId) return res.json({ inWishlist: false });

        const item = await wishlistCollection.findOne({
          email: email,
          bookId: bookId,
        });

        res.status(200).json({ success: true, inWishlist: !!item });
      } catch (error) {
        res.status(500).json({ success: false, inWishlist: false });
      }
    });

    //  Get User's Full Wishlist
    app.get("/api/wishlist/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const wishlist = await wishlistCollection
          .find({ email: email })
          .sort({ addedAt: -1 })
          .toArray();

        res.status(200).json({ success: true, data: wishlist });
      } catch (error) {
        console.error("Error fetching wishlist:", error);
        res
          .status(500)
          .json({ success: false, message: "Error fetching wishlist" });
      }
    });

    console.log("BiblioDrop MongoDB Connected");
  } finally {
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("BiblioDrop ~ Server is running");
});

app.listen(port, () => {
  console.log(`BiblioDrop-Server running on port ${port}`);
});