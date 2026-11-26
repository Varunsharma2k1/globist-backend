/** Attaches/propagates X-Request-Id (HLD: request ID · tracing). */
const crypto = require('crypto');

module.exports = function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
