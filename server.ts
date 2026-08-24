import { createServer } from 'node:http';
import { loadEnvConfig } from '@next/env';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';

// tsx does not read .env files, and this custom server needs MONGODB_URI
// before anything imports the Mongo client. Must run before those imports.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

import { C2S, S2C, ROOM_ID_RE, isSandboxRoomId, type ClientMessage, type ServerMessage } from './lib/protocol';
import {
  getOrCreateRoom,
  getRoom,
  sweepEmptyRooms,
  persistRoom,
  flushAll,
} from './lib/roomStore';
import {
  addPlayer,
  removePlayer,
  getPlayer,
  setAppearance,
  updateSettings,
  startGame,
  rematch,
  rollDice,
  buyProperty,
  skipProperty,
  placeBid,
  passAuction,
  dropFromAuction,
  expireAuction,
  endTurn,
  buildHouse,
  sellHouse,
  sellProperty,
  mortgageProperty,
  unmortgageProperty,
  declareBankrupt,
  proposeTrade,
  respondTrade,
  setTradeDrafting,
  clearDrafting,
  sendChat,
  serialize,
} from './lib/gameEngine';
import { applySandbox } from './lib/sandbox';
import type { EngineResult } from './types/game';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

interface Session {
  roomId: string;
  /** null while a socket is only watching the room (picking an appearance). */
  playerId: string | null;
}

/** ws instances carry a liveness flag for the heartbeat sweep. */
type GameSocket = WebSocket & { isAlive?: boolean };

const sessions = new Map<WebSocket, Session>();

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function fail(ws: WebSocket, message: string): void {
  send(ws, { type: S2C.ERROR, message });
}

/** One pending auction deadline per room. */
const auctionTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Auctions close on a clock, so something has to wake the room up when nobody
 * acts. Rescheduling from broadcast() covers every path that can start, extend
 * or end an auction, because every state change broadcasts.
 */
function scheduleAuctionDeadline(wss: WebSocketServer, roomId: string): void {
  const existing = auctionTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    auctionTimers.delete(roomId);
  }

  const pending = getRoom(roomId)?.pending;
  if (!pending || pending.type !== 'auction') return;

  // a small cushion so the deadline has definitely passed when we check
  const delay = Math.max(0, pending.endsAt - Date.now()) + 25;
  const timer = setTimeout(() => {
    auctionTimers.delete(roomId);
    const room = getRoom(roomId);
    if (!room) return;
    if (expireAuction(room)) broadcast(wss, roomId);
  }, delay);

  auctionTimers.set(roomId, timer);
}

function broadcast(wss: WebSocketServer, roomId: string): void {
  const room = getRoom(roomId);
  if (!room) return;
  persistRoom(room); // every broadcast follows a state change worth keeping
  const payload = JSON.stringify({ type: S2C.STATE, state: serialize(room) });
  for (const client of wss.clients) {
    if (sessions.get(client)?.roomId === roomId && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
  scheduleAuctionDeadline(wss, roomId);
}

/** Engine calls share one shape: run, surface the error, otherwise rebroadcast. */
function apply(ws: WebSocket, wss: WebSocketServer, roomId: string, fn: () => EngineResult): void {
  const result = fn();
  if (result.error) {
    fail(ws, result.error);
    return;
  }
  broadcast(wss, roomId);
}

async function handleMessage(ws: WebSocket, wss: WebSocketServer, raw: string): Promise<void> {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    return fail(ws, 'Malformed message');
  }
  if (!msg || typeof msg.type !== 'string') return fail(ws, 'Malformed message');

  if (msg.type === C2S.PING) return send(ws, { type: S2C.PONG });

  // --- watch / join / rejoin run before a seated session exists ---------
  if (msg.type === C2S.WATCH) {
    const roomId = String(msg.roomId ?? '').toLowerCase().slice(0, 12);
    if (!ROOM_ID_RE.test(roomId)) return fail(ws, 'Invalid room code');

    // Creating on demand is what makes a shared /room/<code> link work.
    const room = await getOrCreateRoom(roomId, {
      sandbox: Boolean(msg.sandbox) || isSandboxRoomId(roomId),
    });
    sessions.set(ws, { roomId, playerId: null });
    return send(ws, { type: S2C.STATE, state: serialize(room) });
  }

  if (msg.type === C2S.JOIN) {
    const roomId = String(msg.roomId ?? '').toLowerCase().slice(0, 12);
    if (!ROOM_ID_RE.test(roomId)) return fail(ws, 'Invalid room code');

    const room = await getOrCreateRoom(roomId);
    const { player, error } = addPlayer(room, { name: msg.name, color: msg.color });
    if (error || !player) return fail(ws, error ?? 'Could not join');

    sessions.set(ws, { roomId, playerId: player.id });
    send(ws, { type: S2C.JOINED, playerId: player.id, roomId });
    return broadcast(wss, roomId);
  }

  if (msg.type === C2S.REJOIN) {
    const roomId = String(msg.roomId ?? '').toLowerCase();
    if (!ROOM_ID_RE.test(roomId)) return fail(ws, 'Invalid room code');
    // rehydrates from Mongo when the process restarted mid-game
    const room = await getOrCreateRoom(roomId);
    const player = getPlayer(room, msg.playerId);
    if (!player) return fail(ws, 'You are no longer in this room');

    player.connected = true;
    sessions.set(ws, { roomId, playerId: player.id });
    send(ws, { type: S2C.JOINED, playerId: player.id, roomId });
    return broadcast(wss, roomId);
  }

  // --- everything else needs a seated session --------------------------
  const session = sessions.get(ws);
  if (!session?.playerId) return fail(ws, 'Join a room first');

  const { roomId, playerId } = session;
  const room = getRoom(roomId);
  if (!room) return fail(ws, 'Room no longer exists');

  switch (msg.type) {
    case C2S.SET_APPEARANCE:
      return apply(ws, wss, roomId, () => setAppearance(room, playerId, msg.color));
    case C2S.UPDATE_SETTINGS:
      return apply(ws, wss, roomId, () => updateSettings(room, playerId, msg.settings ?? {}));
    case C2S.START:
      return apply(ws, wss, roomId, () => startGame(room, playerId));
    case C2S.REMATCH:
      return apply(ws, wss, roomId, () => rematch(room, playerId));
    case C2S.ROLL:
      return apply(ws, wss, roomId, () => rollDice(room, playerId));
    case C2S.BUY:
      return apply(ws, wss, roomId, () => buyProperty(room, playerId));
    case C2S.SKIP:
      return apply(ws, wss, roomId, () => skipProperty(room, playerId));
    case C2S.BID:
      return apply(ws, wss, roomId, () => placeBid(room, playerId, msg.amount));
    case C2S.PASS:
      return apply(ws, wss, roomId, () => passAuction(room, playerId));
    case C2S.END_TURN:
      return apply(ws, wss, roomId, () => endTurn(room, playerId));
    case C2S.BUILD:
      return apply(ws, wss, roomId, () => buildHouse(room, playerId, msg.tileIndex));
    case C2S.SELL_HOUSE:
      return apply(ws, wss, roomId, () => sellHouse(room, playerId, msg.tileIndex));
    case C2S.SELL_PROPERTY:
      return apply(ws, wss, roomId, () => sellProperty(room, playerId, msg.tileIndex));
    case C2S.MORTGAGE:
      return apply(ws, wss, roomId, () => mortgageProperty(room, playerId, msg.tileIndex));
    case C2S.UNMORTGAGE:
      return apply(ws, wss, roomId, () => unmortgageProperty(room, playerId, msg.tileIndex));
    case C2S.BANKRUPT:
      return apply(ws, wss, roomId, () => declareBankrupt(room, playerId));
    case C2S.PROPOSE_TRADE: {
      const { type: _t, ...input } = msg;
      void _t;
      return apply(ws, wss, roomId, () => proposeTrade(room, playerId, input));
    }
    case C2S.RESPOND_TRADE:
      return apply(ws, wss, roomId, () => respondTrade(room, playerId, msg.tradeId, msg.action));
    case C2S.TRADE_DRAFT:
      return apply(ws, wss, roomId, () => setTradeDrafting(room, playerId, msg.drafting));
    case C2S.CHAT:
      return apply(ws, wss, roomId, () => sendChat(room, playerId, msg.text));
    case C2S.SANDBOX: {
      if (!room.sandbox) return fail(ws, 'Not a lab room');
      const { type: _ignored, ...cmd } = msg;
      void _ignored;
      if (cmd.op === 'possess') {
        const target = getPlayer(room, cmd.playerId);
        if (!target) return fail(ws, 'No such player');
        session.playerId = target.id;
        return send(ws, { type: S2C.JOINED, playerId: target.id, roomId });
      }
      const result = applySandbox(room, cmd);
      if (result.error) return fail(ws, result.error);
      // reset / remove can drop the seat this socket was wearing
      if (!getPlayer(room, session.playerId) && room.hostId) {
        session.playerId = room.hostId;
        send(ws, { type: S2C.JOINED, playerId: room.hostId, roomId });
      }
      return broadcast(wss, roomId);
    }
    case C2S.LEAVE:
      removePlayer(room, playerId);
      sessions.delete(ws);
      return broadcast(wss, roomId);
    default:
      return fail(ws, 'Unknown message');
  }
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  // must come after prepare(), Next throws otherwise
  const upgradeHandler = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    handle(req, res);
  });

  // noServer + manual routing: attaching ws directly to the http server would
  // swallow every upgrade, including Next's own HMR socket on /_next/hmr.
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      return;
    }
    void upgradeHandler(req, socket, head);
  });

  wss.on('connection', (ws: GameSocket) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (raw) => {
      handleMessage(ws, wss, raw.toString()).catch((err) => {
        console.error('[ws] handler crashed:', err);
        fail(ws, 'Server error');
      });
    });

    ws.on('close', () => {
      const session = sessions.get(ws);
      sessions.delete(ws);
      if (!session?.playerId) return; // watchers leave nothing behind

      const room = getRoom(session.roomId);
      const player = room ? getPlayer(room, session.playerId) : null;
      if (!room || !player) return;

      if (room.phase === 'lobby') {
        removePlayer(room, session.playerId); // nobody is invested yet, free the seat
      } else {
        player.connected = false;             // mid-game: hold the seat for a refresh
        dropFromAuction(room, session.playerId); // never let a dropout stall a live auction
        clearDrafting(room, session.playerId); // their trade-composer socket just died
      }
      broadcast(wss, session.roomId);
    });
  });

  // drop sockets that stopped answering, and reclaim dead rooms
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const ws = client as GameSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
    sweepEmptyRooms();
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  server.listen(port, hostname, () => {
    console.log(`> MonoPoli ready on http://localhost:${port}  (websocket at /ws)`);
  });

  // Don't lose the last few moves of a live game on deploy/restart.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n> ${signal} received, flushing rooms...`);
    clearInterval(heartbeat);
    for (const timer of auctionTimers.values()) clearTimeout(timer);
    auctionTimers.clear();
    for (const client of wss.clients) client.close(1012, 'Server restarting');
    await flushAll();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
});
