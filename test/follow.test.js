// Followers / following are real rows in MongoDB. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.RATE_LIMIT_AUTH_MAX = '1000';

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');
const Follow = require('../src/modules/users/follow.model');

let server;
let base;
before(async () => {
  await connectDB();
  await Follow.syncIndexes();
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
      name: `F${n}`,
      email: `f${Date.now()}${n++}@t.dev`,
      password: 'follow-test-1',
    })
  ).data;

test('follow, unfollow, counts and lists', async () => {
  const a = await newUser();
  const b = await newUser();
  const id = b.user._id;

  assert.equal((await call('POST', `/users/${id}/follow`)).status, 401);
  await call('POST', `/users/${id}/follow`, null, a.token);
  const again = await call('POST', `/users/${id}/follow`, null, a.token); // no double count
  assert.equal(again.data.followers, 1);

  const profile = (await call('GET', `/users/${id}/public`, null, a.token)).data;
  assert.equal(profile.followers, 1);
  assert.equal(profile.isFollowing, true);
  assert.equal(profile.user.email, undefined); // nothing private
  assert.equal((await call('GET', `/users/${a.user._id}/public`)).data.following, 1);

  const followers = (await call('GET', `/users/${id}/followers`, null, a.token)).data;
  assert.equal(followers[0].name, a.user.name);
  assert.equal(followers[0].email, undefined);
  assert.deepEqual((await call('GET', '/users/me/following-ids', null, a.token)).data, [id]);

  await call('DELETE', `/users/${id}/follow`, null, a.token);
  assert.equal((await call('GET', `/users/${id}/public`)).data.followers, 0);
});

test('cannot follow yourself or an invalid user', async () => {
  const a = await newUser();
  assert.equal((await call('POST', `/users/${a.user._id}/follow`, null, a.token)).status, 400);
  assert.equal((await call('POST', '/users/nope/follow', null, a.token)).status, 400);
  assert.equal((await call('POST', '/users/aaaaaaaaaaaaaaaaaaaaaaaa/follow', null, a.token)).status, 404);
});

test("public tapes: only that user's playable tapes, no private fields", async () => {
  const Reel = require('../src/modules/reels/reel.model');
  const a = await newUser();
  const b = await newUser();
  const base_ = { location: 'Goa', mediaUrl: 'https://x/a.mp4' };
  await Reel.create({ ...base_, user: a.user._id, caption: 'ready', rawKey: 'secret/raw.mp4' });
  await Reel.create({ ...base_, user: a.user._id, caption: 'busy', status: 'processing' });
  await Reel.create({ ...base_, user: b.user._id, caption: 'other' });
  const list = (await call('GET', `/reels/user/${a.user._id}`)).data;
  assert.deepEqual(
    list.map((r) => r.caption),
    ['ready']
  );
  assert.equal(list[0].rawKey, undefined);
  assert.equal(list[0].likedBy, undefined);
  assert.equal(list[0].user.email, undefined);
  assert.deepEqual((await call('GET', '/reels/user/nope')).data, []);
});
