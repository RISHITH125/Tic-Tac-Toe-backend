/**
 * simulate_full_flow.js
 * A simple end-to-end test harness that:
 *  - Creates two JWT tokens (signed with JWT_SECRET)
 *  - Connects two socket.io clients
 *  - Calls the HTTP quick-match endpoint for both users
 *  - Waits for match_found and game_start
 *  - Sends one move from player A and listens for move_made
 *
 * Usage:
 *  $env:JWT_SECRET = 'your_jwt_secret'; node tools/simulate_full_flow.js
 *
 * Adjust SOCKET_URL and API_URL as needed.
 */

import fetch from 'node-fetch';
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3001';
const API_URL = process.env.API_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

function makeToken(id, username) {
  return jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '1h' });
}

async function httpQuickMatch(token) {
  const res = await fetch(`${API_URL}/auth/quick-match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  const json = await res.json();
  return json;
}

async function run() {
  const userA = { id: 'u-test-a', username: 'alice' };
  const userB = { id: 'u-test-b', username: 'bob' };
  const tokenA = makeToken(userA.id, userA.username);
  const tokenB = makeToken(userB.id, userB.username);

  console.log('Connecting sockets...');
  const socketA = io(SOCKET_URL, { auth: { token: tokenA }, reconnection: false });
  const socketB = io(SOCKET_URL, { auth: { token: tokenB }, reconnection: false });

  let roomId = null;
  let mySymbolA = null;

  socketA.on('connect', () => console.log('A connected', socketA.id));
  socketB.on('connect', () => console.log('B connected', socketB.id));

  socketA.on('queuedStatus', (d) => console.log('A queuedStatus', d));
  socketB.on('queuedStatus', (d) => console.log('B queuedStatus', d));

  socketA.on('match_found', (d) => {
    console.log('A match_found', d);
    roomId = d.roomId;
  });
  socketB.on('match_found', (d) => {
    console.log('B match_found', d);
    roomId = d.roomId;
  });

  socketA.on('symbol_assigned', (d) => {
    console.log('A symbol_assigned', d); mySymbolA = d.symbol;
  });
  socketB.on('symbol_assigned', (d) => console.log('B symbol_assigned', d));

  socketA.on('game_start', () => console.log('A game_start'));
  socketB.on('game_start', () => console.log('B game_start'));

  socketA.on('move_made', (m) => console.log('A move_made received', m));
  socketB.on('move_made', (m) => console.log('B move_made received', m));

  socketA.on('game_over', (g) => console.log('A game_over', g));
  socketB.on('game_over', (g) => console.log('B game_over', g));

  // wait for both sockets to connect
  await new Promise((res) => {
    let a=false,b=false;
    socketA.on('connect',()=>{a=true; if(a&&b)res();});
    socketB.on('connect',()=>{b=true; if(a&&b)res();});
    setTimeout(()=>res(),5000);
  });

  console.log('Requesting quick match via HTTP for both users');
  await httpQuickMatch(tokenA).then(r=>console.log('HTTP quickmatch A response', r)).catch(e=>console.log('HTTP error A', e));
  await httpQuickMatch(tokenB).then(r=>console.log('HTTP quickmatch B response', r)).catch(e=>console.log('HTTP error B', e));

  // wait for match_found and game_start
  await new Promise((res, rej) => {
    const timeout = setTimeout(()=>rej(new Error('match not found in time')), 15000);
    const onStart = () => { clearTimeout(timeout); res(); };
    socketA.on('game_start', onStart);
    socketB.on('game_start', onStart);
  }).catch(e=>{ console.error(e); process.exit(1); });

  console.log('Both clients matched. Sending a move from A (position 0)');
  // send a move from A; assume board positions indexed 0..8
  socketA.emit('player_move', { roomId, index: 0 });

  // wait to receive move_made on both clients
  await new Promise((res) => setTimeout(res, 3000));

  console.log('Test sequence complete. Disconnecting sockets.');
  socketA.disconnect(); socketB.disconnect();
  process.exit(0);
}

run().catch((e)=>{ console.error('simulate_full_flow failed:', e); process.exit(1); });
