/**
 * Redis (HLD L3 cache, counters, seat holds, rate limits, BullMQ).
 *
 * Without REDIS_URL, `cache` falls back to an in-process Map with TTLs so
 * single-server dev behaves the same. The fallback is NOT shared across
 * instances — set REDIS_URL before running more than one server.
 */
const env = require('../config/env');
const logger = require('./logger');

let client = null;

function getRedis() {
  if (!env.features.redis) return null;
  if (!client) {
    const Redis = require('ioredis');
    client = new Redis(env.redis.url, { maxRetriesPerRequest: 3, lazyConnect: false });
    client.on('error', (err) => logger.warn('redis error', { err: err.message }));
  }
  return client;
}

/** BullMQ needs its own connections with maxRetriesPerRequest: null. */
function newBullConnection() {
  if (!env.features.redis) return null;
  const Redis = require('ioredis');
  return new Redis(env.redis.url, { maxRetriesPerRequest: null });
}

// ── In-memory fallback ────────────────────────────────────────
const mem = new Map(); // key -> { v, exp }
const memGet = (k) => {
  const e = mem.get(k);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) {
    mem.delete(k);
    return null;
  }
  return e.v;
};

const jitter = (ttl) => Math.round(ttl * (0.9 + Math.random() * 0.2));

/** Small key/value API used by modules; works with or without Redis. */
const cache = {
  async get(key) {
    const r = getRedis();
    const raw = r ? await r.get(key) : memGet(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  },
  async set(key, value, ttlSec) {
    const raw = JSON.stringify(value);
    const ttl = ttlSec ? jitter(ttlSec) : 0;
    const r = getRedis();
    if (r) return ttl ? r.set(key, raw, 'EX', ttl) : r.set(key, raw);
    mem.set(key, { v: raw, exp: ttl ? Date.now() + ttl * 1000 : 0 });
  },
  async del(...keys) {
    const r = getRedis();
    if (r) return r.del(...keys);
    keys.forEach((k) => mem.delete(k));
  },
  /** SET NX EX — the HLD seat-hold / lock primitive. Returns true if acquired. */
  async setNx(key, value, ttlSec) {
    const r = getRedis();
    if (r) return (await r.set(key, JSON.stringify(value), 'EX', ttlSec, 'NX')) === 'OK';
    if (memGet(key) != null) return false;
    mem.set(key, { v: JSON.stringify(value), exp: Date.now() + ttlSec * 1000 });
    return true;
  },
  async incr(key, by = 1, ttlSec) {
    const r = getRedis();
    if (r) {
      const n = await r.incrby(key, by);
      if (ttlSec && n === by) await r.expire(key, ttlSec);
      return n;
    }
    const n = (Number(memGet(key)) || 0) + by;
    const prev = mem.get(key);
    mem.set(key, { v: String(n), exp: prev?.exp || (ttlSec ? Date.now() + ttlSec * 1000 : 0) });
    return n;
  },
  /** Read-and-reset a counter (used by the counter-flush worker). */
  async getDel(key) {
    const r = getRedis();
    if (r) return Number(await r.getdel(key)) || 0;
    const v = Number(memGet(key)) || 0;
    mem.delete(key);
    return v;
  },
  async keys(pattern) {
    const r = getRedis();
    if (r) {
      const out = [];
      let cursor = '0';
      do {
        const [next, batch] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        out.push(...batch);
      } while (cursor !== '0');
      return out;
    }
    const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return [...mem.keys()].filter((k) => re.test(k) && memGet(k) != null);
  },
};

/** Cache-aside helper: read, else compute + store. */
async function remember(key, ttlSec, compute) {
  const hit = await cache.get(key);
  if (hit != null) return hit;
  const value = await compute();
  if (value != null) await cache.set(key, value, ttlSec);
  return value;
}

async function health() {
  if (!env.features.redis) return 'disabled (in-memory fallback)';
  return (await getRedis().ping()) === 'PONG' ? 'ok' : 'error';
}

async function close() {
  if (client) await client.quit();
  client = null;
}

module.exports = { getRedis, newBullConnection, cache, remember, health, close, enabled: () => env.features.redis };
