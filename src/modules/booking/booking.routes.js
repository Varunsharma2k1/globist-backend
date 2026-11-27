const express = require('express');
const router = express.Router();
const Booking = require('./booking.model');
const Trip = require('../trips/trip.model');
const User = require('../users/user.model');
const Referral = require('../users/referral.model');
const { auth } = require('../../shared/middleware/auth');
const idempotency = require('../../shared/middleware/idempotency');
const rateLimit = require('../../shared/middleware/rateLimit');
const mongoose = require('mongoose');
const env = require('../../config/env');
const payments = require('../payments/payments.service');
const notifications = require('../notifications/notifications.service');

const HOLD_SEC = 600; // HLD: seat hold SET NX EX 600

// POST /api/bookings — Create a booking
router.post('/', auth, rateLimit({ name: 'booking', max: 20 }), idempotency(), async (req, res, next) => {
  try {
    const { tripId, checkIn, adults, children, paymentMethod, referralPointsUsed, referredBy, pay } = req.body;
    // pay: true -> HLD flow (pending + Razorpay order, confirmed by webhook).
    // Without it the legacy instant-confirm flow runs, so today's app keeps working.
    const payFlow = pay === true;

    if (!mongoose.isValidObjectId(tripId)) {
      return res.status(404).json({ message: 'This trip is not available for booking yet' });
    }
    const trip = await Trip.findById(tripId).populate('agency');
    if (!trip || !trip.agency) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    // Dates: the departure must be a real date; the return is computed from
    // the trip's length (the client's value is ignored).
    const start = new Date(checkIn);
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ message: 'Pick a valid departure date' });
    }
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(1, Number(trip.duration) || 1));

    // A referral counts only if it names a real, different user.
    const referrer =
      referredBy && mongoose.isValidObjectId(referredBy) && String(referredBy) !== String(req.user._id)
        ? await User.exists({ _id: referredBy })
        : null;

    const numAdults = Math.min(Math.max(parseInt(adults, 10) || 1, 1), 20);
    const numChildren = Math.min(Math.max(parseInt(children, 10) || 0, 0), 20);
    const baseAmount = trip.pricePerPerson * numAdults;
    const platformFee = 500;
    const discount = 1200; // First booking discount (prototype)
    // Clamp to [0, balance]: a negative value would otherwise ADD points.
    const requestedPoints = Math.max(0, parseInt(referralPointsUsed, 10) || 0);
    const pointsDiscount = Math.min(requestedPoints, Math.max(0, req.user.referralPoints || 0));
    const totalAmount = baseAmount + platformFee - discount - pointsDiscount;

    const booking = new Booking({
      user: req.user._id,
      trip: trip._id,
      agency: trip.agency._id,
      checkIn: start,
      checkOut: end,
      adults: numAdults,
      children: numChildren,
      totalAmount: Math.max(totalAmount, 0),
      discount: discount + pointsDiscount,
      platformFee,
      paymentMethod: paymentMethod || 'upi',
      referralPointsUsed: pointsDiscount,
      // Becomes 'completed' automatically the day the trip ends (maintenance job).
      status: payFlow ? 'pending' : 'confirmed',
      holdExpiresAt: payFlow ? new Date(Date.now() + HOLD_SEC * 1000) : undefined,
      referredBy: referrer ? referrer._id : undefined,
    });

    if (payFlow) {
      const held = await payments.holdSeat({ tripId: trip._id, date: checkIn, userId: req.user._id, ttlSec: HOLD_SEC });
      if (!held)
        return res
          .status(409)
          .json({ message: 'You already have a hold on this departure. Finish or cancel that payment first.' });
    }

    await booking.save();

    if (payFlow) {
      const order = await payments.createOrderForBooking(booking);
      return res
        .status(201)
        .json({ booking, order, razorpayKeyId: payments.publicKeyId(), holdExpiresAt: booking.holdExpiresAt });
    }

    // Deduct referral points
    if (pointsDiscount > 0) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { referralPoints: -pointsDiscount },
      });
    }

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 'stats.trips': 1 },
    });

    // If referred by someone, create referral record and award points
    if (referrer) {
      const pointsEarned = Math.floor(trip.pricePerPerson * numAdults * 0.03);
      const referral = new Referral({
        creator: referrer._id,
        booking: booking._id,
        pointsEarned,
        percentage: 3,
      });
      await referral.save();

      await User.findByIdAndUpdate(referrer._id, {
        $inc: { referralPoints: pointsEarned, 'stats.bookingsInspired': 1 },
      });
    }

    notifications.record({ user: req.user._id, type: 'booking', text: trip.title || 'your trip' });

    const populatedBooking = await Booking.findById(booking._id)
      .populate({ path: 'trip', populate: { path: 'region', select: 'name' } })
      .populate('agency', 'name location');

    res.status(201).json(populatedBooking);
  } catch (error) {
    next(error);
  }
});

// POST /api/bookings/:id/demo-complete — DEMO ONLY (off in production):
// ends one of your trips now so the "post a tape" flow can be shown.
router.post('/:id/demo-complete', auth, async (req, res, next) => {
  try {
    if (!env.demoTools) return res.status(404).json({ message: 'Not found' });
    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (['cancelled', 'pending'].includes(booking.status)) {
      return res.status(409).json({ message: 'This booking can’t be completed' });
    }
    const day = 24 * 60 * 60 * 1000;
    const nights = Math.max(1, Math.round((booking.checkOut - booking.checkIn) / day) || 1);
    booking.checkOut = new Date(Date.now() - day);
    booking.checkIn = new Date(booking.checkOut.getTime() - nights * day);
    booking.status = 'completed';
    await booking.save();
    res.json({ booking });
  } catch (error) {
    next(error);
  }
});

// GET /api/bookings — Get user's bookings
router.get('/', auth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = { user: req.user._id };
    if (status) filter.status = status;

    const bookings = await Booking.find(filter)
      .populate({ path: 'trip', populate: { path: 'region', select: 'name' } })
      .populate('agency', 'name location imageType')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    next(error);
  }
});

// GET /api/bookings/:id — Booking detail
router.get('/:id', auth, async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id })
      .populate({ path: 'trip', populate: { path: 'region', select: 'name' } })
      .populate('agency', 'name location imageType rating');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/bookings/:id/cancel — Cancel a booking
router.patch('/:id/cancel', auth, async (req, res, next) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.id, user: req.user._id });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking already cancelled' });
    }
    // Once the trip has started it can't be cancelled in the app (protects
    // agencies and the tape rewards earned from finished trips).
    if (booking.status === 'completed' || (booking.checkIn && booking.checkIn.getTime() <= Date.now())) {
      return res.status(409).json({
        code: 'TRIP_STARTED',
        message: 'This trip has already started, so it can’t be cancelled here. Contact support for help.',
      });
    }

    booking.status = 'cancelled';
    await booking.save();

    // Refund referral points if used
    if (booking.referralPointsUsed > 0) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { referralPoints: booking.referralPointsUsed },
      });
    }

    res.json({ message: 'Booking cancelled', booking });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
