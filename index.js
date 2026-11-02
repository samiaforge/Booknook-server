import express from 'express';
import { MongoClient } from 'mongodb';
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

    app.get('/', (req, res) => {
        res.send({ message: 'BookNook Server is Running!' });
    });

    app.listen(PORT, () => {
        console.log(`BookNook Server is running on port ${PORT}`);
    });
};

startServer();