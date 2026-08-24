import { MongoClient, type Collection, type Db } from 'mongodb';
import type { Room } from '@/types/game';

/** Persisted shape: the room itself, keyed by its code, plus a TTL stamp. */
export interface RoomDoc extends Omit<Room, 'id'> {
  _id: string;
  updatedAt: Date;
}

// Read lazily: ESM hoists imports above the server's loadEnvConfig() call, so
// reading these at module scope would capture the environment too early.
const getUri = () => process.env.MONGODB_URI;
const getDbName = () => process.env.MONGODB_DB ?? 'monopoli';

/** Rooms nobody has touched for a day are dropped by the TTL index. */
const ROOM_TTL_SECONDS = 60 * 60 * 24;

// tsx watch re-imports this module on every restart, so cache on globalThis
// to avoid opening a new pool each time.
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
  _mongoIndexesReady?: Promise<void>;
};

export function isMongoConfigured(): boolean {
  return Boolean(getUri());
}

function clientPromise(): Promise<MongoClient> {
  const uri = getUri();
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (!globalForMongo._mongoClientPromise) {
    globalForMongo._mongoClientPromise = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
    }).connect();
  }
  return globalForMongo._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(getDbName());
}

export async function roomsCollection(): Promise<Collection<RoomDoc>> {
  const db = await getDb();
  const collection = db.collection<RoomDoc>('rooms');

  if (!globalForMongo._mongoIndexesReady) {
    globalForMongo._mongoIndexesReady = collection
      .createIndex({ updatedAt: 1 }, { expireAfterSeconds: ROOM_TTL_SECONDS })
      .then(() => undefined)
      .catch((err) => {
        console.error('[mongo] failed to create TTL index:', err);
      });
  }
  await globalForMongo._mongoIndexesReady;

  return collection;
}
