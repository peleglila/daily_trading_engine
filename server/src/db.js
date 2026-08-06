import { MongoClient } from 'mongodb';

let client;
let db;

export async function connectDb(uri, { force = false } = {}) {
  if (db && !force) return db;
  if (!uri) throw new Error('MONGODB_URI is required');
  if (client) {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    client = null;
    db = null;
  }
  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 20000,
    connectTimeoutMS: 20000,
    family: 4, // prefer IPv4 — avoids some Atlas TLS flakes
  });
  await client.connect();
  db = client.db();
  await db.collection('days').createIndex({ userSub: 1, date: 1 }, { unique: true });
  await db.collection('snapshots').createIndex({ userSub: 1, dayDate: 1, context: 1 });
  return db;
}

export function getDb() {
  if (!db) {
    const err = new Error('Database not connected — Atlas unreachable. Quotes still work; day saves need Mongo.');
    err.status = 503;
    throw err;
  }
  return db;
}

export function isDbConnected() {
  return Boolean(db);
}
