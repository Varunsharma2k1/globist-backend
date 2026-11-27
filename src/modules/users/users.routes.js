const express = require('express');
const storage = require('../../infra/storage');
const router = express.Router();
const User = require('./user.model');
const Trip = require('../trips/trip.model');
const { auth, optionalAuth } = require('../../shared/middleware/auth');
const rateLimit = require('../../shared/middleware/rateLimit');
const { asyncHandler } = require('../../shared/http');
const follows = require('./follow.service');
const accounts = require('./account.service');

// GET /api/users/profile
router.get('/profile', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -refreshToken -otpCode -otpExpiry -passwordReset -googleId')
      .populate('wishlist');
    const hasPassword = Boolean(await User.exists({ _id: req.user._id, password: { $nin: [null, ''] } }));
    res.json({ ...user.toObject(), hasPassword });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/profile
router.put('/profile', auth, async (req, res, next) => {
  try {
    // Only these fields, only plain strings, with length limits.
    const body = req.body || {};
    const LIMITS = { name: 80, bio: 160, location: 80 };
    const updates = {};
    for (const [key, max] of Object.entries(LIMITS)) {
      if (body[key] === undefined) continue;
      if (typeof body[key] !== 'string') return res.status(400).json({ message: `${key} must be text` });
      const value = body[key].trim();
      if (value.length > max) return res.status(400).json({ message: `${key} is too long (max ${max})` });
      if (key === 'name' && !value) return res.status(400).json({ message: 'Name can’t be empty' });
      updates[key] = value;
    }
    if (body.username !== undefined) {
      // 3–30 chars: a–z, 0–9, "." and "_"; no leading/trailing or double dot.
      const u = typeof body.username === 'string' ? body.username.trim().toLowerCase().replace(/^@/, '') : null;
      if (u === '') {
        updates.username = undefined;
      } else if (!u || !/^[a-z0-9._]{3,30}$/.test(u) || /^\.|\.$|\.\./.test(u)) {
        return res.status(400).json({
          code: 'INVALID_USERNAME',
          message: 'Username: 3–30 letters, numbers, "." or "_"',
        });
      } else {
        const taken = await User.exists({ username: u, _id: { $ne: req.user._id } });
        if (taken) return res.status(409).json({ code: 'USERNAME_TAKEN', message: 'That username is taken' });
        updates.username = u;
      }
    }
    if (body.website !== undefined) {
      if (typeof body.website !== 'string') return res.status(400).json({ message: 'website must be text' });
      let w = body.website.trim();
      if (w && !/^https?:\/\//i.test(w)) w = `https://${w}`;
      if (w && (w.length > 100 || /\s/.test(w) || !/^https?:\/\/[^/\s]+\.[^/\s]{2,}/i.test(w))) {
        return res.status(400).json({ message: 'Enter a valid website, e.g. yoursite.com' });
      }
      updates.website = w;
    }
    if (body.interests !== undefined) {
      if (!Array.isArray(body.interests)) return res.status(400).json({ message: 'interests must be a list' });
      updates.interests = body.interests
        .filter((i) => typeof i === 'string')
        .map((i) => i.trim().slice(0, 40))
        .slice(0, 20);
    }
    if (body.avatar !== undefined) {
      // Only a photo YOU uploaded (our storage, your avatars/ folder) or your
      // Google photo — never arbitrary links, javascript: or data: URLs.
      const ownPrefix = storage.publicUrl(`avatars/${req.user._id}/`);
      const ok =
        body.avatar === '' ||
        (typeof body.avatar === 'string' &&
          body.avatar.length <= 500 &&
          !/\s/.test(body.avatar) &&
          (body.avatar.startsWith(ownPrefix) || /^https:\/\/lh3\.googleusercontent\.com\//.test(body.avatar)));
      if (!ok) return res.status(400).json({ message: 'Invalid avatar' });
      updates.avatar = body.avatar;
    }

    const unset = {};
    if ('username' in updates && updates.username === undefined) {
      delete updates.username;
      unset.username = 1;
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { new: true, runValidators: true }
    ).select('-password -refreshToken -otpCode -otpExpiry -passwordReset -googleId');

    res.json(user);
  } catch (error) {
    next(error);
  }
});

// GET /api/users/wallet
router.get('/wallet', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('referralPoints explorerTier stats');

    const tierThresholds = {
      bronze: { next: 'silver', needed: 10 },
      silver: { next: 'gold', needed: 25 },
      gold: { next: 'elite', needed: 50 },
      elite: { next: null, needed: null },
    };

    const currentTier = tierThresholds[user.explorerTier];
    const progress = currentTier.needed ? Math.min((user.stats.bookingsInspired / currentTier.needed) * 100, 100) : 100;

    res.json({
      referralPoints: user.referralPoints,
      explorerTier: user.explorerTier,
      bookingsInspired: user.stats.bookingsInspired,
      nextTier: currentTier.next,
      nextTierNeeded: currentTier.needed,
      progress: Math.round(progress),
      pointsValue: user.referralPoints, // 1 point = ₹1
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/users/wishlist/:tripId
router.post('/wishlist/:tripId', auth, async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const user = await User.findById(req.user._id);
    const idx = user.wishlist.indexOf(req.params.tripId);

    if (idx > -1) {
      user.wishlist.splice(idx, 1);
      await user.save();
      return res.json({ message: 'Removed from wishlist', wishlisted: false });
    } else {
      user.wishlist.push(req.params.tripId);
      await user.save();
      return res.json({ message: 'Added to wishlist', wishlisted: true });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/users/wishlist
router.get('/wishlist', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'wishlist',
      populate: { path: 'agency', select: 'name location rating reviewCount' },
    });
    res.json(user.wishlist);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/me { password? , confirm? } — permanently delete my account.
// Re-authenticates first: your password, or (Google-only accounts) typing DELETE.
router.delete(
  '/me',
  auth,
  rateLimit({ name: 'delete-account', max: 5 }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (user.password) {
      const pw = req.body?.password;
      if (typeof pw !== 'string' || !(await user.comparePassword(pw))) {
        return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Password is incorrect' });
      }
    } else if (req.body?.confirm !== 'DELETE') {
      return res.status(400).json({ message: 'Type DELETE to confirm' });
    }
    await accounts.deleteAccount(user._id);
    res.json({ message: 'Your account has been deleted' });
  })
);

// ── Follows ─────────────────────────────────────────────────────────
const limitFollow = rateLimit({ name: 'follow', max: 60 });

// GET /api/users/me/following-ids — who I follow (drives Follow buttons)
router.get(
  '/me/following-ids',
  auth,
  asyncHandler(async (req, res) => {
    res.json(await follows.followingIds(req.user._id));
  })
);

// GET /api/users/:id/public -> { user, followers, following, tapes, isFollowing }
router.get(
  '/:id/public',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(await follows.publicProfile(req.params.id, req.user));
  })
);

router.get(
  '/:id/followers',
  auth,
  asyncHandler(async (req, res) => {
    res.json(await follows.list(req.params.id, 'followers'));
  })
);
router.get(
  '/:id/following',
  auth,
  asyncHandler(async (req, res) => {
    res.json(await follows.list(req.params.id, 'following'));
  })
);

router.post(
  '/:id/follow',
  auth,
  limitFollow,
  asyncHandler(async (req, res) => {
    res.json(await follows.follow(req.user, req.params.id));
  })
);
router.delete(
  '/:id/follow',
  auth,
  limitFollow,
  asyncHandler(async (req, res) => {
    res.json(await follows.unfollow(req.user, req.params.id));
  })
);

module.exports = router;
