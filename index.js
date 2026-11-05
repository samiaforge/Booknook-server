import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 5000;

const client = new MongoClient(process.env.DB_URI);

app.use(cors());
app.use(express.json());

const connectDB = async () => {
    try {
        await client.connect();

        console.log('MongoDB Connected Successfully!');

        return client.db(process.env.DB_NAME);

    } catch (error) {
        console.error('MongoDB Connection Failed:', error);
        process.exit(1);
    }
};

const startServer = async () => {
    const db = await connectDB();

    app.locals.db = db;
    const booksCollection = db.collection('books');
    const borrowsCollection = db.collection('borrows');

    app.get('/', (req, res) => {
        res.send({ message: 'BookNook Server is Running!' });
    });

    


app.get('/books', async (req, res) => {
    const limit = parseInt(req.query.limit);

    let query = booksCollection
        .find()
        .sort({ createdAt: -1 });

    if (limit > 0) {
        query = query.limit(limit);
    }

    const books = await query.toArray();

    res.send(books);
});




app.get('/books/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).send({
                message: 'Invalid Book ID'
            });
        }

        const book = await booksCollection.findOne({
            _id: new ObjectId(id)
        });

        if (!book) {
            return res.status(404).send({
                message: 'Book Not Found'
            });
        }

        res.send(book);

    } catch (error) {
        res.status(500).send({
            message: 'Something went wrong'
        });
    }
});


app.post('/books', async (req, res) => {
    try {
        const book = req.body;

        const newBook = {
            title: book.title,
            author: book.author,
            category: book.category,
            image: book.image,
            description: book.description,
            addedBy: {
                name: book.addedBy.name,
                email: book.addedBy.email
            },
            totalCopies: parseInt(book.totalCopies),
            availableCopies: parseInt(book.totalCopies),
            createdAt: new Date()
        };

        const result = await booksCollection.insertOne(newBook);

        res.send(result);

    } catch (error) {
        res.status(500).send({
            message: 'Failed to add book'
        });
    }
});



app.patch('/books/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const updatedBook = req.body;

        if (!ObjectId.isValid(id)) {
            return res.status(400).send({
                message: 'Invalid Book ID'
            });
        }

        const result = await booksCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedBook }
        );

        res.send(result);

    } catch (error) {
        res.status(500).send({
            message: 'Failed to update book'
        });
    }
});



app.delete('/books/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).send({
                message: 'Invalid Book ID'
            });
        }

        const result = await booksCollection.deleteOne({
            _id: new ObjectId(id)
        });

        if (result.deletedCount === 0) {
            return res.status(404).send({
                message: 'Book Not Found'
            });
        }

        res.send({
            message: 'Book Deleted Successfully'
        });

    } catch (error) {
        res.status(500).send({
            message: 'Failed to delete book'
        });
    }
});




// borrow books
app.post('/borrows', async (req, res) => {
    try {
        const { bookId, userName, userEmail, returnDate } = req.body;

        // Check required information
        if (!bookId || !userName || !userEmail || !returnDate) {
            return res.status(400).send({
                message: 'All fields are required'
            });
        }

        // Check valid Book ID
        if (!ObjectId.isValid(bookId)) {
            return res.status(400).send({
                message: 'Invalid Book ID'
            });
        }

        // Find the book
        const book = await booksCollection.findOne({
            _id: new ObjectId(bookId)
        });

        if (!book) {
            return res.status(404).send({
                message: 'Book Not Found'
            });
        }

        // Check duplicate borrowing
        const existingBorrow = await borrowsCollection.findOne({
            bookId: bookId,
            userEmail: userEmail.toLowerCase()
        });

        if (existingBorrow) {
            return res.status(400).send({
                message: 'You have already borrowed this book'
            });
        }

        // Check available copies
        const result = await booksCollection.updateOne(
            {
                _id: new ObjectId(bookId),
                availableCopies: { $gt: 0 }
            },
            {
                $inc: { availableCopies: -1 }
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(400).send({
                message: 'Book is not available'
            });
        }


        


        // Date validation
const today = new Date();
today.setHours(0, 0, 0, 0);

const selectedReturnDate = new Date(`${returnDate}T00:00:00`);

if (
    isNaN(selectedReturnDate.getTime()) ||
    selectedReturnDate <= today
) {
    return res.status(400).send({
        message: 'Return date must be a future date'
    });
}

        // Create borrow record
        const borrowRecord = {
            bookId: bookId,
            bookTitle: book.title,
            bookImage: book.image,
            userName: userName,
            userEmail: userEmail.toLowerCase(),
            borrowDate: new Date(),
            returnDate: new Date(returnDate)
        };

        const borrowResult = await borrowsCollection.insertOne(borrowRecord);

        res.status(201).send({
            message: 'Book Borrowed Successfully',
            insertedId: borrowResult.insertedId
        });

    } catch (error) {
        console.error('Borrow Error:', error);

        res.status(500).send({
            message: 'Failed to borrow book'
        });
    }
});




app.get('/borrows', async (req, res) => {
    try {
        const borrows = await borrowsCollection.find().toArray();

        res.send(borrows);

    } catch (error) {
        console.error('Fetch Borrows Error:', error);

        res.status(500).send({
            message: 'Failed to fetch borrow records'
        });
    }
});




// DELETE /borrows/:id - Return Book
app.delete('/borrows/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
            return res.status(400).send({
                message: 'Invalid Borrow ID'
            });
        }

        const borrow = await borrowsCollection.findOne({
            _id: new ObjectId(id)
        });

        if (!borrow) {
            return res.status(404).send({
                message: 'Borrow Record Not Found'
            });
        }

        await borrowsCollection.deleteOne({
            _id: new ObjectId(id)
        });

        await booksCollection.updateOne(
            { _id: new ObjectId(borrow.bookId) },
            { $inc: { availableCopies: 1 } }
        );

        res.send({
            message: 'Book Returned Successfully'
        });

    } catch (error) {
        console.error('Return Book Error:', error);
        res.status(500).send({
            message: 'Failed to return book'
        });
    }
});







    app.listen(PORT, () => {
        console.log(`BookNook Server is running on port ${PORT}`);
    });
};

startServer();