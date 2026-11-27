const express = require('express');
const { optionalAuth } = require('../../shared/middleware/auth');
const rateLimit = require('../../shared/middleware/rateLimit');
const { asyncHandler, HttpError } = require('../../shared/http');
const service = require('./engagement.service');

const router = express.Router();

// POST /api/engagement/batch { views: [reelId, ...] } — sent every ~10s by the app.
// Likes stay on POST /api/reels/:id/like for now.
router.post(
  '/batch',
  optionalAuth,
  rateLimit({ name: 'engagement', max: 60 }),
  asyncHandler(async (req, res) => {
    const views = Array.isArray(req.body?.views) ? req.body.views.slice(0, 200) : null;
    if (!views) throw new HttpError(400, 'views must be an array of reel ids');
    res.json({ accepted: await service.recordViews(views.map(String)) });
  })
);

module.exports = router;
