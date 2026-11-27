// Boots the app with every connection disabled and hits core endpoints.
// Run: npm test   (each module owner should add tests under test/<module>/)
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');

let server;
let base;
before(async () => {
  await connectDB();
  server = app.listen(0);
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  server.close();
  await disconnectDB();
});

test('health + deps', async () => {
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  const deps = await (await fetch(`${base}/api/health/deps`)).json();
  assert.equal(deps.stores.mongo, 'ok');
});

test('unknown api route is JSON 404', async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
  assert.ok((await res.json()).requestId);
});

test('feed responds with paging shape', async () => {
  const body = await (await fetch(`${base}/api/feed`)).json();
  assert.ok(Array.isArray(body.reels));
  assert.equal(typeof body.hasMore, 'boolean');
});

test('chat requires auth', async () => {
  assert.equal((await fetch(`${base}/api/chat/conversations`)).status, 401);
});
