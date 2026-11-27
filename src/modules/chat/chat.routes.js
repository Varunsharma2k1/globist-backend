const express = require('express');
const router = express.Router();
const { auth } = require('../../shared/middleware/auth');
const chat = require('./chat.service');

router.use(auth);

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// GET /api/chat/conversations
router.get(
  '/conversations',
  wrap(async (req, res) => {
    res.json({ conversations: await chat.listConversations(req.user._id) });
  })
);

// GET /api/chat/unread
router.get(
  '/unread',
  wrap(async (req, res) => {
    res.json({ unread: await chat.unreadTotal(req.user._id) });
  })
);

// POST /api/chat/conversations  { userId } | { agencyId }
router.post(
  '/conversations',
  wrap(async (req, res) => {
    const { userId, agencyId } = req.body || {};
    res.json({ conversation: await chat.findOrCreateConversation(req.user._id, { userId, agencyId }) });
  })
);

// GET /api/chat/conversations/:id/messages?before=<iso>&limit=30
router.get(
  '/conversations/:id/messages',
  wrap(async (req, res) => {
    res.json(await chat.listMessages(req.params.id, req.user._id, req.query));
  })
);

// POST /api/chat/conversations/:id/messages  { text, clientId }
// REST fallback for sending (also the only path on serverless hosts).
router.post(
  '/conversations/:id/messages',
  wrap(async (req, res) => {
    const { message } = await chat.sendMessage(req.params.id, req.user._id, req.body);
    res.status(201).json({ message });
  })
);

// POST /api/chat/conversations/:id/read
router.post(
  '/conversations/:id/read',
  wrap(async (req, res) => {
    res.json(await chat.markRead(req.params.id, req.user._id));
  })
);

module.exports = router;
