const express = require('express');
const { asyncHandler, HttpError } = require('../../shared/http');
const rateLimit = require('../../shared/middleware/rateLimit');
const { remember } = require('../../infra/redis');
const maps = require('../../integrations/maps');

const router = express.Router();

// GET /api/search/places?q=manali — Google Places autocomplete (India), cached 1 day
router.get(
  '/places',
  rateLimit({ name: 'places', max: 60 }),
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) throw new HttpError(400, 'q must be at least 2 characters');
    const data = await remember(`places:${q.toLowerCase()}`, 86400, () => maps.autocomplete(q));
    res.json({
      predictions: (data.predictions || []).map((p) => ({ placeId: p.place_id, description: p.description })),
    });
  })
);

module.exports = router;
