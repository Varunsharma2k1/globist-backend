/**
 * Live map pins from real tapes.
 *
 *   livePlaces()  -> [{ id, name, state, lat, lng, count }]
 *     count = playable tapes tagged with that location (MongoDB, cached 30 s).
 *     Only locations that have tapes AND a known position are returned, so a
 *     place with 0 tapes never shows on the map.
 *
 *   warm(location) -> called when a tape is posted: resolves the location's
 *     position in the background (once ever per distinct location).
 *
 * Position lookup order — the network is the LAST resort, used once per place:
 *   1. in-memory set of already-resolved locations (no DB, no network)
 *   2. `places` collection: this exact text was seen before
 *   3. built-in gazetteer (Manali, Shimla, … instant)
 *   4. a known place with the same name before the comma
 *      ("Orchha" known -> "Orchha, Madhya Pradesh" reuses it)
 *   5. geocoder (Google if configured, else OpenStreetMap) — first time only
 * So 1000 tapes tagged "Manali" cost zero external calls. Failed lookups are
 * retried after a while, not on every request.
 */
const logger = require('../../infra/logger');
const { cache, remember } = require('../../infra/redis');
const geocoder = require('../../integrations/geocoder'); // module object: tests can stub it
const reels = require('../reels/reels.service');
const Place = require('./place.model');
const GAZETTEER = require('./gazetteer.json');

const LIVE_KEY = 'places:live:v1';
const LIVE_TTL_SEC = 30;
const RETRY_NOT_FOUND_MS = 7 * 24 * 3600 * 1000;
const RETRY_ERROR_MS = 60 * 60 * 1000;

// Map state codes (match the app's indiaMap.json ids) + common spellings.
const STATE_NAMES = {
  AN: ['Andaman & Nicobar', 'Andaman and Nicobar Islands'], AP: ['Andhra Pradesh'], AR: ['Arunachal Pradesh'],
  AS: ['Assam'], BR: ['Bihar'], CG: ['Chhattisgarh'], CH: ['Chandigarh'],
  DH: ['Dadra and Nagar Haveli and Daman and Diu', 'Dadra and Nagar Haveli', 'Daman and Diu'],
  DL: ['Delhi', 'National Capital Territory of Delhi'], GA: ['Goa'], GJ: ['Gujarat'], HP: ['Himachal Pradesh'],
  HR: ['Haryana'], JH: ['Jharkhand'], JK: ['Jammu & Kashmir', 'Jammu and Kashmir'], KA: ['Karnataka'],
  KL: ['Kerala'], LA: ['Ladakh'], LD: ['Lakshadweep'], MH: ['Maharashtra'], ML: ['Meghalaya'], MN: ['Manipur'],
  MP: ['Madhya Pradesh'], MZ: ['Mizoram'], NL: ['Nagaland'], OD: ['Odisha', 'Orissa'], PB: ['Punjab'],
  PY: ['Puducherry', 'Pondicherry'], RJ: ['Rajasthan'], SK: ['Sikkim'], TN: ['Tamil Nadu'], TR: ['Tripura'],
  TS: ['Telangana'], UK: ['Uttarakhand', 'Uttaranchal'], UP: ['Uttar Pradesh'], WB: ['West Bengal'],
};
const letters = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
const STATE_CODE = new Map(
  Object.entries(STATE_NAMES).flatMap(([code, names]) => names.map((n) => [letters(n), code]))
);
const stateCode = (name) => STATE_CODE.get(letters(name)) || null;

/** Same normalization MongoDB uses when grouping ($toLower + $trim). */
const keyOf = (location) => String(location || '').trim().toLowerCase();
const slug = (s) => s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'place';

const GAZ_BY_NAME = new Map();
for (const g of GAZETTEER) {
  GAZ_BY_NAME.set(letters(g.name), g);
  GAZ_BY_NAME.set(letters(g.id), g);
  GAZ_BY_NAME.set(letters(g.name.replace(/\(.*?\)/g, '')), g); // "Spiti (Kaza)" -> "spiti"
}
/** "Manali, Himachal Pradesh" -> gazetteer Manali (first part before a comma). */
function matchGazetteer(location) {
  const parts = String(location).split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts.slice(0, 2)) {
    const hit = GAZ_BY_NAME.get(letters(part));
    if (hit) return hit;
  }
  return null;
}

const headOf = (location) => letters(String(location).split(',')[0]);

async function lookup(location) {
  const gz = matchGazetteer(location);
  if (gz) return { lat: gz.lat, lng: gz.lng, state: gz.state, pinId: gz.id, source: 'gazetteer', status: 'ok' };
  // Same place already resolved under another spelling? Reuse it (no network).
  const head = headOf(location);
  if (head) {
    const twin = await Place.findOne({ head, status: 'ok' }).lean();
    if (twin) {
      return { lat: twin.lat, lng: twin.lng, state: twin.state, pinId: twin.pinId, source: 'alias', status: 'ok' };
    }
  }
  try {
    const hit = await geocoder.geocodePlace(location);
    const state = hit && stateCode(hit.stateName);
    if (!hit || !state) return { status: 'not_found' };
    return { lat: hit.lat, lng: hit.lng, state, source: hit.source, status: 'ok' };
  } catch (err) {
    logger.warn('[places] geocode failed', { location, err: err.message });
    return { status: 'error' };
  }
}

// One lookup at a time (respects the geocoder's rate limit), de-duplicated.
let queue = Promise.resolve();
const inflight = new Map();
// Locations already resolved in this process: repeat tapes skip even the DB.
const KNOWN_MAX = 5000;
const known = new Set();
const remember_ = (key) => {
  if (known.size >= KNOWN_MAX) known.clear();
  known.add(key);
};

function resolve(location) {
  const key = keyOf(location);
  if (!key) return Promise.resolve(null);
  if (known.has(key)) return Promise.resolve({ key, status: 'ok', cached: true });
  if (inflight.has(key)) return inflight.get(key);
  const job = (queue = queue.then(async () => {
    const existing = await Place.findOne({ key }).lean();
    const age = existing ? Date.now() - new Date(existing.checkedAt).getTime() : Infinity;
    if (existing?.status === 'ok') remember_(key);
    if (existing && (existing.status === 'ok' ||
        (existing.status === 'not_found' && age < RETRY_NOT_FOUND_MS) ||
        (existing.status === 'error' && age < RETRY_ERROR_MS))) {
      return existing;
    }
    const found = await lookup(String(location).trim());
    const doc = await Place.findOneAndUpdate(
      { key },
      {
        $set: {
          name: String(location).trim().slice(0, 120),
          head: headOf(location),
          checkedAt: new Date(),
          pinId: found.pinId || slug(headOf(location) || key),
          ...found,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    if (doc.status === 'ok') {
      remember_(key);
      await cache.del(LIVE_KEY); // new pin: show it on the next map load
    }
    return doc;
  }).catch((err) => {
    logger.warn('[places] resolve failed', { location, err: err.message });
    return null;
  }).finally(() => inflight.delete(key)));
  inflight.set(key, job);
  return job;
}

/** Fire-and-forget: call after a tape is posted. */
function warm(location) {
  if (keyOf(location)) resolve(location);
}

function livePlaces() {
  return remember(LIVE_KEY, LIVE_TTL_SEC, async () => {
    const groups = await reels.countByLocation(); // [{ key, name, count }]
    if (!groups.length) return [];
    const rows = await Place.find({ key: { $in: groups.map((g) => g.key) } }).lean();
    const byKey = new Map(rows.map((p) => [p.key, p]));

    // Backfill: locations never looked up get resolved in the background.
    groups.filter((g) => !byKey.has(g.key)).forEach((g) => warm(g.name));

    // "Manali" and "Manali, HP" are the same pin: merge by pinId.
    const pins = new Map();
    for (const g of groups) {
      const p = byKey.get(g.key);
      if (!p || p.status !== 'ok') continue;
      const id = p.pinId || slug(p.head || g.key);
      const pin = pins.get(id) || { id, name: p.name.split(',')[0].trim(), state: p.state, lat: p.lat, lng: p.lng, count: 0 };
      pin.count += g.count;
      pins.set(id, pin);
    }
    return [...pins.values()].sort((a, b) => b.count - a.count);
  });
}

module.exports = { livePlaces, warm, resolve, _internal: { matchGazetteer, stateCode, keyOf } };
