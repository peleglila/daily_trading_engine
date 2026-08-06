import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Binary } from 'mongodb';
import { connectDb, getDb, isDbConnected } from './db.js';
import { allowlistGuard, attachUser, createAuthMiddleware } from './auth.js';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const PORT = Number(process.env.PORT) || 8787;
const MONGODB_URI = process.env.MONGODB_URI;
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;
const ALLOWED_USERS = process.env.ALLOWED_USERS || '';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'peleg-trading-api',
    mongo: isDbConnected(),
  });
});

/** Retry Atlas connect after Network Access / cluster resume (no API restart needed). */
app.post('/api/mongo/reconnect', async (_req, res) => {
  try {
    await connectDb(MONGODB_URI, { force: true });
    res.json({ ok: true, mongo: true });
  } catch (err) {
    console.error('Mongo reconnect failed', err.message || err);
    res.status(503).json({
      ok: false,
      mongo: false,
      error: err.message || 'Mongo reconnect failed',
      hint:
        'In Atlas → Network Access, allow your IP (or 0.0.0.0/0 for testing). Confirm the free cluster is not paused.',
    });
  }
});

/** Public symbol search (Yahoo) — avoids browser CORS / proxy waterfalls. */
app.get('/api/symbols/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 1) return res.json({ hits: [] });
  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}` +
      `&quotesCount=12&newsCount=0&listsCount=0`;
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'peleg-trading-api/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!upstream.ok) return res.status(502).json({ hits: [], error: 'upstream failed' });
    const data = await upstream.json();
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
    const hits = quotes.slice(0, 12).map((row) => {
      const symbol = String(row.symbol || '').toUpperCase();
      const exchange = String(row.exchange || row.exchDisp || '').toUpperCase();
      return {
        symbol,
        fullSymbol: exchange && symbol && !symbol.includes(':') ? `${exchange}:${symbol}` : symbol,
        description: String(row.shortname || row.longname || row.quoteType || symbol),
        exchange,
        type: String(row.quoteType || row.typeDisp || ''),
      };
    }).filter((h) => h.symbol);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ hits });
  } catch (err) {
    console.error('symbol search failed', err);
    res.status(502).json({ hits: [], error: 'search failed' });
  }
});

/** Public last price (Yahoo chart) — same CORS-safe proxy pattern as symbol search. */
app.get('/api/quotes/:symbol', async (req, res) => {
  const symbol = String(req.params.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
      `?interval=1d&range=1d`;
    const upstream = await fetch(url, {
      headers: { 'User-Agent': 'peleg-trading-api/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!upstream.ok) return res.status(502).json({ error: 'upstream failed' });
    const data = await upstream.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice ?? meta?.previousClose);
    if (!(price > 0)) return res.status(404).json({ error: 'no price' });
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ symbol, price, currency: meta?.currency || 'USD', at: new Date().toISOString() });
  } catch (err) {
    console.error('quote failed', err);
    res.status(502).json({ error: 'quote failed' });
  }
});

const checkJwt = createAuthMiddleware({ domain: AUTH0_DOMAIN, audience: AUTH0_AUDIENCE });
const requireUser = [checkJwt, attachUser, allowlistGuard(ALLOWED_USERS)];

app.get('/api/me', ...requireUser, (req, res) => {
  res.json({ sub: req.userSub, email: req.userEmail || null });
});

app.get('/api/days', ...requireUser, async (req, res, next) => {
  try {
    const days = await getDb()
      .collection('days')
      .find({ userSub: req.userSub }, { projection: { snapshotBytes: 0 } })
      .sort({ date: -1 })
      .limit(400)
      .toArray();
    res.json({ days });
  } catch (err) {
    next(err);
  }
});

app.get('/api/days/:date', ...requireUser, async (req, res, next) => {
  try {
    const day = await getDb().collection('days').findOne({
      userSub: req.userSub,
      date: req.params.date,
    });
    if (!day) return res.status(404).json({ error: 'Day not found' });
    res.json({ day });
  } catch (err) {
    next(err);
  }
});

app.put('/api/days/:date', ...requireUser, async (req, res, next) => {
  try {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    }
    const now = new Date().toISOString();
    const payload = {
      userSub: req.userSub,
      date,
      book: req.body.book || {},
      plan: req.body.plan || {},
      metrics: req.body.metrics || {},
      saved: !!req.body.saved,
      updatedAt: now,
    };
    const result = await getDb().collection('days').findOneAndUpdate(
      { userSub: req.userSub, date },
      {
        $set: payload,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: 'after', includeResultMetadata: false }
    );
    res.json({ day: result });
  } catch (err) {
    next(err);
  }
});

app.get('/api/days/:date/snapshots', ...requireUser, async (req, res, next) => {
  try {
    const docs = await getDb()
      .collection('snapshots')
      .find(
        { userSub: req.userSub, dayDate: req.params.date },
        { projection: { data: 0 } }
      )
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ snapshots: docs });
  } catch (err) {
    next(err);
  }
});

app.post('/api/days/:date/snapshots', ...requireUser, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const context = String(req.body.context || 'chart').toUpperCase();
    const doc = {
      userSub: req.userSub,
      dayDate: req.params.date,
      context,
      mime: req.file.mimetype || 'image/png',
      size: req.file.size,
      data: new Binary(req.file.buffer),
      createdAt: new Date().toISOString(),
    };
    const { insertedId } = await getDb().collection('snapshots').insertOne(doc);
    res.status(201).json({
      snapshot: {
        _id: insertedId,
        userSub: doc.userSub,
        dayDate: doc.dayDate,
        context: doc.context,
        mime: doc.mime,
        size: doc.size,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/snapshots/:id', ...requireUser, async (req, res, next) => {
  try {
    const { ObjectId } = await import('mongodb');
    let id;
    try {
      id = new ObjectId(req.params.id);
    } catch {
      return res.status(400).json({ error: 'invalid id' });
    }
    const doc = await getDb().collection('snapshots').findOne({
      _id: id,
      userSub: req.userSub,
    });
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.setHeader('Content-Type', doc.mime || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(Buffer.from(doc.data.buffer));
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

async function main() {
  try {
    await connectDb(MONGODB_URI);
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB unavailable — starting API without day persistence.', err.message || err);
  }

  await new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`peleg-trading-api listening on :${PORT} (mongo=${isDbConnected()})`);
      resolve(server);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `Port ${PORT} already in use. Stop the other API process, then restart:\n` +
            `  netstat -ano | findstr :${PORT}\n` +
            `  taskkill /PID <pid> /F`
        );
      }
      reject(err);
    });
  });
}

main().catch((err) => {
  console.error('Failed to start API', err.message || err);
  process.exit(1);
});
