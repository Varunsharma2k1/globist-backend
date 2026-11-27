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
const { userFromToken } = require('../../shared/middleware/auth');
const chat = require('./chat.service');
const { newBullConnection, enabled: redisEnabled } = require('../../infra/redis');

const presence = require('../../shared/presence');

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
      const { user, sid } = await userFromToken(token);
      socket.data.userId = String(user._id);
      socket.data.sid = sid;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`user:${userId}`);
    socket.join(`session:${socket.data.sid}`); // kicked when that session is revoked
    if (presence.connected(userId)) socket.broadcast.emit('presence', { userId, online: true });

    const handler = (fn) => async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        reply({ ok: true, ...(await fn(payload || {})) });
      } catch (err) {
        reply({ ok: false, error: err.status ? err.message : 'Something went wrong' });
        if (!err.status) console.error('[socket]', err);
      }
    };

    socket.on(
      'message:send',
      handler(async ({ conversationId, text, clientId }) => {
        const { message } = await chat.sendMessage(conversationId, userId, { text, clientId });
        return { message };
      })
    );

    socket.on(
      'conversation:read',
      handler(async ({ conversationId }) => chat.markRead(conversationId, userId))
    );

    socket.on(
      'typing',
      handler(async ({ conversationId, isTyping }) => {
        const conv = await chat.getConversationFor(conversationId, userId);
        for (const p of conv.participants) {
          if (String(p._id) !== userId) {
            chat.emitToUser(p._id, 'typing', { conversationId, userId, isTyping: !!isTyping });
          }
        }
        return {};
      })
    );

    socket.on(
      'presence:query',
      handler(async ({ userIds = [] }) => ({
        online: (Array.isArray(userIds) ? userIds.slice(0, 200) : []).filter(presence.isOnline),
      }))
    );

    socket.on('disconnect', () => {
      if (presence.disconnected(userId)) socket.broadcast.emit('presence', { userId, online: false });
    });
  });

  return io;
}

module.exports = { attachSocket };
