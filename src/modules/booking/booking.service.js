/**
 * Booking lifecycle rules shared by routes and workers.
 */
const Booking = require('./booking.model');

/**
 * Trips whose return date has passed become 'completed'. Runs every minute
 * from the maintenance job; this is what unlocks "post a tape" for a trip.
 */
async function completeFinishedTrips(now = new Date()) {
  const { modifiedCount } = await Booking.updateMany(
    { status: 'confirmed', checkOut: { $lte: now } },
    { $set: { status: 'completed' } }
  );
  return modifiedCount;
}

/** True once the trip is over and it wasn't cancelled: the only time a tape can be tagged. */
function tripFinished(booking, now = Date.now()) {
  if (!booking || ['cancelled', 'pending'].includes(booking.status)) return false;
  return booking.status === 'completed' || Boolean(booking.checkOut && new Date(booking.checkOut).getTime() <= now);
}

module.exports = { completeFinishedTrips, tripFinished };
