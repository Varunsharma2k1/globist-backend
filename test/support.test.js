// Problem reports and account deletion. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.RATE_LIMIT_AUTH_MAX = '1000';

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');
const Reel = require('../src/modules/reels/reel.model');
const Follow = require('../src/modules/users/follow.model');

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
const newUser = async () =>
  (
    await call('POST', '/auth/signup', {
      name: `S${n}`,
      email: `s${Date.now()}${n++}@t.dev`,
      password: 'support-test-1',
    })
  ).data;

test('report a problem: validated, guests need an email', async () => {
  const me = await newUser();
  const ok = await call(
    'POST',
    '/support/reports',
    { category: 'bug', message: 'The map does not load pins', platform: 'android' },
    me.token
  );
  assert.equal(ok.status, 201);
  assert.equal(
    (await call('POST', '/support/reports', { category: 'nope', message: 'long enough text' }, me.token)).status,
    400
  );
  assert.equal((await call('POST', '/support/reports', { category: 'bug', message: 'short' }, me.token)).status, 400);
  assert.equal(
    (await call('POST', '/support/reports', { category: 'bug', message: 'guest without email here' })).status,
    400
  );
  assert.equal(
    (await call('POST', '/support/reports', { category: 'bug', message: 'guest with an email here', email: 'g@t.dev' }))
      .status,
    201
  );
});

test('delete account: needs the password, removes tapes and follows, kills sessions', async () => {
  const me = await newUser();
  const other = await newUser();
  await call('POST', `/users/${other.user._id}/follow`, null, me.token);
  await Reel.create({ user: me.user._id, caption: 'bye', location: 'Goa', mediaUrl: 'https://x/a.mp4' });

  assert.equal((await call('DELETE', '/users/me', { password: 'wrong-pass-1' }, me.token)).status, 401);
  assert.equal((await call('DELETE', '/users/me', { password: 'support-test-1' }, me.token)).status, 200);

  assert.equal(await Reel.countDocuments({ user: me.user._id }), 0);
  assert.equal(await Follow.countDocuments({ follower: me.user._id }), 0);
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: me.refreshToken })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: me.user.email, password: 'support-test-1' })).status, 401);
});
