const express = require('express');
const { auth } = require('../../shared/middleware/auth');
const rateLimit = require('../../shared/middleware/rateLimit');
const { asyncHandler } = require('../../shared/http');
const reviews = require('./reviews.service');

const router = express.Router();
// Anti-spam: per user, a handful of reviews per minute.
const limitPost = rateLimit({ name: 'review-post', max: 5 });

// GET /api/reviews/agency/:agencyId?before=<iso>&limit=20 -> { reviews, total, hasMore }
router.get(
  '/agency/:agencyId',
  asyncHandler(async (req, res) => {
    res.json(await reviews.listForAgency(req.params.agencyId, req.query));
  })
);

// POST /api/reviews/agency/:agencyId { text } -> review
router.post(
  '/agency/:agencyId',
  auth,
  limitPost,
  asyncHandler(async (req, res) => {
    res.status(201).json(await reviews.create(req.user, req.params.agencyId, req.body?.text));
  })
);

// DELETE /api/reviews/:id — your own review
router.delete(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    await reviews.remove(req.user, req.params.id);
    res.json({ message: 'Deleted' });
  })
);

module.exports = router;
