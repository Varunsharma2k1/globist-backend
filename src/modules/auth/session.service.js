/**
 * Sessions: short-lived JWT access tokens + rotating opaque refresh tokens.
 *
 *   access token  JWT {userId, sid}, ~15 min, verified statelessly.
 *   refresh token "<sessionId>.<random 256-bit secret>", stored hashed,
 *                 rotated on every use, sliding 90-day expiry (1-year cap).
 *
 * Replaying an already-rotated refresh token (outside a short grace window
 * for lost responses) means it was stolen: the whole session is revoked.
 * Revoked session ids are also pushed to the cache so their still-valid
 * access tokens stop working immediately, not in 15 minutes.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const logger = require('../../infra/logger');
const { cache, enabled: redisEnabled } = require('../../infra/redis');
const { HttpError } = require('../../shared/http');
const Session = require('./session.model');

const JWT_OPTS = { algorithm: 'HS256', issuer: 'triptape-api', audience: 'triptape-app' };
const DAY_MS = 24 * 60 * 60 * 1000;
const ROTATE_GRACE_MS = 60 * 1000;
const REVOKED_KEY = (sid) => `auth:revoked:${sid}`;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sameHash = (a, b) =>
  Boolean(a && b) && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const newSecret = () => crypto.randomBytes(32).toString('base64url');

function signAccessToken(userId, sid) {
  return jwt.sign({ userId: String(userId), sid: String(sid) }, env.auth.jwtSecret, {
    ...JWT_OPTS,
    expiresIn: env.auth.accessTtl,
  });
}

/** Verifies signature, algorithm, issuer, audience and expiry. Throws on failure. */
function verifyAccessToken(token) {
  return jwt.verify(token, env.auth.jwtSecret, { ...JWT_OPTS, algorithms: [JWT_OPTS.algorithm] });
}

/**
 * True if the session behind an access token is gone. With Redis the cache
 * marker is authoritative (shared by all servers, outlives restarts). Without
 * it the in-memory marker would vanish on restart, so ask Mongo instead.
 */
async function isRevoked(sid) {
  if (!sid) return true;
  if (await cache.get(REVOKED_KEY(sid))) return true;
  if (redisEnabled()) return false;
  const live = await Session.exists({ _id: sid, revokedAt: null, expiresAt: { $gt: new Date() } });
  return !live;
}

function deviceFrom(req) {
  const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);
  return {
    platform: clip(req.get('x-client-platform'), 20),
    name: clip(req.get('x-device-name'), 80),
    userAgent: clip(req.get('user-agent'), 200),
    ip: req.ip,
  };
}

function tokenPair(session, secret) {
  const token = signAccessToken(session.user, session._id);
  return {
    token,
    refreshToken: `${session._id}.${secret}`,
    accessTokenExpiresAt: new Date(jwt.decode(token).exp * 1000).toISOString(),
  };
}

function slidingExpiry(session, now) {
  return new Date(Math.min(now + env.auth.refreshTtlDays * DAY_MS, session.absoluteExpiresAt.getTime()));
}

/** Starts a new device session (login / signup / Google). */
async function createSession(user, req) {
  const now = Date.now();
  const secret = newSecret();
  const session = await Session.create({
    user: user._id,
    tokenHash: sha256(secret),
    expiresAt: new Date(now + env.auth.refreshTtlDays * DAY_MS),
    absoluteExpiresAt: new Date(now + env.auth.sessionMaxDays * DAY_MS),
    device: deviceFrom(req),
  });
  return tokenPair(session, secret);
}

function parseRefreshToken(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken.length > 200) return null;
  const [sid, secret, extra] = refreshToken.split('.');
  if (!sid || !secret || extra !== undefined || !/^[a-f0-9]{24}$/.test(sid)) return null;
  return { sid, secret };
}

const invalid = () => new HttpError(401, 'Session expired. Please sign in again.', 'SESSION_INVALID');

/** Exchanges a refresh token for a new pair. The old refresh token stops working. */
async function rotate(refreshToken) {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) throw invalid();
  const presented = sha256(parsed.secret);
  const now = Date.now();

  const session = await Session.findById(parsed.sid);
  if (!session || session.revokedAt || session.expiresAt.getTime() <= now) throw invalid();

  const isCurrent = sameHash(presented, session.tokenHash);
  const isPrevious = !isCurrent && sameHash(presented, session.prevTokenHash);

  if (isPrevious && now - (session.rotatedAt?.getTime() || 0) > ROTATE_GRACE_MS) {
    // A token we already replaced is being used again: someone copied it.
    logger.warn(`[auth] refresh token reuse detected, revoking session ${session._id}`);
    await revokeSession(session, 'reuse_detected');
    throw invalid();
  }
  if (!isCurrent && !isPrevious) throw invalid();

  // Atomic swap: only one concurrent refresh can win for a given hash.
  const secret = newSecret();
  const updated = await Session.findOneAndUpdate(
    { _id: session._id, tokenHash: session.tokenHash, revokedAt: null },
    {
      $set: {
        tokenHash: sha256(secret),
        prevTokenHash: session.tokenHash,
        rotatedAt: new Date(now),
        lastUsedAt: new Date(now),
        expiresAt: slidingExpiry(session, now),
      },
    },
    { new: true }
  );
  if (!updated) throw invalid();
  return tokenPair(updated, secret);
}

async function revokeSession(session, reason) {
  await Session.updateOne({ _id: session._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokeReason: reason } });
  await cache.set(REVOKED_KEY(session._id), 1, env.auth.accessTtlSec + 120);
  require('../chat/chat.service').disconnectSession(String(session._id)); // lazy: avoids a require cycle
}

/** Logout with the refresh token (works even if the access token expired). */
async function revokeByRefreshToken(refreshToken) {
  const parsed = parseRefreshToken(refreshToken);
  if (!parsed) return;
  const session = await Session.findById(parsed.sid);
  const presented = sha256(parsed.secret);
  if (session && (sameHash(presented, session.tokenHash) || sameHash(presented, session.prevTokenHash))) {
    await revokeSession(session, 'logout');
  }
}

async function revokeSessionById(userId, sid, reason = 'revoked') {
  const session = await Session.findOne({ _id: sid, user: userId });
  if (!session) throw new HttpError(404, 'Session not found');
  await revokeSession(session, reason);
}

/** Sign out everywhere (also use after a password change). */
async function revokeAllForUser(userId, { exceptSid, reason = 'logout_all' } = {}) {
  const filter = { user: userId, revokedAt: null };
  if (exceptSid) filter._id = { $ne: exceptSid };
  const sessions = await Session.find(filter).select('_id');
  await Promise.all(sessions.map((s) => revokeSession(s, reason)));
  return sessions.length;
}

async function listActive(userId, currentSid) {
  const sessions = await Session.find({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 })
    .lean();
  return sessions.map((s) => ({
    _id: s._id,
    device: { platform: s.device?.platform, name: s.device?.name },
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    current: String(s._id) === String(currentSid),
  }));
}

module.exports = {
  createSession,
  rotate,
  revokeByRefreshToken,
  revokeSessionById,
  revokeAllForUser,
  listActive,
  signAccessToken,
  verifyAccessToken,
  isRevoked,
};
