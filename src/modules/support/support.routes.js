const express = require('express');
const { optionalAuth } = require('../../shared/middleware/auth');
const rateLimit = require('../../shared/middleware/rateLimit');
const { asyncHandler, HttpError } = require('../../shared/http');
const Report = require('./report.model');

const router = express.Router();
const CATEGORIES = ['bug', 'payment', 'booking', 'account', 'content', 'other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v) => (typeof v === 'string' ? v.trim() : '');

// POST /api/support/reports { category, message, email?, platform?, appVersion? }
router.post(
  '/reports',
  optionalAuth,
  rateLimit({ name: 'support-report', max: 5, windowSec: 10 * 60 }),
  asyncHandler(async (req, res) => {
    const category = text(req.body?.category);
    const message = text(req.body?.message);
    const email = text(req.body?.email).toLowerCase();
    if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Pick what the problem is about');
    if (message.length < 10) throw new HttpError(400, 'Tell us a little more (at least 10 characters)');
    if (message.length > 2000) throw new HttpError(400, 'Keep it under 2000 characters');
    if (!req.user && !EMAIL_RE.test(email)) throw new HttpError(400, 'Add an email so we can reply');
    const platform = ['android', 'ios', 'web'].includes(req.body?.platform) ? req.body.platform : 'unknown';
    const report = await Report.create({
      user: req.user?._id,
      category,
      message,
      email: email || req.user?.email || undefined,
      platform,
      appVersion: text(req.body?.appVersion).slice(0, 20) || undefined,
    });
    res.status(201).json({ id: report._id, message: 'Thanks! We got your report and will look into it.' });
  })
);

module.exports = router;
