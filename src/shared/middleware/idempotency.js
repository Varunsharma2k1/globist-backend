/**
 * Idempotency-Key support (HLD: booking + payment endpoints). The first
 * response for a (user, key) pair is stored for 24h and replayed for
 * retries, so a flaky network can't create two bookings.
 * Requires auth to run first.
 */
const { cache } = require('../../infra/redis');

const TTL = 24 * 3600;

module.exports = function idempotency({ required = false } = {}) {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key) {
      return required ? res.status(400).json({ message: 'Idempotency-Key header required' }) : next();
    }
    if (String(key).length > 100) return res.status(400).json({ message: 'Idempotency-Key too long' });

    const storeKey = `idem:${req.user?._id || req.ip}:${req.method}:${req.baseUrl}${req.path}:${key}`;
    const saved = await cache.get(storeKey);
    if (saved?.status) {
      res.setHeader('Idempotent-Replay', 'true');
      return res.status(saved.status).json(saved.body);
    }
    if (!(await cache.setNx(`${storeKey}:lock`, 1, 30))) {
      return res.status(409).json({ message: 'A request with this Idempotency-Key is in progress' });
    }

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 500) cache.set(storeKey, { status: res.statusCode, body }, TTL).catch(() => {});
      cache.del(`${storeKey}:lock`).catch(() => {});
      return json(body);
    };
    next();
  };
};
