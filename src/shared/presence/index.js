/**
 * Who is online right now — one place for every module to ask.
 *
 * Today: an in-process map filled by the chat socket (a user is online while
 * at least one of their devices has the app open). Single server instance.
 *
 * Scaling later (several instances behind the load balancer): swap the
 * three functions below for a Redis-backed version, e.g. a key per user
 * `presence:<id>` with a 60 s TTL refreshed by a socket heartbeat, and
 * `onlineUserIds()` -> SCAN/SMEMBERS. Callers don't change.
 */
const counts = new Map(); // userId -> open sockets

/** A device connected. Returns true if the user just came online. */
function connected(userId) {
  const n = (counts.get(userId) || 0) + 1;
  counts.set(userId, n);
  return n === 1;
}

/** A device disconnected. Returns true if the user just went offline. */
function disconnected(userId) {
  const n = (counts.get(userId) || 1) - 1;
  if (n <= 0) {
    counts.delete(userId);
    return true;
  }
  counts.set(userId, n);
  return false;
}

const isOnline = (userId) => (counts.get(String(userId)) || 0) > 0;
const onlineUserIds = () => [...counts.keys()];

module.exports = { connected, disconnected, isOnline, onlineUserIds };
