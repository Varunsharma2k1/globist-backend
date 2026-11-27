const express = require('express');
const { asyncHandler } = require('../../shared/http');
const places = require('./places.service');

const router = express.Router();

// GET /api/places -> live map pins: [{ id, name, state, lat, lng, count }]
router.get('/', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  res.json(await places.livePlaces());
}));

module.exports = router;
