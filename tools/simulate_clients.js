import { io } from "socket.io-client";
import jwt from "jsonwebtoken";

// Minimal simulation script for two clients
// Usage: node tools/simulate_clients.js

const SOCKET_URL = process.env.SOCKET_URL || "http://localhost:3001";
const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

function makeToken(id, username) {
  return jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '1h' });
}

function makeClient(id, username) {
  const token = makeToken(id, username);
  const socket = io(SOCKET_URL, { auth: { token }, reconnection: false });

  socket.on('connect', () => {
    console.log(`${username} connected as ${socket.id}`);
    socket.emit('quick_match');
  });

  socket.on('queuedStatus', (d) => console.log(`${username} queuedStatus:`, d));
  socket.on('match_found', (d) => console.log(`${username} match_found:`, d));
  socket.on('symbol_assigned', (d) => console.log(`${username} symbol_assigned:`, d));
  socket.on('game_start', () => console.log(`${username} game_start`));
  socket.on('move_made', (m) => console.log(`${username} move_made:`, m));
  socket.on('game_over', (g) => console.log(`${username} game_over:`, g));
  socket.on('opponent_disconnected', (o) => console.log(`${username} opponent_disconnected:`, o));
  socket.on('disconnect', (r) => console.log(`${username} disconnected:`, r));

  return socket;
}

(async () => {
  const a = makeClient('u1', 'alice');
  const b = makeClient('u2', 'bob');

  // Exit after 30s
  setTimeout(() => {
    a.disconnect();
    b.disconnect();
    process.exit(0);
  }, 30000);
})();
