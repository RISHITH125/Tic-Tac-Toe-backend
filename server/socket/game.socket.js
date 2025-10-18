import http from "http";
import { Server } from "socket.io";
import GameState from "../config/gamestate.js";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import LeaderBoard from "../models/LeaderBoard.js";
import fs from "fs";
import path from "path";

// server-side socket maps and queues
const connectedUsers = new Map(); // userId -> { socketId, username }
const socketToUser = new Map(); // socketId -> userId
const userSockets = new Map(); // userId -> Set(socketId)  <-- reverse map to track multiple sockets per user
const matchMakingQueue = []; // [{ userId, socketId, username }]
const activeGames = {}; // roomId -> { gameState, players: { X, O }, turn }
const pendingQuickMatch = new Set(); // userIds waiting for socket connection

let io = null;

function constantLogs() {
  try {
    // prefer repository root (one level above server/) when running the server from server/
    const projectRoot = path.resolve(process.cwd(), "..");
    const logsDir = path.join(projectRoot, "logs");
    fs.mkdirSync(logsDir, { recursive: true });
    console.log(`🗂️  Logs directory ensured at: ${logsDir}`);

    // write a JSON line to a daily rotating file every 10s
    setInterval(() => {
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
      const filename = path.join(logsDir, `socket-${dateStr}.log`);
      // cleanup any stale socketToUser entries where the socket id no longer exists in io
      try {
        cleanupStaleSocketToUser();
      } catch (e) {}

      const logData = {
        timestamp: now.toISOString(),
        // pid: process.pid,
        // activeUsersSize: connectedUsers.size,
        socketToUserSize: socketToUser.size,
        userSocketsSize: userSockets.size,
        activeUsers: [...connectedUsers.values()].map((user) => user.username),
        socketToUserMap: Object.fromEntries(socketToUser),
        userSocketsMap: Object.fromEntries([...userSockets].map(([uid, set]) => [uid, Array.from(set)])),
        matchmakingQueue: matchMakingQueue.length,
        activeGames: Object.keys(activeGames).length,
        pendingQuickMatches: pendingQuickMatch.size,
        // memory: process.memoryUsage(),
      };

      fs.appendFile(filename, JSON.stringify(logData) + "\n", (err) => {
        if (err) console.error("Failed to write log:", err);
      });
    }, 10000);
  } catch (err) {
    console.error("Failed to initialize constantLogs:", err);
  }
}

// Remove socketToUser entries for socketIds that are no longer connected in io
function cleanupStaleSocketToUser() {
  if (!io) return;
  for (const [socketId, userId] of Array.from(socketToUser.entries())) {
    if (!io.sockets.sockets.has(socketId)) {
      socketToUser.delete(socketId);
      // also remove from userSockets reverse map
      const set = userSockets.get(userId);
      if (set) {
        set.delete(socketId);
        if (set.size === 0) {
          userSockets.delete(userId);
          // no more sockets for this user -> remove connectedUsers
          connectedUsers.delete(userId);
        } else {
          // update connectedUsers to point to one remaining socket
          const [nextSocketId] = set;
          const existing = connectedUsers.get(userId);
          if (existing) existing.socketId = nextSocketId;
          else
            connectedUsers.set(userId, {
              socketId: nextSocketId,
              username: null,
            });
        }
      }
      console.log(
        `🧹 Removed stale socketToUser mapping: ${socketId} -> ${userId}`
      );
    }
  }
}

export function webSocketServer(app, allowedOrigins) {
  const server = http.createServer(app);
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Middleware to authenticate socket connections via JWT (handshake.auth.token or query.token)
  const JWT_SECRET = process.env.JWT_SECRET;
  constantLogs();

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth && socket.handshake.auth.token) ||
        (socket.handshake.query && socket.handshake.query.token);
      if (!token) return next(); // allow unauthenticated sockets but they won't be able to quick-match
      const decoded = jwt.verify(token, JWT_SECRET);
      // attach user info to socket.data and register in connectedUsers
      socket.data.user = {
        id: decoded.id?.toString(),
        username: decoded.username,
      };
      if (socket.data.user.id) {
        const uid = socket.data.user.id;
        // maintain connectedUsers: prefer to keep latest socketId for quick lookups
        connectedUsers.set(uid, {
          socketId: socket.id,
          username: socket.data.user.username,
        });
        // socket -> user
        socketToUser.set(socket.id, uid);
        // user -> set(socket ids)
        if (!userSockets.has(uid)) userSockets.set(uid, new Set());
        userSockets.get(uid).add(socket.id);

        console.log(
          `✅ Authenticated socket ${socket.id} as user ${socket.data.user.username} (${uid})`
        );

        // process pending quick-match if user requested it before socket connected
        if (pendingQuickMatch.has(uid)) {
          pendingQuickMatch.delete(uid);
            try {
              handleQuickMatch(socket, uid);
            } catch (err) {
              console.error(
                "❌ Error processing pending quick match after auth:",
                err
              );
            }

        }
      }
      return next();
    } catch (err) {
      console.warn("⚠️ Socket auth failed:", err && err.message);
      return next();
    }
  });

  io.on("connection", (socket) => {
    console.log(
      "🔌 Socket connected:",
      socket.id,
      "user=",
      socket.data.user || null
    );

    // optional fallback for clients that don't provide token at handshake
    socket.on("register", ({ userId, username }) => {
      if (!userId) return;
      const uid = userId.toString();
      connectedUsers.set(uid, { socketId: socket.id, username });
      socketToUser.set(socket.id, uid);
      if (!userSockets.has(uid)) userSockets.set(uid, new Set());
      userSockets.get(uid).add(socket.id);
      socket.data.user = { id: uid, username };
      console.log(
        `✅ Registered (fallback) user ${username} as ${uid} -> socket ${socket.id}`
      );

      // If the user previously asked for a quick-match before connecting, start it now
      if (pendingQuickMatch.has(uid)) {
        pendingQuickMatch.delete(uid);
        try {
          handleQuickMatch(socket, uid);
        } catch (err) {
          console.error("❌ Error handling pending quick match for", uid, err);
        }
      }
    });

    // handle disconnect: remove maps, tear down any active game the user was in and notify opponent
    socket.on("disconnect", (reason) => {
      const userId =
        socketToUser.get(socket.id) ||
        (socket.data.user && socket.data.user.id);
      if (!userId) {
        console.log(
          `❌ Socket disconnected (${socket.id}) - no associated user.`
        );
        return;
      }

      // remove this socket mapping
      socketToUser.delete(socket.id);
      // remove this socketId from userSockets set
      const set = userSockets.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          userSockets.delete(userId);
          // no more active sockets for this user -> remove from connectedUsers
          connectedUsers.delete(userId);
        } else {
          // still other sockets alive; update connectedUsers to point to one of them
          const [nextSocketId] = set;
          const existing = connectedUsers.get(userId);
          if (existing) existing.socketId = nextSocketId;
          else
            connectedUsers.set(userId, {
              socketId: nextSocketId,
              username: socket.data?.user?.username,
            });
        }
      } else {
        // fallback: remove connectedUsers entry
        connectedUsers.delete(userId);
      }

      // remove from matchmaking queue any entries matching this userId or socketId
      for (let i = matchMakingQueue.length - 1; i >= 0; i--) {
        const p = matchMakingQueue[i];
        if (p.userId === userId || p.socketId === socket.id)
          matchMakingQueue.splice(i, 1);
      }

      // find any active game involving this user and tear it down
      for (const [roomId, game] of Object.entries(activeGames)) {
        const isX = game.players?.X?.userId === userId;
        const isO = game.players?.O?.userId === userId;
        if (isX || isO) {
          const opponent = isX ? game.players.O : game.players.X;
          delete activeGames[roomId];
          io.to(roomId).emit("match_terminated", {
            roomId,
            userId,
            reason: "disconnect",
          });
          if (opponent?.socketId) {
            const oppSock = io.sockets.sockets.get(opponent.socketId);
            if (oppSock)
              oppSock.emit("opponent_disconnected", {
                roomId,
                opponentUserId: userId,
                message: "Opponent disconnected",
              });
            // ensure opponent not stuck in queue
            for (let i = matchMakingQueue.length - 1; i >= 0; i--) {
              if (matchMakingQueue[i].userId === opponent.userId)
                matchMakingQueue.splice(i, 1);
            }
          }
          console.log(
            `❌ Game ${roomId} torn down because user ${userId} disconnected.`
          );
        }
      }

      io.volatile.emit("user_disconnected", {
        userId,
        username: socket.data?.user?.username,
      });
      console.log(
        `❌ Socket disconnected (${socket.id}) user ${userId}. Removed from maps and queue.`
      );
    });

    // handle player moves
    socket.on("player_move", (payload) => {
      const { roomId, position } = payload || {};
      if (!roomId || typeof position !== "number") {
        socket.emit("error", { message: "Invalid move payload" });
        return;
      }
      const game = activeGames[roomId];
      if (!game) {
        socket.emit("error", { message: "Invalid game room." });
        return;
      }

      const playerSymbol =
        game.players.X.socketId === socket.id
          ? "X"
          : game.players.O.socketId === socket.id
          ? "O"
          : null;
      if (!playerSymbol) {
        socket.emit("error", { message: "You are not a player in this game." });
        return;
      }
      if (game.turn !== playerSymbol) {
        socket.emit("error", { message: "Not your turn." });
        return;
      }

      try {
        game.gameState.makeMove(playerSymbol, position);
        game.turn = game.gameState.currentTurn;
        const status = game.gameState.status;

        io.to(roomId).emit("move_made", {
          position,
          symbol: playerSymbol,
          gameState: game.gameState.toJSON(),
        });

        if (status === "X_won" || status === "O_won") {
          const winnerInfo = game.gameState.getWinnerInfo();
          io.to(roomId).emit("game_over", {
            winner: winnerInfo?.symbol,
            user: winnerInfo?.user,
          });
          // update leaderboard: winner wins, loser loses
          if (winnerInfo?.user?.username) {
            LeaderBoard.findOneAndUpdate(
              { username: winnerInfo.user.username },
              { $inc: { wins: 1, totalPoints: 10 } },
              { upsert: true, new: true }
            ).catch(() => {});
            const loser =
              winnerInfo.symbol === "X" ? game.players.O : game.players.X;
            if (loser?.userId)
              LeaderBoard.findOneAndUpdate(
                { userId: loser.userId },
                { $inc: { losses: 1 } },
                { upsert: true, new: true }
              ).catch(() => {});
          }
        } else if (status === "draw") {
          io.to(roomId).emit("game_over", { winner: null });
          LeaderBoard.findOneAndUpdate(
            { username: game.players.X.username },
            { $inc: { draws: 1, totalPoints: 5 } },
            { upsert: true, new: true }
          ).catch(() => {});
          LeaderBoard.findOneAndUpdate(
            { username: game.players.O.username },
            { $inc: { draws: 1, totalPoints: 5 } },
            { upsert: true, new: true }
          ).catch(() => {});
        }
      } catch (error) {
        socket.emit("error", { message: error.message });
      }
    });
  });

  const listenPort = process.env.SOCKET_PORT || process.env.PORT || 3001;
  server.listen(listenPort, () =>
    console.log(`🟢 WebSocket server listening on port ${listenPort}`)
  );

  return io;
}

function tryMatchPlayers() {
  while (matchMakingQueue.length >= 2) {
    const playerA = matchMakingQueue.shift();
    const playerB = matchMakingQueue.shift();

    if (!io) return; // Helper function to check and update socket ID for a player in the queue

    const getActiveSocket = (player) => {
      // 1. Try to get the socket using the ID stored in the queue entry
      let socket = io.sockets.sockets.get(player.socketId);

      if (!socket) {
        // 2. If the stored socket ID is stale, look up ANY active socket for the userId
        const activeIds = userSockets.get(player.userId);
        if (activeIds && activeIds.size > 0) {
          const newSocketId = [...activeIds][0]; // Pick the first active socket ID
          socket = io.sockets.sockets.get(newSocketId);
          if (socket) {
            // 3. Update the player object in the queue with the new active socket ID
            player.socketId = newSocketId; // Note: Since playerA/B are copies, this only affects the local variable here. // We rely on the fact that if this fails, they are put back in the queue // with this updated socketId, though the shift/unshift logic handles the flow. // For a quick match, updating the local variable is enough to proceed.
          }
        }
      }
      return socket;
    };

    const socketA = getActiveSocket(playerA);
    const socketB = getActiveSocket(playerB);

    if (!socketA || !socketB) {
      // Only put a player back into the queue if we successfully found an active socket for them.
      // If we didn't find an active socket for them via userSockets, they are truly gone and shouldn't be re-queued.
      if (socketA) {
        // Note: playerA's socketId is updated if a fresher one was found, ensuring the queue entry is current.
        matchMakingQueue.unshift(playerA);
      } else {
        // Log an error if a player was shifted but is no longer connected at all
        console.log(
          `⚠️ Player ${playerA.username} (${playerA.userId}) shifted from queue but is disconnected.`
        );
      }

      if (socketB) {
        matchMakingQueue.unshift(playerB);
      } else {
        console.log(
          `⚠️ Player ${playerB.username} (${playerB.userId}) shifted from queue but is disconnected.`
        );
      }
      // Now that we have re-queued the still-connected player(s), continue to the next loop.
      continue;
    } // If both sockets were found (or successfully updated/refreshed), proceed with the match:

    const roomId = uuidv4(); // Randomly assign X/O

    const firstIsX = Math.random() < 0.5;
    const pX = firstIsX ? playerA : playerB;
    const pO = firstIsX ? playerB : playerA;

    const playersMap = { X: pX.username, O: pO.username };
    const gameState = new GameState(playersMap, roomId);

    activeGames[roomId] = {
      gameState,
      players: {
        // IMPORTANT: Use the potentially updated socketIds (pX.socketId and pO.socketId) for the game object
        X: { userId: pX.userId, socketId: pX.socketId, username: pX.username },
        O: { userId: pO.userId, socketId: pO.socketId, username: pO.username },
      },
      turn: gameState.currentTurn,
      createdAt: Date.now(),
    };

    socketA.join(roomId);
    socketB.join(roomId);

    console.log(
      `🎮 Match found: ${pX.username} (X) vs ${pO.username} (O) in room ${roomId}`
    );

    const payload = {
      roomId,
      playersMap: {
        [pX.username]: "X",
        [pO.username]: "O",
      },
      gameState: gameState.toJSON(),
      startingSymbol: gameState.currentTurn,
    };

    io.to(roomId).emit("match_found", payload);

    socketA.emit("symbol_assigned", { symbol: firstIsX ? "X" : "O" });
    socketB.emit("symbol_assigned", { symbol: firstIsX ? "O" : "X" });

    io.to(roomId).emit("game_start");
  }
}

function handleQuickMatch(socket, userid) {
  if (!connectedUsers.has(userid)) {
    console.error(`❌ User ${userid} not found in connected users map.`);
    socket.emit("queuedStatus", {
      status: "error",
      message: "Socket not registered",
    });
    return;
  }
  if (matchMakingQueue.find((p) => p.userId === userid)) {
    console.log(`⚠️ User ${userid} is already in the matchmaking queue.`);
    socket.emit("queuedStatus", {
      status: "waiting",
      message: "Already queued",
    });
    return;
  }
  const user = connectedUsers.get(userid);
  matchMakingQueue.push({
    userId: userid,
    socketId: socket.id,
    username: user.username,
  });
  console.log(
    `🔍 User ${user.username} (${userid}) added to matchmaking queue.`
  );
  socket.emit("queuedStatus", {
    status: "waiting",
    message: "Searching for an opponent...",
  });
  tryMatchPlayers();
}

export const socketHandler = async (userid) => {
  if (!io) return { error: "Socket server not initialized" };
  const userEntry = connectedUsers.get(userid);

  const activeSocketIds = userSockets.get(userid);
  if (!activeSocketIds || activeSocketIds.size === 0) {
    // no socket yet — mark for pending quick match
    pendingQuickMatch.add(userid);
    console.log(
      `⏳ User ${userid} quick match pending no active sockets found.`
    );
    return { ok: true, pending: true };
  }
  const firstActiveSocketId = [...activeSocketIds][0];
  const socket = io.sockets.sockets.get(firstActiveSocketId);
  if (!socket) {
    // socket not found — mark for pending quick match
    pendingQuickMatch.add(userid);
    console.log(
      `⏳ Quick match pending for user ${userid}, socket not found in io map.`
    );
    return { ok: true, pending: true };
  }

  // socket present — proceed synchronously
  try {
    handleQuickMatch(socket, userid);
    return { ok: true };
  } catch (err) {
    console.error("❌ Error in socketHandler:", err);
    return { error: err.message || "internal" };
  }
};
