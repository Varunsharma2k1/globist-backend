// Agency reviews live in MongoDB; badges come from real bookings. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.RATE_LIMIT_AUTH_MAX = '1000';

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');
const Agency = require('../src/modules/trips/agency.model');
const Trip = require('../src/modules/trips/trip.model');

let server;
let base;
let agency;
let trip;
before(async () => {
  await connectDB();
  server = app.listen(0);
  base = `http://localhost:${server.address().port}/api`;
  agency = new Agency({ name: 'Review Treks', location: 'Leh' });
  await agency.save({ validateBeforeSave: false });
  trip = new Trip({ title: 'Markha', agency: agency._id, pricePerPerson: 9000, duration: 4 });
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
  (await call('POST', '/auth/signup', { name: `Rev ${n}`, email: `rv${Date.now()}${n++}@t.dev`, password: 'review-test-1' })).data;

test('reviews are stored, listed newest first, and badge real customers', async () => {
  const visitor = await newUser();
  const customer = await newUser();
  await call('POST', '/bookings', { tripId: String(trip._id), checkIn: '2027-02-01' }, customer.token);

  assert.equal((await call('POST', `/reviews/agency/${agency._id}`, { text: 'Looks great' })).status, 401);
  const a = await call('POST', `/reviews/agency/${agency._id}`, { text: 'Looks great' }, visitor.token);
  const b = await call('POST', `/reviews/agency/${agency._id}`, { text: 'Amazing guides!', verifiedTraveller: false }, customer.token);
  assert.equal(a.status, 201);
  assert.equal(a.data.verifiedTraveller, false);
  assert.equal(b.data.verifiedTraveller, true);
  assert.equal(b.data.user.name, customer.user.name);
  assert.equal(b.data.user.email, undefined); // no private fields leak

  const list = await call('GET', `/reviews/agency/${agency._id}`);
  assert.equal(list.data.total, 2);
  assert.equal(list.data.reviews[0].text, 'Amazing guides!');
});

test('validation, ownership and spam limits', async () => {
  const me = await newUser();
  const other = await newUser();
  const path = `/reviews/agency/${agency._id}`;
  assert.equal((await call('POST', path, { text: '   ' }, me.token)).status, 400);
  assert.equal((await call('POST', path, { text: 'x'.repeat(1001) }, me.token)).status, 400);
  assert.equal((await call('POST', path, { text: { $gt: '' } }, me.token)).status, 400);
  assert.equal((await call('POST', `/reviews/agency/not-an-id`, { text: 'hi' }, me.token)).status, 400);

  const mine = (await call('POST', path, { text: 'mine' }, me.token)).data;
  assert.equal((await call('DELETE', `/reviews/${mine._id}`, null, other.token)).status, 404);
  assert.equal((await call('DELETE', `/reviews/${mine._id}`, null, me.token)).status, 200);

  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', path, { text: `spam ${i}` }, other.token);
  assert.equal(last.status, 429);
});
