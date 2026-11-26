const express = require('express');
const router = express.Router();
const Booking = require('./booking.model');
const Trip = require('../trips/trip.model');
const Agency = require('../trips/agency.model');
const User = require('../users/user.model');
const Referral = require('../users/referral.model');
const { auth } = require('../../shared/middleware/auth');
const idempotency = require('../../shared/middleware/idempotency');
const rateLimit = require('../../shared/middleware/rateLimit');
const payments = require('../payments/payments.service');

const HOLD_SEC = 600; // HLD: seat hold SET NX EX 600

// POST /api/bookings — Create a booking
router.post('/', auth, rateLimit({ name: 'booking', max: 20 }), idempotency(), async (req, res, next) => {
  try {
    const { tripId, checkIn, checkOut, adults, children, paymentMethod, referralPointsUsed, referredBy, pay } = req.body;
    // pay: true -> HLD flow (pending + Razorpay order, confirmed by webhook).
    // Without it the legacy instant-confirm flow runs, so today's app keeps working.
    const payFlow = pay === true;

    const trip = await Trip.findById(tripId).populate('agency');
    if (!trip) {
      return res.status(404).json({ message: 'Trip not found' });
    }

    const numAdults = adults || 1;
    const numChildren = children || 0;
    const baseAmount = trip.pricePerPerson * numAdults;
    const platformFee = 500;
    const discount = 1200; // First booking discount (prototype)
    const pointsDiscount = Math.min(referralPointsUsed || 0, req.user.referralPoints);
    const totalAmount = baseAmount + platformFee - discount - pointsDiscount;

    const booking = new Booking({
      user: req.user._id,
      trip: trip._id,
      agency: trip.agency._id,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      adults: numAdults,
      children: numChildren,
      totalAmount: Math.max(totalAmount, 0),
      discount: discount + pointsDiscount,
      platformFee,
      paymentMethod: paymentMethod || 'upi',
      referralPointsUsed: pointsDiscount,
      status: payFlow ? 'pending' : 'confirmed',
      holdExpiresAt: payFlow ? new Date(Date.now() + HOLD_SEC * 1000) : undefined,
      referredBy: referredBy || undefined
    });

    if (payFlow) {
      const held = await payments.holdSeat({ tripId: trip._id, date: checkIn, userId: req.user._id, ttlSec: HOLD_SEC });
      if (!held) return res.status(409).json({ message: 'You already have a hold on this departure. Finish or cancel that payment first.' });
    }

    await booking.save();

    if (payFlow) {
      const order = await payments.createOrderForBooking(booking);
      return res.status(201).json({ booking, order, razorpayKeyId: payments.publicKeyId(), holdExpiresAt: booking.holdExpiresAt });
    }

    // Deduct referral points
    if (pointsDiscount > 0) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { referralPoints: -pointsDiscount }
      });
    }

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 'stats.trips': 1 }
    });

    // If referred by someone, create referral record and award points
    if (referredBy) {
      const pointsEarned = Math.floor(trip.pricePerPerson * numAdults * 0.03);
      const referral = new Referral({
        creator: referredBy,
        booking: booking._id,
        pointsEarned,
        percentage: 3
      });
      await referral.save();

      await User.findByIdAndUpdate(referredBy, {
        $inc: { referralPoints: pointsEarned, 'stats.bookingsInspired': 1 }
      });
    }

    const populatedBooking = await Booking.findById(booking._id)
      .populate({ path: 'trip', populate: { path: 'region', select: 'name' } })
      .populate('agency', 'name location');

    res.status(201).json(populatedBooking);
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

    booking.status = 'cancelled';
    await booking.save();

    // Refund referral points if used
    if (booking.referralPointsUsed > 0) {
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { referralPoints: booking.referralPointsUsed }
      });
    }

    res.json({ message: 'Booking cancelled', booking });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
