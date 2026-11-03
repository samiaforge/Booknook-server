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

    app.get('/', (req, res) => {
        res.send({ message: 'BookNook Server is Running!' });
    });

    app.get('/books', async (req, res) => {
    const books = await booksCollection.find()
    .sort({ createdAt: -1 })
    .toArray();

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

    app.listen(PORT, () => {
        console.log(`BookNook Server is running on port ${PORT}`);
    });
};

startServer();