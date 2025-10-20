# 🎮 Tic Tac Toe - Backend

This is the **authoritative backend** for the multiplayer **Tic Tac Toe** game built with **Express.js** and **Socket.IO**.
It handles real-time matchmaking, game state validation, and leaderboard management — all while ensuring that gameplay logic stays fully on the server for fairness and security.

Frontend: [React.js Client](https://ticstacsortoes.netlify.app) *(link to your frontend repo if you have one)*
Backend: Express + Socket.IO
Deployment: Docker on AWS (with Caddy as reverse proxy)

---

## 🧠 Overview

This backend acts as the **brain of the game**.
It ensures that:

* Players connect and communicate in real time using **Socket.IO**.
* Every move a player makes is **validated by the server**, preventing cheating or desynchronization.
* Players are matched automatically through a **real-time matchmaking queue**.
* The **leaderboard** updates dynamically based on wins, losses, and draws.

---

## ⚙️ Tech Stack

| Layer                 | Technology | Purpose                                                    |
| --------------------- | ---------- | ---------------------------------------------------------- |
| **Frontend**          | React.js   | Player interface                                           |
| **Backend Framework** | Express.js | REST API for auth, leaderboard, and static routes          |
| **WebSocket Layer**   | Socket.IO  | Real-time matchmaking, gameplay events, and updates        |
| **Database**          | MongoDB    | Player profiles, stats, and leaderboard data               |
| **Containerization**  | Docker     | Packaging and running the backend as an isolated container |
| **Reverse Proxy**     | Caddy      | Handles HTTPS, routing, and SSL termination                |
| **Cloud**             | AWS EC2    | Hosting environment for production deployment              |

---

## 🧩 Architecture

Here’s how the whole system works together:

```
                              🌐 Frontend Layer
                     ┌─────────────────────────────────────┐
                     │  React + Vite (Netlify Hosted)      │
                     │  https://ticstacsortoes.netlify.app │
                     └────────────────┬────────────────────┘
                                      │
                                      │  HTTPS / WSS
                                      ▼
                            🔐 Reverse Proxy Layer
                     ┌──────────────────────────────────┐
                     │            Caddy                 │
                     │   SSL Termination + Routing      │
                     │  Forwards traffic to backend     │
                     └────────────────┬─────────────────┘
                                      │
                                      ▼
                             ⚙️ Application Layer
                     ┌─────────────────────────────────┐
                     │        Express.js Server        │
                     │  - REST APIs for Auth & Scores  │
                     │  - Socket.IO for Real-time Play │
                     │  - Authoritative Game Logic     │
                     └────────────────┬────────────────┘
                                      │
                                      ▼
                             🗄️ Data Persistence Layer
                     ┌─────────────────────────────────┐
                     │            MongoDB              │
                     │ Stores Players, Matches, Stats  │
                     └─────────────────────────────────┘

```

* **Caddy** is configured as a reverse proxy in front of the backend. It routes both HTTPS API requests and WebSocket connections to the Express server.
* **Express.js** handles:

  * Authentication routes (`/auth/login`)
  * Leaderboard APIs (`/user/leaderboard`)
* **Socket.IO** handles:

  * Real-time matchmaking (players wait in queue until paired)
  * Gameplay events (`move`, `gameOver`, `disconnect`)
* The **server** maintains **authoritative game state** — meaning clients only send move intents, and the server decides whether they’re valid.

---

## 🔁 Gameplay Flow

1. **Player joins the queue** → added to matchmaking pool.
2. **Match found** → server creates a new room, assigns players.
3. **Game state initialized** → players notified via Socket.IO.
4. **Player makes a move** → server validates legality and updates board.
5. **Server broadcasts** the updated state to both clients.
6. **Game ends** → results are stored in MongoDB and leaderboard is updated.

---

## 🧑‍💻 Author

**Developed by:** Rishith P

**Frontend + Backend Integration:** Custom React + Express + Socket.IO stack

**Deployed on:** AWS EC2 using Docker and Caddy

