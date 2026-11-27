// Likes, comments and notifications are real and consistent. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.RATE_LIMIT_AUTH_MAX = '1000';

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');
const Reel = require('../src/modules/reels/reel.model');
const Like = require('../src/modules/reels/like.model');
const Notification = require('../src/modules/notifications/notification.model');

let server;
let base;
before(async () => {
  await connectDB();
  await Promise.all([Like.syncIndexes(), Notification.syncIndexes()]);
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
      name: `E${n}`,
      email: `e${Date.now()}${n++}@t.dev`,
      password: 'engage-test-1',
    })
  ).data;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('likes count each person once, survive repeats, and notify the owner once', async () => {
  const owner = await newUser();
  const fan = await newUser();
  const reel = await Reel.create({ user: owner.user._id, caption: 'x', location: 'Goa', mediaUrl: 'https://x/a.mp4' });
  const id = String(reel._id);

  assert.equal((await call('PUT', `/reels/${id}/like`)).status, 401);
  await Promise.all([1, 2, 3].map(() => call('PUT', `/reels/${id}/like`, null, fan.token))); // rapid taps
  assert.equal((await Reel.findById(id).lean()).likes, 1);
  assert.deepEqual((await call('GET', '/reels/liked-ids', null, fan.token)).data, [id]);

  await call('DELETE', `/reels/${id}/like`, null, fan.token);
  await call('DELETE', `/reels/${id}/like`, null, fan.token);
  assert.equal((await Reel.findById(id).lean()).likes, 0);
  await call('PUT', `/reels/${id}/like`, null, fan.token); // like again
  await sleep(50);
  assert.equal(await Notification.countDocuments({ user: owner.user._id, type: 'like' }), 1);

  // Feeds never expose who liked what.
  const feed = (await call('GET', '/reels/user/' + owner.user._id)).data;
  assert.equal(feed[0].likedBy, undefined);
});

test('comments: stored, counted, notify the owner, deletable by author or tape owner', async () => {
  const owner = await newUser();
  const fan = await newUser();
  const stranger = await newUser();
  const reel = await Reel.create({ user: owner.user._id, caption: 'x', location: 'Leh', mediaUrl: 'https://x/b.mp4' });
  const id = String(reel._id);

  assert.equal((await call('POST', `/reels/${id}/comments`, { text: '   ' }, fan.token)).status, 400);
  const c = (await call('POST', `/reels/${id}/comments`, { text: 'Stunning! 😍' }, fan.token)).data;
  assert.equal(c.user.name, fan.user.name);
  assert.equal(c.user.email, undefined);
  assert.equal((await Reel.findById(id).lean()).comments, 1);
  const list = (await call('GET', `/reels/${id}/comments`)).data;
  assert.equal(list[0].text, 'Stunning! 😍');

  assert.equal((await call('DELETE', `/reels/comments/${c._id}`, null, stranger.token)).status, 403);
  assert.equal((await call('DELETE', `/reels/comments/${c._id}`, null, owner.token)).status, 200);
  assert.equal((await Reel.findById(id).lean()).comments, 0);
  await sleep(50);
  assert.equal(await Notification.countDocuments({ user: owner.user._id, type: 'comment' }), 1);
});

test('notifications list, unread count and mark read; nothing for your own actions', async () => {
  const me = await newUser();
  const them = await newUser();
  await call('POST', `/users/${me.user._id}/follow`, null, them.token);
  const mine = await Reel.create({ user: me.user._id, caption: 'x', location: 'Goa', mediaUrl: 'https://x/c.mp4' });
  await call('PUT', `/reels/${mine._id}/like`, null, me.token); // own like: no notification
  await sleep(50);

  const list = (await call('GET', '/notifications', null, me.token)).data;
  assert.deepEqual(
    list.map((x) => x.type),
    ['follow']
  );
  assert.equal(list[0].actor.name, them.user.name);
  assert.equal((await call('GET', '/notifications/unread-count', null, me.token)).data.count, 1);
  await call('POST', '/notifications/read', null, me.token);
  assert.equal((await call('GET', '/notifications/unread-count', null, me.token)).data.count, 0);
  assert.equal((await call('GET', '/notifications')).status, 401);
});
