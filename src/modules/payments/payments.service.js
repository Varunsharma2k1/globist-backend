/**
 * Payments (HLD flow C). Owns Razorpay orders, verification and the
 * pending -> confirmed transition. Confirmation is idempotent: a repeated
 * webhook or callback for the same order is a no-op.
 *
 * Postgres ledger + outbox (HLD) lands here when DATABASE_URL is set; see
 * db/postgres/migrations. Until then the booking document is the record.
 */
const Booking = require('../booking/booking.model');
const User = require('../users/user.model');
const razorpay = require('../../integrations/razorpay');
const { cache } = require('../../infra/redis');
const { enqueue, QUEUES } = require('../../infra/queue');
const { track } = require('../../infra/observability');
const notifications = require('../notifications/notifications.service');

const holdKey = ({ tripId, date, userId }) => `hold:${tripId}:${new Date(date).toISOString().slice(0, 10)}:${userId}`;

const holdSeat = ({ tripId, date, userId, ttlSec }) => cache.setNx(holdKey({ tripId, date, userId }), 1, ttlSec);
const releaseSeat = (b) => cache.del(holdKey({ tripId: b.trip, date: b.checkIn, userId: b.user }));

async function createOrderForBooking(booking) {
  const order = await razorpay.createOrder({
    amountPaise: Math.round(booking.totalAmount * 100), // server-side price only
    receipt: String(booking._id),
    notes: { bookingId: String(booking._id) },
  });
  booking.payment = { provider: 'razorpay', orderId: order.id, status: 'created' };
  await booking.save();
  return order;
}

/** Idempotent: only a pending booking with this order flips to confirmed. */
async function confirmByOrder(orderId, paymentId) {
  const booking = await Booking.findOneAndUpdate(
    { 'payment.orderId': orderId, status: 'pending' },
    {
      $set: { status: 'confirmed', 'payment.paymentId': paymentId, 'payment.status': 'paid' },
      $unset: { holdExpiresAt: 1 },
    },
    { new: true }
  );
  if (!booking) return { booking: await Booking.findOne({ 'payment.orderId': orderId }), alreadyHandled: true };

  const inc = { 'stats.trips': 1 };
  if (booking.referralPointsUsed > 0) inc.referralPoints = -booking.referralPointsUsed;
  await User.updateOne({ _id: booking.user }, { $inc: inc });
  await releaseSeat(booking);

  await enqueue(QUEUES.EVENTS, 'BookingConfirmed', { bookingId: String(booking._id) });
  await notifications.notify(booking.user, {
    title: 'Booking confirmed 🎒',
    body: 'Your trip is booked. See you on the road!',
    data: { type: 'booking', bookingId: String(booking._id) },
  });
  track(booking.user, 'booking_confirmed', { amount: booking.totalAmount });
  return { booking, alreadyHandled: false };
}

async function failByOrder(orderId) {
  const booking = await Booking.findOneAndUpdate(
    { 'payment.orderId': orderId, status: 'pending' },
    { $set: { status: 'cancelled', 'payment.status': 'failed' } },
    { new: true }
  );
  if (booking) await releaseSeat(booking);
  return booking;
}

/** Saga compensation: expire pending bookings whose hold ran out. */
async function expireStaleHolds() {
  const stale = await Booking.find({ status: 'pending', holdExpiresAt: { $lt: new Date() } }).limit(200);
  for (const b of stale) if (b.payment?.orderId) await failByOrder(b.payment.orderId);
  return stale.length;
}

module.exports = {
  holdSeat,
  releaseSeat,
  createOrderForBooking,
  confirmByOrder,
  failByOrder,
  expireStaleHolds,
  publicKeyId: razorpay.publicKeyId,
};
