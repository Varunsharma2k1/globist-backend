/**
 * Reels & media (HLD flow B): presigned direct upload -> reel PROCESSING ->
 * transcode worker -> READY.
 *
 *   1. POST /api/media/upload-url { contentType }      -> { uploadUrl, key, headers }
 *   2. PUT  <uploadUrl> (raw bytes, straight to R2; local disk in dev)
 *   3. POST /api/media/reels { key, caption, ... }     -> reel { status: 'processing' }
 *   4. worker transcodes; reel becomes 'ready' with hlsUrl/mediaUrl
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const env = require('../../config/env');
const { auth } = require('../../shared/middleware/auth');
const rateLimit = require('../../shared/middleware/rateLimit');
const { asyncHandler, HttpError } = require('../../shared/http');
const storage = require('../../infra/storage');
const { enqueue, QUEUES } = require('../../infra/queue');
const Reel = require('../reels/reel.model');
const { resolveAffiliation } = require('../reels/reels.service');
const places = require('../places/places.service');

const router = express.Router();
const ALLOWED = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX_BYTES = 200 * 1024 * 1024;

router.post('/upload-url', auth, rateLimit({ name: 'upload', max: 30 }), asyncHandler(async (req, res) => {
  const contentType = req.body?.contentType;
  const ext = ALLOWED[contentType];
  if (!ext) throw new HttpError(400, `contentType must be one of ${Object.keys(ALLOWED).join(', ')}`);
  const key = `reels/${req.user._id}/${crypto.randomBytes(12).toString('hex')}.${ext}`;
  res.json(await storage.createUploadUrl({ key, contentType, bucket: 'raw' }));
}));

// POST /api/media/avatar-upload-url { contentType, size } -> presigned PUT to
// the PUBLIC media bucket + the URL to save on the profile.
const AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
router.post('/avatar-upload-url', auth, rateLimit({ name: 'avatar-upload', max: 10 }), asyncHandler(async (req, res) => {
  const { contentType } = req.body || {};
  const size = Number(req.body?.size);
  const ext = AVATAR_TYPES[contentType];
  if (!ext) throw new HttpError(400, 'Photo must be JPEG, PNG or WebP');
  if (!Number.isInteger(size) || size <= 0) throw new HttpError(400, 'size (bytes) is required');
  if (size > AVATAR_MAX_BYTES) throw new HttpError(413, 'Photo is too large (max 5 MB)');
  const key = `avatars/${req.user._id}/${crypto.randomBytes(12).toString('hex')}.${ext}`;
  const target = await storage.createUploadUrl({
    key,
    contentType,
    bucket: 'media',
    contentLength: size,
    cacheControl: 'public, max-age=31536000, immutable',
  });
  res.json({ ...target, publicUrl: storage.publicUrl(key) });
}));

// Dev-only stand-in for the R2 presigned PUT (disabled once R2 is configured).
router.put('/local-upload/:bucket/*', asyncHandler(async (req, res) => {
  if (env.features.storage || env.isProd) throw new HttpError(404, 'Not found');
  const key = decodeURIComponent(req.params[0]);
  if (!/^(reels|avatars)\/[a-f0-9]{24}\/[a-f0-9]{24}\.\w+$/.test(key)) throw new HttpError(400, 'Bad key');
  if (Number(req.headers['content-length'] || 0) > MAX_BYTES) throw new HttpError(413, 'File too large');
  const file = storage.localPath(req.params.bucket, key);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await pipeline(req, fs.createWriteStream(file));
  res.status(200).json({ key });
}));

router.post('/reels', auth, asyncHandler(async (req, res) => {
  // agencyId / isAffiliate from the client are ignored: tagging comes only from a verified booking.
  const { key, caption, tags, location, bookingId, imageType, musicTitle } = req.body || {};
  if (!key || !key.startsWith(`reels/${req.user._id}/`)) throw new HttpError(400, 'Invalid upload key');
  if (!(await storage.exists({ key, bucket: 'raw' }))) throw new HttpError(400, 'Upload not found — PUT the file first');
  const affiliation = await resolveAffiliation(req.user, bookingId);

  const reel = await Reel.create({
    user: req.user._id,
    ...affiliation,
    caption: typeof caption === 'string' ? caption.slice(0, 2200) : '',
    tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string').slice(0, 30) : [],
    location: typeof location === 'string' ? location.slice(0, 200) : '',
    imageType: imageType || 'mountain',
    musicTitle: musicTitle || '',
    creatorHandle: `@${req.user.name.toLowerCase().replace(/\s+/g, '_')}`,
    creatorTier: req.user.explorerTier || 'bronze',
    status: 'processing',
    rawKey: key,
  });
  places.warm(reel.location); // map pin for this location (background)
  await enqueue(QUEUES.TRANSCODE, 'transcode', { reelId: String(reel._id), key });
  res.status(201).json(reel);
}));

// GET /api/media/reels/:id/status — app polls until 'ready'
router.get('/reels/:id/status', auth, asyncHandler(async (req, res) => {
  const reel = await Reel.findOne({ _id: req.params.id, user: req.user._id }).select('status mediaUrl hlsUrl thumbnailUrl');
  if (!reel) throw new HttpError(404, 'Reel not found');
  res.json(reel);
}));

module.exports = router;
