/**
 * Reels business rules shared by every "create a reel" route.
 *
 * Agency tagging ("affiliate" reels) is earned, never claimed: a reel is
 * linked to an agency ONLY through a booking the poster made on TripTape.
 * The agency comes from that booking — never from the request — so nobody
 * can tag an agency they didn't travel with by calling the API directly.
 */
const mongoose = require('mongoose');
const { HttpError } = require('../../shared/http');
const Reel = require('./reel.model');
const Booking = require('../booking/booking.model');

const TAGGABLE_STATUSES = ['confirmed', 'completed'];

/**
 * @param {Object} user  req.user
 * @param {string} [bookingId]
 * @returns {Promise<{agency?: ObjectId, booking?: ObjectId, isAffiliate: boolean}>}
 */
async function resolveAffiliation(user, bookingId) {
  if (!bookingId) return { isAffiliate: false }; // plain post: no agency, whatever the client sent
  if (typeof bookingId !== 'string' || !mongoose.isValidObjectId(bookingId)) {
    throw new HttpError(400, 'Invalid booking');
  }
  const booking = await Booking.findOne({ _id: bookingId, user: user._id }).select('agency status');
  if (!booking) throw new HttpError(403, 'You can only tag a trip you booked');
  if (!TAGGABLE_STATUSES.includes(booking.status)) {
    throw new HttpError(409, 'This booking can’t be tagged');
  }
  if (await Reel.exists({ booking: booking._id, user: user._id })) {
    throw new HttpError(409, 'You already posted a tape for this trip', 'BOOKING_ALREADY_TAGGED');
  }
  return { agency: booking.agency, booking: booking._id, isAffiliate: true };
}

/**
 * Public, finished reels linked to an agency (its profile). Since the agency
 * is only ever set from a verified booking (or by our own seed data), every
 * reel here is genuine.
 */
function agencyReels(agencyId, { limit = 30 } = {}) {
  return Reel.find({
    agency: agencyId,
    status: { $in: ['ready', null] },
    mediaUrl: { $nin: [null, ''] },
  })
    .populate('user', 'name explorerTier avatar')
    .sort({ createdAt: -1 })
    .limit(limit);
}

module.exports = { resolveAffiliation, agencyReels };
