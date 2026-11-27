const express = require('express');
const storage = require('../../infra/storage');
const router = express.Router();
const User = require('./user.model');
const Trip = require('../trips/trip.model');
const { auth } = require('../../shared/middleware/auth');

// GET /api/users/profile
router.get('/profile', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -refreshToken -otpCode -otpExpiry -passwordReset -googleId')
      .populate('wishlist');
    res.json(user);
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
    if (body.interests !== undefined) {
      if (!Array.isArray(body.interests)) return res.status(400).json({ message: 'interests must be a list' });
      updates.interests = body.interests.filter((i) => typeof i === 'string').map((i) => i.trim().slice(0, 40)).slice(0, 20);
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

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true })
      .select('-password -refreshToken -otpCode -otpExpiry -passwordReset -googleId');
    
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
      elite: { next: null, needed: null }
    };

    const currentTier = tierThresholds[user.explorerTier];
    const progress = currentTier.needed 
      ? Math.min((user.stats.bookingsInspired / currentTier.needed) * 100, 100)
      : 100;

    res.json({
      referralPoints: user.referralPoints,
      explorerTier: user.explorerTier,
      bookingsInspired: user.stats.bookingsInspired,
      nextTier: currentTier.next,
      nextTierNeeded: currentTier.needed,
      progress: Math.round(progress),
      pointsValue: user.referralPoints // 1 point = ₹1
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
    const user = await User.findById(req.user._id)
      .populate({
        path: 'wishlist',
        populate: { path: 'agency', select: 'name location rating reviewCount' }
      });
    res.json(user.wishlist);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
