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
  (await call('POST', '/auth/signup', { name: 'B', email: `b${Date.now()}${n++}@t.dev`, password: 'booking-test-1' })).data;
const book = (token, extra = {}) =>
  call('POST', '/bookings', { tripId: String(trip._id), checkIn: '2027-01-10', adults: 2, ...extra }, token);

test('booking a real trip: return date from trip length, demo auto-complete', async () => {
  const me = await newUser();
  const { status, data } = await book(me.token);
  assert.equal(status, 201);
  assert.equal(data.status, 'completed'); // DEMO_AUTO_COMPLETE_BOOKINGS defaults on outside production
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
  const after = await User.findById(me.user._id).lean();
  assert.equal(after.referralPoints, 0);
  const res = await book(me.token, { referredBy: 'REEL-local-id' });
  assert.equal(res.status, 201);
  assert.equal(res.data.referredBy, undefined);
});

test('full chain: book -> tagged tape -> visible on the agency profile', async () => {
  const me = await newUser();
  const booking = (await book(me.token)).data;
  const tape = await call('POST', '/reels', { caption: 'Hampta!', location: 'Manali', mediaUrl: 'https://x/t.mp4', bookingId: booking._id }, me.token);
  assert.equal(tape.status, 201);
  assert.equal(tape.data.isAffiliate, true);
  const other = await newUser();
  const b2 = (await book(other.token)).data;
  await call('POST', '/reels', { caption: 'Loved it', location: 'Manali', mediaUrl: 'https://x/u.mp4', bookingId: b2._id }, other.token);
  const list = (await call('GET', `/reels/agency/${agency._id}`)).data;
  assert.equal(list.length, 2); // tapes from two different travellers
});
