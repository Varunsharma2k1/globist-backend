// Agency tagging can only come from the poster's own booking. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.RATE_LIMIT_AUTH_MAX = '1000';

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');
const Booking = require('../src/modules/booking/booking.model');
const Reel = require('../src/modules/reels/reel.model');

let server;
let base;
before(async () => {
  await connectDB();
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
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
async function newUser() {
  const { data } = await call('POST', '/auth/signup', { name: 'R', email: `r${Date.now()}${n++}@t.dev`, password: 'reel-tester-1' });
  return data;
}
const oid = () => new mongoose.Types.ObjectId();
async function bookingFor(userId, agency, status = 'confirmed') {
  const doc = new Booking({
    user: userId,
    trip: oid(),
    agency,
    status,
    startDate: new Date(),
    travelersCount: 1,
    totalPrice: 1000,
  });
  await doc.save({ validateBeforeSave: false });
  return doc;
}
const post = (token, extra = {}) =>
  call('POST', '/reels', { caption: 'hi', location: 'Goa', mediaUrl: 'https://x/y.mp4', ...extra }, token);

test('plain posts can never claim an agency', async () => {
  const me = await newUser();
  const { status, data } = await post(me.token, { agencyId: String(oid()), isAffiliate: true });
  assert.equal(status, 201);
  assert.equal(data.agency, undefined);
  assert.equal(data.isAffiliate, false);
});

test('tagging uses the agency from your own booking, not from the request', async () => {
  const me = await newUser();
  const realAgency = oid();
  const booking = await bookingFor(me.user._id, realAgency);
  const { status, data } = await post(me.token, { bookingId: String(booking._id), agencyId: String(oid()) });
  assert.equal(status, 201);
  const saved = await Reel.findById(data._id).lean();
  assert.equal(String(saved.agency), String(realAgency));
  assert.equal(data.isAffiliate, true);
  // One tagged tape per trip.
  const again = await post(me.token, { bookingId: String(booking._id) });
  assert.equal(again.status, 409);
});

test("someone else's or cancelled booking cannot be used", async () => {
  const me = await newUser();
  const other = await newUser();
  const theirs = await bookingFor(other.user._id, oid());
  assert.equal((await post(me.token, { bookingId: String(theirs._id) })).status, 403);
  const cancelled = await bookingFor(me.user._id, oid(), 'cancelled');
  assert.equal((await post(me.token, { bookingId: String(cancelled._id) })).status, 409);
  assert.equal((await post(me.token, { bookingId: { $ne: null } })).status, 400); // injection attempt rejected
});

test("agency profile lists only that agency's tagged tapes", async () => {
  const me = await newUser();
  const agency = oid();
  await post(me.token, { bookingId: String((await bookingFor(me.user._id, agency))._id) });
  await post(me.token, { agencyId: String(agency) }); // fake tag, ignored
  const { data } = await call('GET', `/reels/agency/${agency}`);
  assert.equal(data.length, 1);
  assert.equal(data[0].isAffiliate, true);
});

test('live map stats: playable tapes and distinct locations', async () => {
  const { cache } = require('../src/infra/redis');
  await cache.del('reels:stats:v1');
  const before = (await call('GET', '/reels/stats')).data;
  const me = await newUser();
  await post(me.token, { location: 'Manali' });
  await post(me.token, { location: '  manali ' }); // same spot
  await post(me.token, { location: 'Zanskar Valley' });
  await cache.del('reels:stats:v1');
  const after = (await call('GET', '/reels/stats')).data;
  assert.equal(after.tapes - before.tapes, 3);
  assert.ok(after.spots - before.spots <= 2);
  assert.ok(after.spots >= 2);
});
