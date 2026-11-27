// Security tests for auth + sessions. Run: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.SEED_ON_EMPTY = 'false';
process.env.MONGO_URI = '';
process.env.REDIS_URL = '';
process.env.ACCESS_TOKEN_TTL_SEC = '2';
process.env.RATE_LIMIT_AUTH_MAX = '1000'; // per-IP limit off; per-email limits stay on

const app = require('../src/app');
const { connectDB, disconnectDB } = require('../src/infra/mongo');
const mailer = require('../src/integrations/email');
const Session = require('../src/modules/auth/session.model');
const User = require('../src/modules/users/user.model');

const sentMail = [];
mailer.sendEmail = async (msg) => {
  sentMail.push(msg);
  return { mock: true };
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
  let data = null;
  try {
    data = await res.json();
  } catch {
    // not JSON; leave data null
  }
  return { status: res.status, data, headers: res.headers };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const newEmail = () => `u${Date.now()}${n++}@test.dev`;
const signup = (email, password = 'correct-horse-1') => call('POST', '/auth/signup', { name: 'T', email, password });

test('signup stores a bcrypt hash and hashed session, never raw secrets', async () => {
  const email = newEmail();
  const { status, data } = await signup(email);
  assert.equal(status, 201);
  assert.equal(data.user.password, undefined);
  const user = await User.findOne({ email });
  assert.match(user.password, /^\$2[aby]\$12\$/);
  const session = await Session.findOne({ user: user._id });
  const secret = data.refreshToken.split('.')[1];
  assert.notEqual(session.tokenHash, secret);
  assert.equal(session.tokenHash.length, 64);
});

test('weak and oversized passwords are rejected', async () => {
  assert.equal((await signup(newEmail(), 'short')).status, 400);
  assert.equal((await signup(newEmail(), 'x'.repeat(73))).status, 400);
});

test('login gives the same answer for unknown email and wrong password', async () => {
  const email = newEmail();
  await signup(email);
  const unknown = await call('POST', '/auth/login', { email: newEmail(), password: 'whatever-123' });
  const wrong = await call('POST', '/auth/login', { email, password: 'whatever-123' });
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.data, wrong.data);
});

test('NoSQL operator injection does not log in', async () => {
  await signup(newEmail());
  const res = await call('POST', '/auth/login', { email: { $ne: null }, password: { $ne: null } });
  assert.equal(res.status, 400);
});

test('access token expires and refresh rotates the refresh token', async () => {
  const { data } = await signup(newEmail());
  assert.equal((await call('GET', '/users/profile', null, data.token)).status, 200);
  await sleep(3000);
  const expired = await call('GET', '/users/profile', null, data.token);
  assert.equal(expired.status, 401);
  assert.equal(expired.data.code, 'TOKEN_EXPIRED');
  const fresh = await call('POST', '/auth/refresh', { refreshToken: data.refreshToken });
  assert.equal(fresh.status, 200);
  assert.notEqual(fresh.data.refreshToken, data.refreshToken);
  assert.equal((await call('GET', '/users/profile', null, fresh.data.token)).status, 200);
});

test('replaying a rotated refresh token (theft) kills the whole session', async () => {
  const { data } = await signup(newEmail());
  const stolen = data.refreshToken;
  const victim = await call('POST', '/auth/refresh', { refreshToken: stolen });
  assert.equal(victim.status, 200);
  // Move the rotation outside the 60 s grace window.
  const sid = stolen.split('.')[0];
  await Session.updateOne({ _id: sid }, { $set: { rotatedAt: new Date(Date.now() - 5 * 60 * 1000) } });

  assert.equal((await call('POST', '/auth/refresh', { refreshToken: stolen })).status, 401);
  const session = await Session.findById(sid);
  assert.equal(session.revokeReason, 'reuse_detected');
  // The legitimate holder is signed out too: both copies are now useless.
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: victim.data.refreshToken })).status, 401);
  assert.equal((await call('GET', '/users/profile', null, victim.data.token)).status, 401);
});

test('logout revokes instantly; logout-all hits every device', async () => {
  const email = newEmail();
  const a = (await signup(email)).data;
  const b = (await call('POST', '/auth/login', { email, password: 'correct-horse-1' })).data;
  const list = await call('GET', '/auth/sessions', null, a.token);
  assert.equal(list.data.sessions.length, 2);

  await call('POST', '/auth/logout', { refreshToken: b.refreshToken });
  assert.equal((await call('GET', '/users/profile', null, b.token)).status, 401);
  assert.equal((await call('GET', '/users/profile', null, a.token)).status, 200);

  await call('POST', '/auth/logout-all', null, a.token);
  assert.equal((await call('GET', '/users/profile', null, a.token)).status, 401);
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: a.refreshToken })).status, 401);
});

test('revocation survives a lost cache (checked in Mongo without Redis)', async () => {
  const { data } = await signup(newEmail());
  const sid = data.refreshToken.split('.')[0];
  // Simulate "revoked, then server restarted": DB says revoked, cache is empty.
  await Session.updateOne({ _id: sid }, { $set: { revokedAt: new Date(), revokeReason: 'revoked' } });
  assert.equal((await call('GET', '/users/profile', null, data.token)).status, 401);
});

test('forged tokens are rejected', async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ userId: 'x', sid: 'y' })}.`;
  assert.equal((await call('GET', '/users/profile', null, none)).status, 401);
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: 'aaaaaaaaaaaaaaaaaaaaaaaa.guess' })).status, 401);
});

test('per-account login throttling', async () => {
  const email = newEmail();
  await signup(email);
  let last;
  for (let i = 0; i < 11; i++) last = await call('POST', '/auth/login', { email, password: `wrong-${i}-xx` });
  assert.equal(last.status, 429);
});

test('password reset: generic reply, one-time code, attempt cap, signs out all devices', async () => {
  const email = newEmail();
  const first = (await signup(email)).data;

  const ghost = await call('POST', '/auth/password/forgot', { email: newEmail() });
  const real = await call('POST', '/auth/password/forgot', { email });
  assert.deepEqual(ghost.data, real.data); // no way to tell which exists
  const mail = sentMail.find((m) => m.to === email);
  const code = mail.text.match(/\b(\d{6})\b/)[1];

  const wrong = await call('POST', '/auth/password/reset', {
    email,
    code: code === '000000' ? '111111' : '000000',
    newPassword: 'brand-new-pass-1',
  });
  assert.equal(wrong.status, 400);

  const ok = await call('POST', '/auth/password/reset', { email, code, newPassword: 'brand-new-pass-1' });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);
  // Old device is out, old password is dead, code can't be reused.
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: first.refreshToken })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email, password: 'correct-horse-1' })).status, 401);
  assert.equal(
    (await call('POST', '/auth/password/reset', { email, code, newPassword: 'another-pass-22' })).status,
    400
  );

  // Five wrong guesses destroy a fresh code.
  const email2 = newEmail();
  await signup(email2);
  await call('POST', '/auth/password/forgot', { email: email2 });
  const code2 = sentMail
    .filter((m) => m.to === email2)
    .pop()
    .text.match(/\b(\d{6})\b/)[1];
  const bad = code2 === '999999' ? '888888' : '999999';
  for (let i = 0; i < 5; i++)
    await call('POST', '/auth/password/reset', { email: email2, code: bad, newPassword: 'brand-new-pass-1' });
  assert.equal(
    (await call('POST', '/auth/password/reset', { email: email2, code: code2, newPassword: 'brand-new-pass-1' }))
      .status,
    400
  );
});

test('change password keeps this device, signs out the others', async () => {
  const email = newEmail();
  const a = (await signup(email)).data;
  const b = (await call('POST', '/auth/login', { email, password: 'correct-horse-1' })).data;
  assert.equal(
    (
      await call(
        'POST',
        '/auth/password/change',
        { currentPassword: 'nope-nope-1', newPassword: 'changed-pass-1' },
        a.token
      )
    ).status,
    401
  );
  const res = await call(
    'POST',
    '/auth/password/change',
    { currentPassword: 'correct-horse-1', newPassword: 'changed-pass-1' },
    a.token
  );
  assert.equal(res.status, 200);
  // Check sessions (not the 2 s test access tokens, which may expire mid-test).
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: a.refreshToken })).status, 200);
  assert.equal((await call('POST', '/auth/refresh', { refreshToken: b.refreshToken })).status, 401);
});

test('security headers are set and the framework is not advertised', async () => {
  const { headers } = await call('GET', '/health');
  assert.equal(headers.get('x-powered-by'), null);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.ok(headers.get('strict-transport-security'));
});

test('profile update: allowlisted, typed and length-limited', async () => {
  const { data } = await signup(newEmail());
  const put = (body) => call('PUT', '/users/profile', body, data.token);
  const ok = await put({
    name: 'Riya K',
    bio: 'Mountains > beaches',
    location: 'Pune',
    role: 'agency',
    isVerified: true,
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.bio, 'Mountains > beaches');
  assert.equal(ok.data.role, 'traveler'); // not changeable here
  assert.equal(ok.data.isVerified, false);
  assert.equal((await put({ bio: 'x'.repeat(161) })).status, 400);
  assert.equal((await put({ name: '  ' })).status, 400);
  assert.equal((await put({ avatar: 'javascript:alert(1)' })).status, 400);
  assert.equal((await put({ name: { $gt: '' } })).status, 400);
});

test('GET /reels/mine returns only my tapes', async () => {
  const a = (await signup(newEmail())).data;
  const b = (await signup(newEmail())).data;
  await call('POST', '/reels', { caption: 'mine', location: 'Goa', mediaUrl: 'https://x/a.mp4' }, a.token);
  await call('POST', '/reels', { caption: 'theirs', location: 'Goa', mediaUrl: 'https://x/b.mp4' }, b.token);
  const mine = (await call('GET', '/reels/mine', null, a.token)).data;
  assert.equal(mine.length, 1);
  assert.equal(mine[0].caption, 'mine');
  assert.equal((await call('GET', '/reels/mine')).status, 401);
});

test('avatar upload: images only, size-capped, and only your own photo can be set', async () => {
  const me = (await signup(newEmail())).data;
  const other = (await signup(newEmail())).data;
  const presign = (body, token = me.token) => call('POST', '/media/avatar-upload-url', body, token);

  assert.equal((await presign({ contentType: 'image/jpeg', size: 1000 }, null)).status, 401);
  assert.equal((await presign({ contentType: 'video/mp4', size: 1000 })).status, 400);
  assert.equal((await presign({ contentType: 'image/jpeg' })).status, 400);
  assert.equal((await presign({ contentType: 'image/jpeg', size: 6 * 1024 * 1024 })).status, 413);
  const ok = await presign({ contentType: 'image/jpeg', size: 120000 });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.uploadUrl && ok.data.publicUrl.includes(`avatars/${me.user._id}/`));

  const put = (avatar, token = me.token) => call('PUT', '/users/profile', { avatar }, token);
  assert.equal((await put(ok.data.publicUrl)).status, 200);
  assert.equal((await put(ok.data.publicUrl, other.token)).status, 400); // someone else's photo
  assert.equal((await put('https://evil.example/x.jpg')).status, 400);
  assert.equal((await put('https://lh3.googleusercontent.com/a/abc')).status, 200); // Google photo
  assert.equal((await put('')).status, 200); // remove
});

test('username is unique and validated; website is normalized', async () => {
  const a = (await signup(newEmail())).data;
  const b = (await signup(newEmail())).data;
  const put = (body, token) => call('PUT', '/users/profile', body, token);
  const handle = `riya.k${Date.now() % 100000}`;
  const ok = await put({ username: `@${handle.toUpperCase()}`, website: 'riya.travel' }, a.token);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.username, handle);
  assert.equal(ok.data.website, 'https://riya.travel');
  assert.equal((await put({ username: handle }, b.token)).status, 409); // taken
  assert.equal((await put({ username: 'ab' }, b.token)).status, 400);
  assert.equal((await put({ username: 'bad name!' }, b.token)).status, 400);
  assert.equal((await put({ username: '.dot' }, b.token)).status, 400);
  assert.equal((await put({ website: 'not a site' }, b.token)).status, 400);
  assert.equal((await put({ website: 'javascript:alert(1)' }, b.token)).status, 400);
  const cleared = await put({ username: '', website: '' }, a.token);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.data.username, undefined);
  assert.equal(cleared.data.website, '');
});
