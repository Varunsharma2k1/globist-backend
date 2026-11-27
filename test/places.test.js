// Live map pins come from real tapes; positions are looked up once. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.RATE_LIMIT_AUTH_MAX = '1000';

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');
const geocoder = require('../src/integrations/geocoder');
const places = require('../src/modules/places/places.service');
const { cache } = require('../src/infra/redis');

const lookups = [];
geocoder.geocodePlace = async (q) => {
  lookups.push(q);
  if (/orchha/i.test(q)) return { lat: 25.35, lng: 78.64, stateName: 'Madhya Pradesh', source: 'nominatim' };
  return null; // unknown / outside India
};

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Background lookups finish on their own schedule: poll instead of a fixed sleep.
async function pinsWhen(check, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  let pins = [];
  while (Date.now() < until) {
    await cache.del('places:live:v1');
    pins = (await call('GET', '/places')).data;
    if (check(pins)) return pins;
    await sleep(100);
  }
  return pins;
}

test('pins = real tape counts per location, merged, geocoded once', async () => {
  const me = (
    await call('POST', '/auth/signup', { name: 'Map', email: `m${Date.now()}@t.dev`, password: 'map-tester-1' })
  ).data;
  const tape = (location) => call('POST', '/reels', { caption: 'x', location, mediaUrl: 'https://x/v.mp4' }, me.token);

  await tape('Manali');
  await tape('Manali, Himachal Pradesh'); // same pin as "Manali" (gazetteer)
  await tape('manali ');
  await tape('Orchha, Madhya Pradesh'); // not in gazetteer -> geocoder
  await tape('Atlantis'); // unknown -> no pin
  const pins = await pinsWhen(
    (p) => p.some((x) => x.id === 'manali' && x.count === 3) && p.some((x) => x.state === 'MP')
  );
  const manali = pins.find((p) => p.id === 'manali');
  const orchha = pins.find((p) => p.state === 'MP');
  assert.equal(manali.count, 3);
  assert.equal(manali.state, 'HP');
  assert.equal(orchha.count, 1);
  assert.equal(orchha.name, 'Orchha');
  assert.ok(!pins.some((p) => /atlantis/i.test(p.name)));
  assert.ok(!pins.some((p) => p.id === 'shimla')); // 0 tapes -> no pin
  assert.equal(lookups.filter((q) => /manali/i.test(q)).length, 0); // gazetteer, no network

  // Already-known locations are never looked up again.
  const n = lookups.length;
  await places.resolve('Orchha, Madhya Pradesh');
  assert.equal(lookups.length, n);
});

test('1000 tapes of a place = at most ONE external lookup', async () => {
  const me = (
    await call('POST', '/auth/signup', { name: 'Many', email: `many${Date.now()}@t.dev`, password: 'map-tester-1' })
  ).data;
  const lookupsBefore = lookups.filter((q) => /orchha/i.test(q)).length; // 1 from the previous test
  const spellings = ['Orchha', 'orchha ', 'Orchha, MP', 'ORCHHA, Madhya Pradesh'];
  for (let i = 0; i < 40; i++) {
    await call('POST', '/reels', { caption: 'x', location: spellings[i % 4], mediaUrl: 'https://x/v.mp4' }, me.token);
  }
  const pins = await pinsWhen((p) => p.some((x) => x.state === 'MP' && x.count === 41));
  assert.equal(lookups.filter((q) => /orchha/i.test(q)).length, lookupsBefore); // no new network calls
  const orchha = pins.filter((p) => p.state === 'MP');
  assert.equal(orchha.length, 1); // all spellings -> one pin
  assert.equal(orchha[0].count, 41);
});

test('state names map to the map codes', () => {
  const { stateCode } = places._internal;
  assert.equal(stateCode('Madhya Pradesh'), 'MP');
  assert.equal(stateCode('Jammu and Kashmir'), 'JK');
  assert.equal(stateCode('National Capital Territory of Delhi'), 'DL');
  assert.equal(stateCode('Narnia'), null);
});
