import http from 'http';
import { Server } from 'socket.io';
import GameState from '../config/gamestate.js';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

// server-side socket maps and queues
const connectedUsers = new Map(); // userId -> { socketId, username }
const socketToUser = new Map(); // socketId -> userId
const matchMakingQueue = []; // [{ userId, socketId, username }]
const activeGames = {}; // roomId -> { gameState, players: { X, O }, turn }

let io = null;

export function webSocketServer(app, allowedOrigins = ['*']) {
    const server = http.createServer(app);
    io = new Server(server, {
        cors: {
            origin: allowedOrigins,
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    // Middleware to authenticate socket connections via JWT (handshake.auth.token or query.token)
    const JWT_SECRET = process.env.JWT_SECRET ;

    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth && socket.handshake.auth.token || socket.handshake.query && socket.handshake.query.token;
            if (!token) return next(); // allow unauthenticated sockets but they won't be able to quick-match
            const decoded = jwt.verify(token, JWT_SECRET);
            // attach user info to socket.data and register in connectedUsers
            socket.data.user = { id: decoded.id?.toString(), username: decoded.username };
            if (socket.data.user.id) {
                connectedUsers.set(socket.data.user.id, { socketId: socket.id, username: socket.data.user.username });
                socketToUser.set(socket.id, socket.data.user.id);
                console.log(`✅ Authenticated socket ${socket.id} as user ${socket.data.user.username} (${socket.data.user.id})`);
            }
            return next();
        } catch (err) {
            console.warn('⚠️ Socket auth failed:', err && err.message);
            return next();
        }
    });

    io.on('connection', (socket) => {
        console.log('🔌 Socket connected:', socket.id, 'user=', socket.data.user || null);

        // optional fallback for clients that don't provide token at handshake
        socket.on('register', ({ userId, username }) => {
            if (!userId) return;
            connectedUsers.set(userId.toString(), { socketId: socket.id, username });
            socketToUser.set(socket.id, userId.toString());
            socket.data.user = { id: userId.toString(), username };
            console.log(`✅ Registered (fallback) user ${username} as ${userId} -> socket ${socket.id}`);
        });

        socket.on('disconnect', (reason) => {
            const userId = socketToUser.get(socket.id) || (socket.data.user && socket.data.user.id);
            if (userId) {
                connectedUsers.delete(userId);
                // remove from queue
                const idx = matchMakingQueue.findIndex((p) => p.userId === userId);
                if (idx !== -1) matchMakingQueue.splice(idx, 1);
                socketToUser.delete(socket.id);
                console.log(`❌ Socket disconnected (${socket.id}) user ${userId}. Removed from maps and queue.`);
            } else {
                console.log(`❌ Socket disconnected (${socket.id}) - no associated user.`);
            }
        });
    });

    const listenPort = process.env.SOCKET_PORT || process.env.PORT || 3001;
    server.listen(listenPort, () => console.log(`🟢 WebSocket server listening on port ${listenPort}`));

    return io;
}

function tryMatchPlayers() {
    while (matchMakingQueue.length >= 2) {
        const playerA = matchMakingQueue.shift();
        const playerB = matchMakingQueue.shift();

        if (!io) return;
        const socketA = io.sockets.sockets.get(playerA.socketId);
        const socketB = io.sockets.sockets.get(playerB.socketId);

        if (!socketA || !socketB) {
            if (socketA) matchMakingQueue.unshift(playerA);
            if (socketB) matchMakingQueue.unshift(playerB);
            continue;
        }

        const roomId = uuidv4();

        // Randomly assign X/O
        const firstIsX = Math.random() < 0.5;
        const pX = firstIsX ? playerA : playerB;
        const pO = firstIsX ? playerB : playerA;

        const playersMap = { X: pX.username, O: pO.username };
        const gameState = new GameState(playersMap, roomId);

        activeGames[roomId] = {
            gameState,
            players: {
                X: { userId: pX.userId, socketId: pX.socketId, username: pX.username },
                O: { userId: pO.userId, socketId: pO.socketId, username: pO.username },
            },
            turn: gameState.currentTurn,
            createdAt: Date.now(),
        };

        socketA.join(roomId);
        socketB.join(roomId);

        console.log(`🎮 Match found: ${pX.username} (X) vs ${pO.username} (O) in room ${roomId}`);

        const payload = {
            roomId,
            players: {
                X: { username: pX.username },
                O: { username: pO.username },
            },
            gameState: gameState.toJSON(),
            startingSymbol: gameState.currentTurn,
        };

        io.to(roomId).emit('match_found', payload);

        socketA.emit('symbol_assigned', { symbol: firstIsX ? 'X' : 'O' });
        socketB.emit('symbol_assigned', { symbol: firstIsX ? 'O' : 'X' });

        io.to(roomId).emit('game_start', payload);
    }
}

function handleQuickMatch(socket, userid) {
    if (!connectedUsers.has(userid)) {
        console.error(`❌ User ${userid} not found in connected users map.`);
        socket.emit('queuedStatus', { status: 'error', message: 'Socket not registered' });
        return;
    }
    if (matchMakingQueue.find((p) => p.userId === userid)) {
        console.log(`⚠️ User ${userid} is already in the matchmaking queue.`);
        socket.emit('queuedStatus', { status: 'waiting', message: 'Already queued' });
        return;
    }
    const user = connectedUsers.get(userid);
    matchMakingQueue.push({ userId: userid, socketId: socket.id, username: user.username });
    console.log(`🔍 User ${user.username} (${userid}) added to matchmaking queue.`);
    socket.emit('queuedStatus', { status: 'waiting', message: 'Searching for an opponent...' });
    tryMatchPlayers();
}

export const socketHandler = (userid) => {
    if (!io) return { error: 'Socket server not initialized' };
    const userEntry = connectedUsers.get(userid);
    if (!userEntry) return { error: 'Socket connection not found, ensure the websocket is connected.' };
    const socket = io.sockets.sockets.get(userEntry.socketId);
    if (!socket) return { error: 'Socket connection not found, ensure the websocket is connected.' };
    handleQuickMatch(socket, userid);
    return { ok: true };
};