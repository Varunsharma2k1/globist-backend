const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const Reel = require('./reel.model');
const { resolveAffiliation, agencyReels, tapeStats, userReels } = require('./reels.service');
const places = require('../places/places.service');
const engagement = require('./engagement.service');
const rateLimit = require('../../shared/middleware/rateLimit');
const { asyncHandler } = require('../../shared/http');
const limitEngage = rateLimit({ name: 'reel-like', max: 120 });
const limitComment = rateLimit({ name: 'reel-comment', max: 10 });
const { auth, optionalAuth } = require('../../shared/middleware/auth');

// Stores uploaded reel media (video/photo) under /uploads/reels, served
// statically by index.js. Filenames are randomized to avoid collisions.
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', '..', '..', 'uploads', 'reels'),
    filename: (req, file, cb) => {
      const unique = crypto.randomBytes(12).toString('hex');
      cb(null, `${unique}${path.extname(file.originalname) || ''}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    const isMedia = /^(video|image)\//.test(file.mimetype);
    cb(isMedia ? null : new Error('Only video or image files are allowed'), isMedia);
  },
});

// POST /api/reels/upload — Upload a reel's video/photo file, returns its URL
router.post('/upload', auth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    res.status(201).json({ url: `/uploads/reels/${req.file.filename}` });
  } catch (error) {
    next(error);
  }
});

// GET /api/reels/mine — the signed-in user's own tapes (incl. still processing)
router.get('/mine', auth, async (req, res, next) => {
  try {
    const reels = await Reel.find({ user: req.user._id })
      .populate('user', 'name explorerTier avatar')
      .populate('agency', 'name location isVerified')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(reels);
  } catch (error) {
    next(error);
  }
});

// GET /api/reels/user/:userId — someone's public tapes (their profile grid)
router.get('/user/:userId', async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/.test(req.params.userId)) return res.json([]);
    res.json(await userReels(req.params.userId));
  } catch (error) {
    next(error);
  }
});

// GET /api/reels/liked-ids — tapes I liked (fills the hearts)
router.get(
  '/liked-ids',
  auth,
  asyncHandler(async (req, res) => {
    res.json(await engagement.likedIds(req.user._id));
  })
);

// GET /api/reels/stats — { tapes, spots } for the Home live-map card
router.get('/stats', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=60');
    res.json(await tapeStats());
  } catch (error) {
    next(error);
  }
});

// GET /api/reels — Cursor-based feed (scalable infinite scroll)
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { cursor, limit = 5, agency } = req.query;
    const filter = {};
    if (agency) filter.agency = agency;

    // Cursor is a createdAt timestamp — fetch reels older than cursor
    if (cursor) {
      filter.createdAt = { $lt: new Date(cursor) };
    }

    const reels = await Reel.find(filter)
      .populate('user', 'name explorerTier stats avatar')
      .populate('agency', 'name location startingPrice rating imageType')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) + 1); // Fetch one extra to determine if there's a next page

    const hasMore = reels.length > parseInt(limit);
    const results = hasMore ? reels.slice(0, -1) : reels;
    const nextCursor = results.length > 0 ? results[results.length - 1].createdAt.toISOString() : null;

    res.json({
      reels: results,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reels/trending — Get trending reels
router.get('/trending', async (req, res, next) => {
  try {
    const reels = await Reel.find()
      .populate('user', 'name explorerTier avatar')
      .populate('agency', 'name location startingPrice rating imageType')
      .sort({ likes: -1 })
      .limit(6);
    res.json(reels);
  } catch (error) {
    next(error);
  }
});

// POST /api/reels — Post a new reel
router.post('/', auth, async (req, res, next) => {
  try {
    // agencyId / isAffiliate from the client are ignored: tagging comes only from a verified booking.
    const { caption, tags, location, bookingId, imageType, musicTitle, mediaUrl } = req.body || {};

    const postingUser = req.user; // posting requires sign-in
    const affiliation = await resolveAffiliation(postingUser, bookingId);

    const reel = new Reel({
      user: postingUser._id,
      ...affiliation,
      caption: typeof caption === 'string' ? caption.slice(0, 2200) : '',
      tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string').slice(0, 30) : [],
      location: typeof location === 'string' ? location.slice(0, 200) : '',
      imageType: imageType || 'mountain',
      mediaUrl: mediaUrl || '',
      musicTitle: musicTitle || '',
      creatorHandle: `@${postingUser.name.toLowerCase().replace(/\s+/g, '_')}`,
      creatorTier: postingUser.explorerTier || 'bronze',
      likes: 0,
      comments: 0,
      shares: 0,
    });

    await reel.save();
    places.warm(reel.location); // map pin for this location (background)

    const populatedReel = await Reel.findById(reel._id)
      .populate('user', 'name explorerTier avatar')
      .populate('agency', 'name location startingPrice rating imageType');

    res.status(201).json(populatedReel);
  } catch (error) {
    next(error);
  }
});

// Likes: PUT to like, DELETE to unlike (both safe to repeat).
router.put(
  '/:id/like',
  auth,
  limitEngage,
  asyncHandler(async (req, res) => {
    res.json(await engagement.like(req.user, req.params.id));
  })
);
router.delete(
  '/:id/like',
  auth,
  limitEngage,
  asyncHandler(async (req, res) => {
    res.json(await engagement.unlike(req.user, req.params.id));
  })
);

// Comments
router.get(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    res.json(await engagement.listComments(req.params.id, req.query));
  })
);
router.post(
  '/:id/comments',
  auth,
  limitComment,
  asyncHandler(async (req, res) => {
    res.status(201).json(await engagement.addComment(req.user, req.params.id, req.body?.text));
  })
);
router.delete(
  '/comments/:commentId',
  auth,
  asyncHandler(async (req, res) => {
    await engagement.deleteComment(req.user, req.params.commentId);
    res.json({ message: 'Deleted' });
  })
);

// GET /api/reels/agency/:agencyId — Reels for a specific agency
router.get('/agency/:agencyId', async (req, res, next) => {
  try {
    if (!/^[a-f0-9]{24}$/.test(req.params.agencyId)) return res.json([]);
    res.json(await agencyReels(req.params.agencyId));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
