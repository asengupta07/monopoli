import { createRoom } from './gameEngine';
import { isSandboxRoomId } from './protocol';
import { emptyStats } from './stats';
import { isMongoConfigured, roomsCollection, type RoomDoc } from './mongo';
import type { Room } from '@/types/game';

/**
 * Rooms live in memory while they are being played — a Mongo round-trip per
 * dice roll would be pointless latency — and MongoDB is the durable store
 * behind that cache, so a restart or crash does not lose a game in progress.
 *
 * Writes are debounced: a burst of actions collapses into one upsert.
 */
const rooms = new Map<string, Room>();

const EMPTY_ROOM_TTL = 1000 * 60 * 10; // forget idle rooms locally after 10 min
const PERSIST_DEBOUNCE = 400;

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

function toDoc(room: Room): RoomDoc {
  const { id, ...rest } = room;
  return { ...rest, _id: id, updatedAt: new Date() };
}

function fromDoc(doc: RoomDoc): Room {
  const { _id, updatedAt, ...rest } = doc;
  void updatedAt; // TTL bookkeeping only, not part of room state
  // Sockets are gone after a restart; nobody is connected until they rejoin.
  const players = rest.players.map((p) => ({ ...p, connected: false }));
  // rooms stored before chat/trades existed come back without them; "drafting a
  // trade" and an in-flight vote-kick are both live, socket-tied state, so a
  // restart always clears them rather than resuming a clock against a player
  // set that may no longer match
  return {
    ...rest, players,
    chat: rest.chat ?? [], log: rest.log ?? [], trades: rest.trades ?? [],
    composing: [], voteKick: null,
    stats: rest.stats ?? emptyStats(), id: _id,
  };
}

/** Queue a durable write. Safe to call on every mutation. */
export function persistRoom(room: Room): void {
  if (room.sandbox) return; // the lab is throwaway and must not land in Mongo
  if (!isMongoConfigured()) return;

  const existing = pendingWrites.get(room.id);
  if (existing) clearTimeout(existing);

  pendingWrites.set(
    room.id,
    setTimeout(() => {
      pendingWrites.delete(room.id);
      void flushRoom(room.id);
    }, PERSIST_DEBOUNCE),
  );
}

async function flushRoom(roomId: string): Promise<void> {
  const room = rooms.get(roomId);
  if (!room) return;
  try {
    const collection = await roomsCollection();
    await collection.replaceOne({ _id: roomId }, toDoc(room), { upsert: true });
  } catch (err) {
    // A dead database must not take the live game down with it.
    console.error(`[store] failed to persist room ${roomId}:`, err);
  }
}

/** Write every queued room immediately — used on shutdown. */
export async function flushAll(): Promise<void> {
  for (const timer of pendingWrites.values()) clearTimeout(timer);
  const ids = [...pendingWrites.keys()];
  pendingWrites.clear();
  await Promise.all(ids.map((id) => flushRoom(id)));
}

export function getRoom(id: string): Room | null {
  return rooms.get(id) ?? null;
}

/**
 * Rooms are created on demand so a shared /room/<code> link always works,
 * and rehydrated from Mongo when the process has restarted since.
 */
export async function getOrCreateRoom(id: string, opts?: { sandbox?: boolean }): Promise<Room> {
  const cached = rooms.get(id);
  if (cached) return cached;

  const sandbox = Boolean(opts?.sandbox) || isSandboxRoomId(id);

  // Lab rooms stay in memory only. Loading one from Mongo would restore a
  // leftover cheat state into what should be a fresh table.
  if (!sandbox && isMongoConfigured()) {
    try {
      const collection = await roomsCollection();
      const doc = await collection.findOne({ _id: id });
      if (doc) {
        const restored = fromDoc(doc);
        rooms.set(id, restored);
        return restored;
      }
    } catch (err) {
      console.error(`[store] failed to load room ${id}, starting fresh:`, err);
    }
  }

  const room = createRoom(new Set(rooms.keys()), id);
  if (sandbox) room.sandbox = true;
  rooms.set(id, room);
  persistRoom(room);
  return room;
}

export async function deleteRoom(id: string): Promise<void> {
  rooms.delete(id);
  const timer = pendingWrites.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingWrites.delete(id);
  }
  if (!isMongoConfigured()) return;
  try {
    const collection = await roomsCollection();
    await collection.deleteOne({ _id: id });
  } catch (err) {
    console.error(`[store] failed to delete room ${id}:`, err);
  }
}

export function listRooms(): Room[] {
  return [...rooms.values()];
}

/**
 * Drop idle rooms from memory. They stay in Mongo until its TTL expires them,
 * so a player returning to the link still finds their game.
 */
export function sweepEmptyRooms(): void {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.players.some((p) => p.connected && !p.dummy)) {
      room.emptySince = null;
      continue;
    }
    if (!room.emptySince) {
      room.emptySince = now;
    } else if (now - room.emptySince > EMPTY_ROOM_TTL) {
      void flushRoom(id).then(() => rooms.delete(id));
    }
  }
}
