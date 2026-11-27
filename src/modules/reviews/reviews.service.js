/**
 * Agency reviews (comments). Anyone signed in can comment; authors who
 * actually booked with the agency get a "Verified traveller" badge, decided
 * here from real bookings (never from the client).
 */
const mongoose = require('mongoose');
const { HttpError } = require('../../shared/http');
const Review = require('./review.model');
const Agency = require('../trips/agency.model');
const Booking = require('../booking/booking.model');

const MAX_LEN = 1000;
const PAGE = 20;
const PUBLIC_USER = 'name avatar explorerTier';

const assertId = (id, what) => {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw new HttpError(400, `Invalid ${what}`);
};

/** Newest first. `before` = ISO date cursor from the previous page's last item. */
async function listForAgency(agencyId, { before, limit = PAGE } = {}) {
  assertId(agencyId, 'agency');
  const filter = { agency: agencyId, hidden: false };
  const cursor = before ? new Date(before) : null;
  if (cursor && !Number.isNaN(cursor.getTime())) filter.createdAt = { $lt: cursor };
  const size = Math.min(Math.max(parseInt(limit, 10) || PAGE, 1), 50);
  const [reviews, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).limit(size + 1).populate('user', PUBLIC_USER).lean(),
    Review.countDocuments({ agency: agencyId, hidden: false }),
  ]);
  const hasMore = reviews.length > size;
  return { reviews: reviews.slice(0, size), total, hasMore };
}

async function create(user, agencyId, rawText) {
  assertId(agencyId, 'agency');
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!text) throw new HttpError(400, 'Write something first');
  if (text.length > MAX_LEN) throw new HttpError(400, `Keep it under ${MAX_LEN} characters`);
  if (!(await Agency.exists({ _id: agencyId }))) throw new HttpError(404, 'Agency not found');

  const verifiedTraveller = Boolean(
    await Booking.exists({ user: user._id, agency: agencyId, status: { $in: ['confirmed', 'completed'] } })
  );
  const review = await Review.create({ agency: agencyId, user: user._id, text, verifiedTraveller });
  return Review.findById(review._id).populate('user', PUBLIC_USER).lean();
}

/** Authors can delete their own review. */
async function remove(user, reviewId) {
  assertId(reviewId, 'review');
  const { deletedCount } = await Review.deleteOne({ _id: reviewId, user: user._id });
  if (!deletedCount) throw new HttpError(404, 'Review not found');
}

module.exports = { listForAgency, create, remove };
