// Booking creation rules + the demo -> tagged tape chain. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.RATE_LIMIT_AUTH_MAX = '1000';

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');
const Agency = require('../src/modules/trips/agency.model');
const Trip = require('../src/modules/trips/trip.model');
const User = require('../src/modules/users/user.model');

let server;
let base;
let trip;
let agency;
before(async () => {
  await connectDB();
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
  agency = new Agency({ name: 'Test Treks', location: 'Manali', isVerified: true });
  await agency.save({ validateBeforeSave: false });
  trip = new Trip({ title: 'Hampta Pass', agency: agency._id, pricePerPerson: 10000, duration: 5 });
  await trip.save({ validateBeforeSave: false });
});
after(async () => {
  server.close();
  await disconnectDB();
});

const call = async (method, path, body, token) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};
let n = 0;
const newUser = async () =>
  (await call('POST', '/auth/signup', { name: 'B', email: `b${Date.now()}${n++}@t.dev`, password: 'booking-test-1' }))
    .data;
const book = (token, extra = {}) =>
  call('POST', '/bookings', { tripId: String(trip._id), checkIn: '2027-01-10', adults: 2, ...extra }, token);

test('booking a real trip: confirmed, return date from trip length', async () => {
  const me = await newUser();
  const { status, data } = await book(me.token);
  assert.equal(status, 201);
  assert.equal(data.status, 'confirmed'); // completes only after the trip ends
  assert.equal(new Date(data.checkOut).toISOString().slice(0, 10), '2027-01-15');
});

test('bad trip ids and dates are refused clearly', async () => {
  const me = await newUser();
  assert.equal((await book(me.token, { tripId: 'local-manali-snow-escape' })).status, 404);
  assert.equal((await book(me.token, { tripId: String(new mongoose.Types.ObjectId()) })).status, 404);
  assert.equal((await book(me.token, { checkIn: 'not-a-date' })).status, 400);
});

test('negative referral points cannot mint points; self/unknown referrers ignored', async () => {
  const me = await newUser();
  await book(me.token, { referralPointsUsed: -100000, referredBy: me.user._id });
  const updated = await User.findById(me.user._id).lean();
  assert.equal(updated.referralPoints, 0);
  const res = await book(me.token, { referredBy: 'REEL-local-id' });
  assert.equal(res.status, 201);
  assert.equal(res.data.referredBy, undefined);
});

test('full chain: book -> trip ends -> tagged tape -> visible on the agency profile', async () => {
  const Booking = require('../src/modules/booking/booking.model');
  const { completeFinishedTrips } = require('../src/modules/booking/booking.service');
  const finish = async (id) => {
    await Booking.updateOne(
      { _id: id },
      { $set: { checkIn: new Date(Date.now() - 5 * 864e5), checkOut: new Date(Date.now() - 864e5) } }
    );
  };
  const me = await newUser();
  const booking = (await book(me.token)).data;
  // Before the trip ends: no tape, but it can still be cancelled.
  const early = await call(
    'POST',
    '/reels',
    { caption: 'x', location: 'Manali', mediaUrl: 'https://x/t.mp4', bookingId: booking._id },
    me.token
  );
  assert.equal(early.status, 409);
  await finish(booking._id);
  assert.ok((await completeFinishedTrips()) >= 1); // maintenance job marks it completed
  // After the trip: cancelling is refused, tagging works.
  assert.equal((await call('PATCH', `/bookings/${booking._id}/cancel`, null, me.token)).status, 409);
  const tape = await call(
    'POST',
    '/reels',
    { caption: 'Hampta!', location: 'Manali', mediaUrl: 'https://x/t.mp4', bookingId: booking._id },
    me.token
  );
  assert.equal(tape.status, 201);
  assert.equal(tape.data.isAffiliate, true);
  const other = await newUser();
  const b2 = (await book(other.token)).data;
  await finish(b2._id);
  await call(
    'POST',
    '/reels',
    { caption: 'Loved it', location: 'Manali', mediaUrl: 'https://x/u.mp4', bookingId: b2._id },
    other.token
  );
  const list = (await call('GET', `/reels/agency/${agency._id}`)).data;
  assert.equal(list.length, 2); // tapes from two different travellers
});

test('an upcoming trip can be cancelled; a started one cannot', async () => {
  const me = await newUser();
  const upcoming = (await book(me.token, { checkIn: '2099-01-10' })).data;
  assert.equal((await call('PATCH', `/bookings/${upcoming._id}/cancel`, null, me.token)).status, 200);
  const started = (await book(me.token, { checkIn: new Date(Date.now() - 864e5).toISOString().slice(0, 10) })).data;
  const res = await call('PATCH', `/bookings/${started._id}/cancel`, null, me.token);
  assert.equal(res.status, 409);
  assert.equal(res.data.code, 'TRIP_STARTED');
});

test('demo tool: "mark as completed" ends my trip so a tape can be tagged (dev only)', async () => {
  const me = await newUser();
  const other = await newUser();
  const booking = (await book(me.token)).data;
  assert.equal((await call('POST', `/bookings/${booking._id}/demo-complete`, null, other.token)).status, 404);
  const done = await call('POST', `/bookings/${booking._id}/demo-complete`, null, me.token);
  assert.equal(done.status, 200);
  assert.equal(done.data.booking.status, 'completed');
  const tape = await call(
    'POST',
    '/reels',
    { caption: 'demo', location: 'Manali', mediaUrl: 'https://x/d.mp4', bookingId: booking._id },
    me.token
  );
  assert.equal(tape.status, 201);
});
