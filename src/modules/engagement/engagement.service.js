/**
 * Engagement counters (HLD: INCR in Redis, flushed to the DB each minute).
 * Views are batched by the app every ~10s and never hit Mongo per view.
 */
const mongoose = require('mongoose');
const Reel = require('../reels/reel.model');
const { cache } = require('../../infra/redis');

const viewKey = (reelId) => `cnt:views:${reelId}`;

async function recordViews(reelIds) {
  const counts = {};
  for (const id of reelIds) if (mongoose.isValidObjectId(id)) counts[id] = (counts[id] || 0) + 1;
  await Promise.all(Object.entries(counts).map(([id, n]) => cache.incr(viewKey(id), n)));
  return Object.keys(counts).length;
}

/** Counter-flush job: move buffered counts into the reel documents. */
async function flushCounters() {
  const keys = await cache.keys('cnt:views:*');
  const ops = [];
  for (const key of keys) {
    const n = await cache.getDel(key);
    if (n > 0) ops.push({ updateOne: { filter: { _id: key.split(':')[2] }, update: { $inc: { views: n } } } });
  }
  if (ops.length) await Reel.bulkWrite(ops, { ordered: false });
  return ops.length;
}

module.exports = { recordViews, flushCounters };
