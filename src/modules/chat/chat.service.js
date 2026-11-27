/**
 * Chat domain logic shared by the REST routes and the Socket.IO gateway, so a
 * message sent either way is stored and fanned out identically.
 *
 * Realtime fan-out goes to per-user rooms (`user:<id>`), so every device a
 * user has open receives events. With a single server process the in-memory
 * adapter is enough; when running several instances, plug in
 * @socket.io/redis-adapter (the HLD's Redis) and nothing else changes.
 */
const mongoose = require('mongoose');
const Conversation = require('./conversation.model');
const Message = require('./message.model');
const User = require('../users/user.model');
const Agency = require('../trips/agency.model');
const notifications = require('../notifications/notifications.service');

let io = null;
const setIO = (instance) => {
  io = instance;
};
/** Drops live sockets of a revoked session (works across instances via the Redis adapter). */
const disconnectSession = (sid) => {
  io?.in(`session:${sid}`).disconnectSockets(true);
};
const emitToUser = (userId, event, payload) => {
  if (io) io.to(`user:${userId}`).emit(event, payload);
};

const httpError = (status, message) => Object.assign(new Error(message), { status });
const isId = (v) => mongoose.isValidObjectId(v);

const USER_FIELDS = 'name avatar role explorerTier isVerified';

/** Shapes a conversation for one viewer: the other person, their unread count. */
function serializeConversation(conv, viewerId) {
  const me = String(viewerId);
  const other = conv.participants.find((p) => String(p._id || p) !== me) || {};
  const agency = conv.agency && conv.agency.name ? conv.agency : null;
  return {
    _id: conv._id,
    other: {
      _id: other._id,
      name: agency ? agency.name : other.name,
      avatar: other.avatar || '',
      role: agency ? 'agency' : other.role,
      // Blue tick = an approved agency only. A user's isVerified just means
      // their email is confirmed; showing it as a badge would let anyone look official.
      isVerified: agency ? Boolean(agency.isVerified) : false,
    },
    agency: agency ? { _id: agency._id, name: agency.name } : null,
    lastMessage: conv.lastMessage?.createdAt ? conv.lastMessage : null,
    unread: conv.unread?.get(me) || 0,
    otherLastReadAt: conv.lastReadAt?.get(String(other._id)) || null,
    updatedAt: conv.updatedAt,
  };
}

async function loadConversation(id) {
  return Conversation.findById(id).populate('participants', USER_FIELDS).populate('agency', 'name isVerified');
}

/** Throws unless `userId` is in the conversation. */
async function getConversationFor(conversationId, userId) {
  if (!isId(conversationId)) throw httpError(404, 'Conversation not found');
  const conv = await loadConversation(conversationId);
  if (!conv || !conv.participants.some((p) => String(p._id) === String(userId))) {
    throw httpError(404, 'Conversation not found');
  }
  return conv;
}

async function listConversations(userId) {
  const convs = await Conversation.find({ participants: userId })
    .sort({ updatedAt: -1 })
    .limit(100)
    .populate('participants', USER_FIELDS)
    .populate('agency', 'name isVerified');
  return convs.map((c) => serializeConversation(c, userId));
}

/**
 * Resolves who `me` wants to talk to. An agency is reached through its owner
 * account; seeded agencies have no owner yet, so one is created on first
 * contact (an agency-role user that can later be claimed/logged into).
 */
async function resolveRecipient({ userId, agencyId }) {
  if (agencyId) {
    if (!isId(agencyId)) throw httpError(404, 'Agency not found');
    const agency = await Agency.findById(agencyId);
    if (!agency) throw httpError(404, 'Agency not found');
    if (!agency.owner || !(await User.exists({ _id: agency.owner }))) {
      const owner = await User.create({
        name: agency.name,
        role: 'agency',
        password: new mongoose.Types.ObjectId().toString(),
        isVerified: agency.isVerified,
      });
      agency.owner = owner._id;
      await agency.save();
    }
    return { recipientId: agency.owner, agencyId: agency._id };
  }
  if (!isId(userId) || !(await User.exists({ _id: userId }))) {
    throw httpError(404, 'User not found');
  }
  return { recipientId: userId, agencyId: null };
}

async function findOrCreateConversation(meId, target) {
  const { recipientId, agencyId } = await resolveRecipient(target);
  if (String(recipientId) === String(meId)) throw httpError(400, "You can't message yourself");

  const pairKey = Conversation.pairKeyFor(meId, recipientId);
  // Upsert keeps this race-safe if both users open the thread at once.
  const conv = await Conversation.findOneAndUpdate(
    { pairKey },
    {
      $setOnInsert: { participants: [meId, recipientId], pairKey },
      ...(agencyId ? { $set: { agency: agencyId } } : {}),
    },
    { upsert: true, new: true }
  );
  return serializeConversation(await loadConversation(conv._id), meId);
}

async function listMessages(conversationId, userId, { before, limit = 30 } = {}) {
  await getConversationFor(conversationId, userId);
  const q = { conversation: conversationId };
  if (before && !Number.isNaN(Date.parse(before))) q.createdAt = { $lt: new Date(before) };
  const size = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const msgs = await Message.find(q)
    .sort({ createdAt: -1 })
    .limit(size + 1)
    .lean();
  const hasMore = msgs.length > size;
  // Oldest first for rendering.
  return { messages: msgs.slice(0, size).reverse(), hasMore };
}

async function sendMessage(conversationId, senderId, { text, clientId } = {}) {
  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) throw httpError(400, 'Message text is required');
  if (body.length > 4000) throw httpError(400, 'Message is too long');

  const conv = await getConversationFor(conversationId, senderId);
  const cid = typeof clientId === 'string' && clientId ? clientId.slice(0, 64) : undefined;

  // Idempotent retry: same clientId from same sender returns the stored copy.
  if (cid) {
    const existing = await Message.findOne({ conversation: conv._id, sender: senderId, clientId: cid }).lean();
    if (existing) return { message: existing, duplicate: true };
  }

  let message;
  try {
    message = (
      await Message.create({ conversation: conv._id, sender: senderId, text: body, clientId: cid })
    ).toObject();
  } catch (err) {
    if (err.code === 11000 && cid) {
      return {
        message: await Message.findOne({ conversation: conv._id, sender: senderId, clientId: cid }).lean(),
        duplicate: true,
      };
    }
    throw err;
  }

  const inc = {};
  for (const p of conv.participants) {
    if (String(p._id) !== String(senderId)) inc[`unread.${p._id}`] = 1;
  }
  const updated = await Conversation.findByIdAndUpdate(
    conv._id,
    {
      $set: {
        lastMessage: { text: body, sender: senderId, createdAt: message.createdAt },
        [`lastReadAt.${senderId}`]: message.createdAt,
        [`unread.${senderId}`]: 0,
      },
      $inc: inc,
    },
    { new: true }
  )
    .populate('participants', USER_FIELDS)
    .populate('agency', 'name isVerified');

  for (const p of updated.participants) {
    emitToUser(p._id, 'message:new', {
      message,
      conversation: serializeConversation(updated, p._id),
    });
  }
  const sender = updated.participants.find((p) => String(p._id) === String(senderId));
  for (const p of updated.participants) {
    if (String(p._id) === String(senderId)) continue;
    // Push for when the app is backgrounded; the app ignores it in the open thread.
    notifications
      .notify(p._id, {
        title: sender?.name || 'New message',
        body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
        data: { type: 'chat', conversationId: String(conv._id) },
      })
      .catch(() => {});
  }
  return { message, duplicate: false };
}

async function markRead(conversationId, userId) {
  const conv = await getConversationFor(conversationId, userId);
  const at = new Date();
  await Conversation.updateOne({ _id: conv._id }, { $set: { [`unread.${userId}`]: 0, [`lastReadAt.${userId}`]: at } });
  for (const p of conv.participants) {
    emitToUser(p._id, 'conversation:read', { conversationId: String(conv._id), userId: String(userId), at });
  }
  return { at };
}

async function unreadTotal(userId) {
  const convs = await Conversation.find({ participants: userId }, 'unread').lean();
  return convs.reduce((sum, c) => sum + (c.unread?.[String(userId)] || 0), 0);
}

module.exports = {
  setIO,
  disconnectSession,
  emitToUser,
  getConversationFor,
  listConversations,
  findOrCreateConversation,
  listMessages,
  sendMessage,
  markRead,
  unreadTotal,
};
