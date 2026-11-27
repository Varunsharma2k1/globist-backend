// Communities are shared across devices via MongoDB. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.RATE_LIMIT_AUTH_MAX = '1000';

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');

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
      name: `Com ${n}`,
      email: `cm${Date.now()}${n++}@t.dev`,
      password: 'community-test-1',
    })
  ).data;

test('a post from one account is seen by another; votes and comments are shared', async () => {
  const a = await newUser();
  const b = await newUser();
  const slug = 'solo-trippies';

  assert.equal((await call('PUT', '/communities/fake-club/join', null, a.token)).status, 404);
  assert.equal((await call('POST', `/communities/${slug}/posts`, { title: 'Hi' }, a.token)).status, 403); // must join
  await call('PUT', `/communities/${slug}/join`, null, a.token);
  await call('PUT', `/communities/${slug}/join`, null, a.token); // idempotent
  await call('PUT', `/communities/${slug}/join`, null, b.token);
  assert.deepEqual((await call('GET', '/communities/mine', null, a.token)).data, [slug]);
  assert.equal((await call('GET', '/communities/stats')).data[slug].members, 2);

  const post = await call(
    'POST',
    `/communities/${slug}/posts`,
    { title: 'Anyone in Rishikesh?', body: 'Next week', flair: 'Meet-up' },
    a.token
  );
  assert.equal(post.status, 201);
  assert.equal(post.data.user.email, undefined);

  const seenByB = await call('GET', `/communities/${slug}/posts`, null, b.token);
  const p = seenByB.data.find((x) => x._id === post.data._id);
  assert.ok(p, "B sees A's post");
  assert.equal(p.isMine, false);

  const v1 = await call('PUT', `/communities/posts/${p._id}/vote`, { value: 1 }, b.token);
  const v2 = await call('PUT', `/communities/posts/${p._id}/vote`, { value: 1 }, b.token); // repeat is safe
  assert.equal(v1.data.score, 1); // a new post starts at 0; one upvote = 1
  assert.equal(v2.data.score, 1);
  await call('PUT', `/communities/posts/${p._id}/vote`, { value: 1 }, a.token);
  assert.equal((await call('PUT', `/communities/posts/${p._id}/vote`, { value: -1 }, b.token)).data.score, 0); // +1 -1
  assert.equal((await call('PUT', `/communities/posts/${p._id}/vote`, { value: 0 }, b.token)).data.score, 1);

  await call('POST', `/communities/posts/${p._id}/comments`, { text: "Me! Let's meet" }, b.token);
  const detail = await call('GET', `/communities/posts/${p._id}`, null, a.token);
  assert.equal(detail.data.commentCount, 1);
  assert.equal(detail.data.comments[0].text, "Me! Let's meet");
  assert.equal(detail.data.isMine, true);

  await call('DELETE', `/communities/${slug}/join`, null, b.token);
  assert.deepEqual((await call('GET', '/communities/mine', null, b.token)).data, []);
});
