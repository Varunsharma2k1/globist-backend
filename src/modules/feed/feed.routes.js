/**
 * Feed (HLD flow A). Cache-aside over Redis: pages are cached briefly and
 * rebuilt from the DB on a miss. Personalised feeds (feed:{userId} sorted
 * sets filled by the fan-out worker) slot in behind the same endpoint.
 */
const express = require('express');
const Reel = require('../reels/reel.model');
const { optionalAuth } = require('../../shared/middleware/auth');
const { asyncHandler } = require('../../shared/http');
const { remember } = require('../../infra/redis');

const router = express.Router();
const PAGE_TTL = 60;

// GET /api/feed?cursor=<iso>&limit=10 — same shape as GET /api/reels
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
    const cursor = req.query.cursor && !Number.isNaN(Date.parse(req.query.cursor)) ? req.query.cursor : null;

    const page = await remember(`feed:global:${cursor || 'head'}:${limit}`, PAGE_TTL, async () => {
      const filter = { status: { $ne: 'processing' } };
      if (cursor) filter.createdAt = { $lt: new Date(cursor) };
      const reels = await Reel.find(filter)
        .select('-likedBy')
        .populate('user', 'name explorerTier stats avatar')
        .populate('agency', 'name location startingPrice rating imageType')
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .lean();
      const hasMore = reels.length > limit;
      const items = hasMore ? reels.slice(0, limit) : reels;
      return {
        reels: items,
        nextCursor: items.length ? new Date(items[items.length - 1].createdAt).toISOString() : null,
        hasMore,
      };
    });
    res.json(page);
  })
);

module.exports = router;
