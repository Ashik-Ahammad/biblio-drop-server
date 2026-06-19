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

const port = process.env.PORT || 8008;
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

        // status to "Pending Approval"
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

    //Get Featured Books
    app.get("/api/books/featured", async (req, res) => {
      try {
        const books = await booksCollection
          .find({ status: "Published" })
          .sort({ addedAt: -1 })
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
        // future to do { status: "Published" }
        const books = await booksCollection
          .find({})
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

    // Get All Books By Id API -  Books Details Page
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

    // book order status
    app.patch("/api/books/update-status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status: status } };

        const result = await booksCollection.updateOne(filter, updateDoc);
        res.status(200).json({ success: true, result });
      } catch (error) {
        res
          .status(500)
          .json({ success: false, message: "Failed to update status" });
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
        } = req.body;

        // Validation
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
          },
          stripeSessionId: sessionId,
          status: "Pending Delivery",
          orderedAt: new Date(),
        };

        const orderResult = await ordersCollection.insertOne(newOrder);

        await booksCollection.updateOne(
          { _id: new ObjectId(bookId) },
          { $set: { status: "Pending Delivery" } },
        );

        res.status(201).json({
          success: true,
          message: "Order data saved and book status updated successfully",
          orderId: orderResult.insertedId,
        });
      } catch (error) {
        console.error("Order Save Error:", error);
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
