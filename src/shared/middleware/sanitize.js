/**
 * Blocks NoSQL operator injection: drops any key that starts with "$" or
 * contains "." from body, query and params, at any depth. Without this,
 * `{"email": {"$ne": null}}` would turn a lookup into "match anyone".
 * Mongo operators are only ever written by our own code, never taken from input.
 */
const MAX_DEPTH = 10;

function clean(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return;
  for (const key of Object.keys(value)) {
    if (
      key.startsWith('$') ||
      key.includes('.') ||
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    ) {
      delete value[key];
    } else {
      clean(value[key], depth + 1);
    }
  }
}

module.exports = function sanitize(req, res, next) {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
};
