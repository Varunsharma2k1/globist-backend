/**
 * Fixed-window rate limit per user (or IP), backed by Redis when available
 * (HLD: token bucket in Redis; a fixed window is the simple first cut).
 *
 *   router.post('/login', rateLimit({ name: 'auth', max: env.rateLimit.authMax }), ...)
 *   rateLimit({ name: 'login-email', key: (req) => req.body.email })  // per account, not per IP
 */
const env = require('../../config/env');
const { cache } = require('../../infra/redis');

module.exports = function rateLimit({
  name = 'api',
  max = env.rateLimit.max,
  windowSec = env.rateLimit.windowSec,
  key,
} = {}) {
  return async (req, res, next) => {
    try {
      const who = (key && key(req)) || req.user?._id || req.ip;
      const bucket = Math.floor(Date.now() / 1000 / windowSec);
      const bucketKey = `rl:${name}:${who}:${bucket}`;
      const count = await cache.incr(bucketKey, 1, windowSec + 1);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - count));
      if (count > max) {
        res.setHeader('Retry-After', windowSec);
        return res.status(429).json({ message: 'Too many requests, slow down' });
      }
      next();
    } catch (err) {
      console.warn(`[rateLimit] ${name} skipped: ${err.message}`);
      next(); // never block traffic because the limiter's store is down
    }
  };
};
