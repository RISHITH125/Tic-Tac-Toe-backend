import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { Client } from '@heroiclabs/nakama-js';
import cors from 'cors';

dotenv.config();

const app = express();
app.use(express.json());

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'],
  credentials: true,
}));

const PORT = process.env.PORT || 3000;
const NAKAMA_HOST = process.env.NAKAMA_HOST || "127.0.0.1";
const NAKAMA_KEY = process.env.NAKAMA_KEY || "TicTacToe125";
const NAKAMA_PORT = process.env.NAKAMA_PORT || "7350";

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/auth', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // ✅ explicitly disable SSL in Node context
    const nakamaClient = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, false);

    const tempemail= `${username}@guest.com`;
    const session = await nakamaClient.authenticateEmail(tempemail, password, true, username);

    console.log('✅ Authentication session:', session);
    res.status(200).json({ status: 'success', session });
  } catch (error) {

    if (error && error.status === 409) {
      return res.status(409).json({ error: 'Conflict: User already exists' });
    }

    // Handle bad credentials / validation errors from Nakama
    if (error && error.status === 401) {
      // Try to surface Nakama's message when available
      const msg = (error && error.statusText) ? error.statusText : 'Invalid credentials';
      return res.status(401).json({ error: 'Invalid username or password', details: msg });
    }

    console.error('❌ Error during authentication:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error && error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
