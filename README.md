<div align="center">

# ⚙️ BiblioDrop – Server-Side Application

[![Live Preview](https://img.shields.io/badge/Live_Preview-Visit_Now-000000?style=for-the-badge&logo=vercel)](https://biblio-drop-backend-server.vercel.app/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=JSON%20web%20tokens&logoColor=white)](https://jwt.io/)

**The robust, secure, and highly scalable backend for the BiblioDrop Online Book Delivery platform.**

</div>

---

## 📖 Project Overview

This repository contains the backend server for **BiblioDrop**. It is built using **Node.js** and **Express.js**, utilizing **MongoDB** as the primary database. The server handles all core business logic, including secure token verification via Remote JWKS, role-based access control (RBAC), complex database aggregations for searching and filtering books, and order management.

---

## ✨ Key Features

- **Secure Authentication Verification:** Utilizes `jose-cjs` to securely verify JSON Web Tokens (JWT) through a Remote JSON Web Key Set (JWKS) provided by the client application.
- **Role-Based Access Control (RBAC):** Custom middleware to strictly protect routes based on user roles (`admin`, `librarian`, `user`).
- **Advanced Aggregation Pipelines:** Complex MongoDB aggregation for powerful searching, filtering (by category, price, availability), and sorting.
- **Dynamic Status Management:** Handles real-time order tracking (`Pending Delivery` ➔ `Dispatched` ➔ `Delivered`) and book approval systems.
- **CORS Protection:** Configured to strictly accept requests only from the verified client application URL.

---

## 🛠️ Tech Stack & Packages

| Category | Technologies / Packages Used |
| :--- | :--- |
| **Runtime Environment** | `Node.js` |
| **Web Framework** | `express` |
| **Database & Driver** | `mongodb` (Native Node.js Driver) |
| **Authentication & Security** | `jose-cjs`, `better-auth` |
| **Middlewares & Utilities** | `cors`, `dotenv` |


## 📡 API Endpoints Reference

The backend exposes a highly secure REST API. Below is a structured reference of the primary endpoints used by the client:

### 🌍 Public Routes (No Authentication Required)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/books` | Fetch all published books (supports search, sort, filter, pagination) |
| `GET` | `/api/books/:id` | Fetch details of a specific book |
| `GET` | `/api/books/featured` | Fetch top 6 recently published books for the homepage |
| `GET` | `/api/reviews/:bookId` | Fetch all reviews for a specific book |
| `GET` | `/api/public-stats` | Fetch global stats (Total books, readers, orders) |

### 👤 User Routes (Requires JWT & 'user' Role)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/orders` | Create a new book delivery order (Stripe) |
| `GET` | `/api/orders/user/:email` | Get delivery history for a user |
| `GET` | `/api/orders/check-duplicate`| Check if user has already ordered a specific book |
| `POST` | `/api/wishlist/toggle` | Add/Remove book from wishlist |
| `GET` | `/api/wishlist/:email` | Get full wishlist for a specific user |
| `POST` | `/api/reviews` | Submit a verified review (only if book is delivered) |
| `PATCH`| `/api/reviews/:id` | Update a specific review |
| `DELETE`| `/api/reviews/:id` | Delete a specific review |

### 🏛️ Librarian Routes (Requires JWT & 'librarian'/'admin' Role)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/books` | Add a new book to the inventory (Status: Pending) |
| `GET` | `/api/books/librarian/:email`| Fetch all books owned by the specific librarian |
| `PATCH`| `/api/books/:id/unpublish` | Toggle a book's visibility (Publish/Unpublish) |
| `PATCH`| `/api/books/:id` | Edit details of an existing book |
| `GET` | `/api/orders/librarian/:email`| Fetch all delivery requests for the librarian's books |
| `PATCH`| `/api/orders/:id/status` | Update order delivery status (Pending ➔ Dispatched ➔ Delivered) |

### 🛡️ Admin Routes (Requires JWT & 'admin' Role)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/books/pending` | Fetch all books awaiting approval |
| `PATCH`| `/api/books/:id/approve` | Approve and publish a pending book |
| `GET` | `/api/books/admin/all` | Fetch all books (with pagination) for management |
| `GET` | `/api/orders` | View all platform-wide transactions and deliveries |
| `GET` | `/api/users` | Fetch all registered users |
| `PATCH`| `/api/users/role` | Promote/demote user roles |
| `DELETE`| `/api/users/:id` | Delete a specific user |


---

## 🔐 Environment Variables (`.env`)

To run this server locally, create a `.env` file in the root directory and add the following keys. Replace the placeholder values with your actual credentials.

```env
# Server Configuration
PORT=8000

# Client Application URL (For CORS & JWKS resolution)
# Example: http://localhost:3000 for local dev, or your deployed Vercel link
CLIENT_URL=http://localhost:3000

# MongoDB Configuration
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=biblio_drop

# Cliet Application URL
CLIENT_URL=http://localhost:3000

---
git clone [https://github.com/Ashik-Ahammad/biblio-drop-server.git](https://github.com/Ashik-Ahammad/biblio-drop-server.git)
cd biblio-drop-server

npm install

nodemon index.js
node index.js


