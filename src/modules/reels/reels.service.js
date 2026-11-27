/**
 * Reels business rules shared by every "create a reel" route.
 *
 * Agency tagging ("affiliate" reels) is earned, never claimed: a reel is
 * linked to an agency ONLY through a booking the poster made on TripTape,
 * and only once that trip is over.
 * The agency comes from that booking — never from the request — so nobody
 * can tag an agency they didn't travel with by calling the API directly.
 */
const mongoose = require('mongoose');
const { HttpError } = require('../../shared/http');
const Reel = require('./reel.model');
const Booking = require('../booking/booking.model');
const { tripFinished } = require('../booking/booking.service');
const { remember } = require('../../infra/redis');

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
  const booking = await Booking.findOne({ _id: bookingId, user: user._id }).select('agency status checkOut');
  if (!booking) throw new HttpError(403, 'You can only tag a trip you booked');
  // Only after the trip is over (and so can no longer be cancelled): a tape
  // and its reward can't be earned on a booking that later gets cancelled.
  if (!tripFinished(booking)) {
    if (booking.status === 'cancelled' || booking.status === 'pending') {
      throw new HttpError(409, 'This booking can’t be tagged', 'BOOKING_NOT_TAGGABLE');
    }
    const back = booking.checkOut ? new Date(booking.checkOut).toDateString() : 'your return date';
    throw new HttpError(409, `You can post a tape for this trip after it ends (${back}).`, 'TRIP_NOT_FINISHED');
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

// A tape "counts" once it's playable: finished processing and has a video.
const PLAYABLE = { status: { $in: ['ready', null] }, mediaUrl: { $nin: [null, ''] } };

/**
 * Live map numbers from the tapes themselves (no extra data stored):
 *   tapes = playable tapes
 *   spots = distinct tagged locations among them ("Manali" ×10 = 1 spot),
 *           compared case/space-insensitively.
 * Cached 5 min (Redis, or in-memory without it) so Home stays cheap.
 */
function tapeStats() {
  return remember('reels:stats:v1', 300, async () => {
    const [tapes, spotsAgg] = await Promise.all([
      Reel.countDocuments(PLAYABLE),
      Reel.aggregate([
        { $match: { ...PLAYABLE, location: { $nin: [null, ''] } } },
        { $group: { _id: { $toLower: { $trim: { input: '$location' } } } } },
        { $count: 'spots' },
      ]),
    ]);
    return { tapes, spots: spotsAgg[0]?.spots || 0 };
  });
}

/** Playable tapes per tagged location: [{ key, name, count }] (key = lower/trimmed). */
async function countByLocation() {
  const rows = await Reel.aggregate([
    { $match: { ...PLAYABLE, location: { $nin: [null, ''] } } },
    {
      $group: {
        _id: { $toLower: { $trim: { input: '$location' } } },
        name: { $first: '$location' },
        count: { $sum: 1 },
      },
    },
  ]);
  return rows.map((r) => ({ key: r._id, name: r.name, count: r.count }));
}

/** A user's playable tapes for their public profile, without private fields. */
function userReels(userId, { limit = 60 } = {}) {
  return Reel.find({ user: userId, ...PLAYABLE })
    .select('-rawKey -booking -likedBy')
    .populate('user', 'name explorerTier avatar')
    .populate('agency', 'name location isVerified')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

module.exports = { userReels, resolveAffiliation, agencyReels, tapeStats, countByLocation };
