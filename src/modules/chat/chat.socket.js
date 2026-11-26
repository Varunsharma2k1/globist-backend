/**
 * Socket.IO gateway for chat.
 *
 * Auth: the app passes its JWT as `auth.token` in the handshake; it's
 * verified once per connection. Each socket joins `user:<id>` so all of a
 * user's devices get events.
 *
 * Client -> server (all take an ack callback `(res) => {}`):
 *   message:send      { conversationId, text, clientId } -> { ok, message } | { ok:false, error }
 *   conversation:read { conversationId }
 *   typing            { conversationId, isTyping }
 * Server -> client:
 *   message:new       { message, conversation }
 *   conversation:read { conversationId, userId, at }
 *   typing            { conversationId, userId, isTyping }
 *   presence          { userId, online }
 */
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../users/user.model');
const { JWT_SECRET } = require('../../shared/middleware/auth');
const chat = require('./chat.service');
const { newBullConnection, enabled: redisEnabled } = require('../../infra/redis');

// userId -> number of open sockets (single-instance presence)
const onlineCounts = new Map();

function attachSocket(httpServer, { origins }) {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: { origin: origins, credentials: true },
  });
  chat.setIO(io);

  // Multi-instance fan-out (HLD: 2→N tasks behind the ALB).
  if (redisEnabled()) {
    const { createAdapter } = require('@socket.io/redis-adapter');
    io.adapter(createAdapter(newBullConnection(), newBullConnection()));
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      const { userId } = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(userId).select('_id name');
      if (!user) return next(new Error('unauthorized'));
      socket.data.userId = String(user._id);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);
    const count = (onlineCounts.get(userId) || 0) + 1;
    onlineCounts.set(userId, count);
    if (count === 1) socket.broadcast.emit('presence', { userId, online: true });

    const handler = (fn) => async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        reply({ ok: true, ...(await fn(payload || {})) });
      } catch (err) {
        reply({ ok: false, error: err.status ? err.message : 'Something went wrong' });
        if (!err.status) console.error('[socket]', err);
      }
    };

    socket.on('message:send', handler(async ({ conversationId, text, clientId }) => {
      const { message } = await chat.sendMessage(conversationId, userId, { text, clientId });
      return { message };
    }));

    socket.on('conversation:read', handler(async ({ conversationId }) =>
      chat.markRead(conversationId, userId)));

    socket.on('typing', handler(async ({ conversationId, isTyping }) => {
      const conv = await chat.getConversationFor(conversationId, userId);
      for (const p of conv.participants) {
        if (String(p._id) !== userId) {
          chat.emitToUser(p._id, 'typing', { conversationId, userId, isTyping: !!isTyping });
        }
      }
      return {};
    }));

    socket.on('presence:query', handler(async ({ userIds = [] }) => ({
      online: userIds.filter((id) => onlineCounts.get(String(id)) > 0),
    })));

    socket.on('disconnect', () => {
      const left = (onlineCounts.get(userId) || 1) - 1;
      if (left <= 0) {
        onlineCounts.delete(userId);
        socket.broadcast.emit('presence', { userId, online: false });
      } else {
        onlineCounts.set(userId, left);
      }
    });
  });

  return io;
}

module.exports = { attachSocket };
