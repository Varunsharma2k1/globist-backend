const express = require('express');
const { auth } = require('../../shared/middleware/auth');
const { asyncHandler, HttpError } = require('../../shared/http');
const service = require('./notifications.service');

const router = express.Router();
router.use(auth);

// POST /api/notifications/devices { token, platform } — register FCM token
router.post('/devices', asyncHandler(async (req, res) => {
  const { token, platform } = req.body || {};
  if (!token || typeof token !== 'string') throw new HttpError(400, 'token is required');
  if (platform && !['android', 'ios', 'web'].includes(platform)) throw new HttpError(400, 'invalid platform');
  await service.registerDevice(req.user._id, { token, platform });
  res.status(204).end();
}));

// DELETE /api/notifications/devices/:token — on logout
router.delete('/devices/:token', asyncHandler(async (req, res) => {
  await service.unregisterDevice(req.user._id, req.params.token);
  res.status(204).end();
}));

module.exports = router;
