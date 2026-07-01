const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
const { getCollections } = require("../config/db");
const dotenv = require("dotenv");
dotenv.config();

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Forbidden" });
  }
};

const verifyAdmin = async (req, res, next) => {
  const { usersCollection } = getCollections();
  const user = await usersCollection.findOne({ email: req.user?.email });
  if (user?.role !== "admin") return res.status(403).json({ message: "Admin access only" });
  next();
};

const verifyLibrarian = async (req, res, next) => {
  const { usersCollection } = getCollections();
  const user = await usersCollection.findOne({ email: req.user?.email });
  if (user?.role !== "librarian" && user?.role !== "admin")
    return res.status(403).json({ message: "Librarian access only" });
  next();
};

module.exports = { verifyToken, verifyAdmin, verifyLibrarian };