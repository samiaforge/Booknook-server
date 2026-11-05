
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";




const app = express();
const PORT = process.env.PORT || 5000;

const client = new MongoClient(process.env.DB_URI);

app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});



// MongoDB collections
let booksCollection;
let borrowsCollection;


// Better Auth JWT public key
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`)
);

// JWT verification middleware
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      message: "Unauthorized! Please login first.",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.BETTER_AUTH_URL,
      audience: process.env.BETTER_AUTH_AUDIENCE,
    });

    if (!payload.email || !payload.name) {
      return res.status(401).send({
        message: "User information missing from token.",
      });
    }

    req.user = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
    };

    next();
  } catch (error) {
    console.error("JWT Error:", error.message);

    return res.status(401).send({
      message: "Invalid or expired token.",
    });
  }
};

// Helper: validate MongoDB ObjectId
const isValidId = (id) => ObjectId.isValid(id);

// Helper: get authenticated user's email
const getUserEmail = (req) => req.user.email.toLowerCase();





// 1. GET ALL BOOKS
// GET /books
// Public API


app.get("/books", async (req, res) => {
  try {
    const query = {};

    // Optional search by category
    if (req.query.category && req.query.category !== "All") {
      query.category = req.query.category;
    }

    const limit = Number(req.query.limit);

    let cursor = booksCollection
      .find(query)
      .sort({ createdAt: -1 });

    if (Number.isInteger(limit) && limit > 0) {
      cursor = cursor.limit(limit);
    }

    const books = await cursor.toArray();

    res.send(books);
  } catch (error) {
    console.error("Get Books Error:", error);

    res.status(500).send({
      message: "Failed to load books.",
    });
  }
});




// 2. GET SINGLE BOOK
// GET /books/:id
// Protected API


app.get("/books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).send({
        message: "Invalid book ID.",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found.",
      });
    }

    res.send(book);
  } catch (error) {
    console.error("Get Single Book Error:", error);

    res.status(500).send({
      message: "Failed to load book details.",
    });
  }
});




// 3. ADD NEW BOOK
// POST /books
// Protected API


app.post("/books", verifyToken, async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      image,
      description,
      totalCopies,
    } = req.body;

    if (
      !title ||
      !author ||
      !category ||
      !image ||
      !description ||
      !Number.isInteger(Number(totalCopies)) ||
      Number(totalCopies) < 1
    ) {
      return res.status(400).send({
        message: "Please provide valid book information.",
      });
    }

    const newBook = {
      title,
      author,
      category,
      image,
      description,

      totalCopies: Number(totalCopies),
      availableCopies: Number(totalCopies),

      // Identity comes from verified JWT
      addedBy: {
        name: req.user.name,
        email: req.user.email,
      },

      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(newBook);

    res.status(201).send({
      message: "Book added successfully.",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Add Book Error:", error);

    res.status(500).send({
      message: "Failed to add book.",
    });
  }
});



// 4. UPDATE BOOK
// PATCH /books/:id
// Protected API + Ownership check


app.patch("/books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).send({
        message: "Invalid book ID.",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found.",
      });
    }

    // Only the book owner can update it
    if (
      book.addedBy?.email?.toLowerCase() !== getUserEmail(req)
    ) {
      return res.status(403).send({
        message: "You cannot update someone else's book.",
      });
    }

    const {
      title,
      author,
      category,
      image,
      description,
      totalCopies,
    } = req.body;

    const updateFields = {};

    if (title !== undefined) updateFields.title = title;
    if (author !== undefined) updateFields.author = author;
    if (category !== undefined) updateFields.category = category;
    if (image !== undefined) updateFields.image = image;
    if (description !== undefined) {
      updateFields.description = description;
    }

    if (totalCopies !== undefined) {
      const newTotal = Number(totalCopies);

      if (!Number.isInteger(newTotal) || newTotal < 1) {
        return res.status(400).send({
          message: "Total copies must be at least 1.",
        });
      }

      const borrowedCopies =
        book.totalCopies - book.availableCopies;

      if (newTotal < borrowedCopies) {
        return res.status(400).send({
          message: "Total copies cannot be less than borrowed copies.",
        });
      }

      updateFields.totalCopies = newTotal;
      updateFields.availableCopies = newTotal - borrowedCopies;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).send({
        message: "No valid information provided to update.",
      });
    }

    updateFields.updatedAt = new Date();

    const result = await booksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    res.send({
      message: "Book updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Update Book Error:", error);

    res.status(500).send({
      message: "Failed to update book.",
    });
  }
});




// 5. DELETE BOOK
// DELETE /books/:id
// Protected API + Ownership check


app.delete("/books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).send({
        message: "Invalid book ID.",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found.",
      });
    }

    // Only the book owner can delete it
    if (
      book.addedBy?.email?.toLowerCase() !== getUserEmail(req)
    ) {
      return res.status(403).send({
        message: "You cannot delete someone else's book.",
      });
    }

    // Do not delete a book while it is borrowed
    if (book.availableCopies < book.totalCopies) {
      return res.status(400).send({
        message: "This book cannot be deleted while copies are borrowed.",
      });
    }

    await booksCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send({
      message: "Book deleted successfully.",
    });
  } catch (error) {
    console.error("Delete Book Error:", error);

    res.status(500).send({
      message: "Failed to delete book.",
    });
  }
});




// 6. BORROW BOOK
// POST /borrows
// Protected API


app.post("/borrows", verifyToken, async (req, res) => {
  try {
    const { bookId, returnDate } = req.body;

    if (!bookId || !isValidId(bookId) || !returnDate) {
      return res.status(400).send({
        message: "Please provide a valid book and return date.",
      });
    }

    // Validate return date before changing book copies
    const selectedReturnDate = new Date(`${returnDate}T00:00:00`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (
      isNaN(selectedReturnDate.getTime()) ||
      selectedReturnDate <= today
    ) {
      return res.status(400).send({
        message: "Return date must be a future date.",
      });
    }

    const bookObjectId = new ObjectId(bookId);
    const userEmail = getUserEmail(req);

    const book = await booksCollection.findOne({
      _id: bookObjectId,
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found.",
      });
    }

    // Prevent the same user from borrowing the same book twice
    const existingBorrow = await borrowsCollection.findOne({
      bookId: bookObjectId,
      userEmail,
    });

    if (existingBorrow) {
      return res.status(409).send({
        message: "You have already borrowed this book.",
      });
    }


    // Decrease available copies only if copies are available
    const updateResult = await booksCollection.updateOne(
      {
        _id: bookObjectId,
        availableCopies: { $gt: 0 },
      },
      {
        $inc: { availableCopies: -1 },
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).send({
        message: "This book is currently not available.",
      });
    }

    const borrowRecord = {
      bookId: bookObjectId,
      bookTitle: book.title,
      bookImage: book.image,

      userName: req.user.name,
      userEmail,

      borrowDate: new Date(),
      returnDate: selectedReturnDate,
    };

    try {
      const result = await borrowsCollection.insertOne(borrowRecord);

      res.status(201).send({
        message: "Book borrowed successfully.",
        insertedId: result.insertedId,
      });
    } catch (insertError) {
      // Restore the book copy if saving the borrow record fails
      await booksCollection.updateOne(
        { _id: bookObjectId },
        { $inc: { availableCopies: 1 } }
      );

      throw insertError;
    }
  } catch (error) {
    console.error("Borrow Book Error:", error);

    res.status(500).send({
      message: "Failed to borrow book.",
    });
  }
});





// 7. GET MY BORROWS
// GET /borrows
// Protected API


app.get("/borrows", verifyToken, async (req, res) => {
  try {
    const userEmail = getUserEmail(req);

    const borrows = await borrowsCollection
      .find({ userEmail })
      .sort({ borrowDate: -1 })
      .toArray();

    res.send(borrows);
  } catch (error) {
    console.error("Get Borrows Error:", error);

    res.status(500).send({
      message: "Failed to load borrowed books.",
    });
  }
});






// 8. RETURN BOOK
// DELETE /borrows/:id
// Protected API + Ownership check


app.delete("/borrows/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).send({
        message: "Invalid borrow ID.",
      });
    }

    const borrow = await borrowsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!borrow) {
      return res.status(404).send({
        message: "Borrow record not found.",
      });
    }





    // A user can return only their own borrowed book
    if (
      borrow.userEmail?.toLowerCase() !== getUserEmail(req)
    ) {
      return res.status(403).send({
        message: "You cannot return someone else's borrowed book.",
      });
    }

    // Delete the borrow record
    const deleteResult = await borrowsCollection.deleteOne({
      _id: new ObjectId(id),
      userEmail: borrow.userEmail,
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).send({
        message: "Borrow record not found.",
      });
    }

    // Increase available copies after returning
    await booksCollection.updateOne(
      { _id: borrow.bookId },
      { $inc: { availableCopies: 1 } }
    );

    res.send({
      message: "Book returned successfully.",
    });
  } catch (error) {
    console.error("Return Book Error:", error);

    res.status(500).send({
      message: "Failed to return book.",
    });
  }
});




// CONNECT DATABASE AND START SERVER


const startServer = async () => {
  try {
    await client.connect();

    const db = client.db(process.env.DB_NAME);

    booksCollection = db.collection("books");
    borrowsCollection = db.collection("borrows");

    console.log("MongoDB Connected Successfully!");

    app.listen(PORT, () => {
      console.log(`BookNook Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server Connection Error:", error);
    process.exit(1);
  }
};

startServer();
