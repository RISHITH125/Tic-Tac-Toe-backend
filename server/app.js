import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import router from './routes/auth.routes.js';
import { webSocketServer } from './socket/game.socket.js';

// load environment variables as early as possible
dotenv.config();

// initialize DB after envs are loaded
connectDB();

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173'
];


const app = express();
app.use(express.json());

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

webSocketServer(app, allowedOrigins);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

// mount the auth router at /auth so routes like POST /auth/signin work
app.use('/auth', router);



app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
