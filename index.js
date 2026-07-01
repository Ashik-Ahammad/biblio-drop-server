const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { connectDB } = require("./config/db");

// রাউটগুলো ইম্পোর্ট করা
const bookRoutes = require("./routes/bookRoutes");
const userRoutes = require("./routes/userRoutes");
const orderRoutes = require("./routes/orderRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const statsRoutes = require("./routes/statsRoutes");

dotenv.config();
const app = express();
const port = process.env.PORT || 8000;

// middlewares
app.use(cors({ origin: [`${process.env.CLIENT_URL}`], credentials: true }));
app.use(express.json());

// API Endpoints
app.use("/api/books", bookRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/public-stats", statsRoutes);

// Base route
app.get("/", (req, res) => {
  res.send("BiblioDrop ~ Server is running securely and beautifully structured!");
});

// Start server and connect to database
async function startServer() {
  await connectDB();
  app.listen(port, () => {
    console.log(`BiblioDrop-Server running on port ${port}`);
  });
}

startServer().catch(console.dir);