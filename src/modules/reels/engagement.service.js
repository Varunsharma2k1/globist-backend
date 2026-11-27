/**
 * Likes and comments on tapes. Counters on the reel (`likes`, `comments`)
 * change only when a row is really added/removed, so they never drift.
 */
const mongoose = require('mongoose');
const { HttpError } = require('../../shared/http');
const Reel = require('./reel.model');
const Like = require('./like.model');
const Comment = require('./comment.model');
const notifications = require('../notifications/notifications.service');

const PUBLIC_USER = 'name avatar username';

async function reelOrThrow(reelId) {
  if (typeof reelId !== 'string' || !mongoose.isValidObjectId(reelId)) throw new HttpError(400, 'Invalid tape');
  const reel = await Reel.findById(reelId).select('user likes comments').lean();
  if (!reel) throw new HttpError(404, 'Tape not found');
  return reel;
}

async function like(user, reelId) {
  const reel = await reelOrThrow(reelId);
  const res = await Like.updateOne(
    { user: user._id, reel: reel._id },
    { $setOnInsert: { user: user._id, reel: reel._id } },
    { upsert: true }
  );
  if (res.upsertedCount) {
    await Reel.updateOne({ _id: reel._id }, { $inc: { likes: 1 } });
    notifications.record({ user: reel.user, actor: user._id, type: 'like', reel: reel._id });
  }
  const { likes } = await Reel.findById(reel._id).select('likes').lean();
  return { liked: true, likes };
}

async function unlike(user, reelId) {
  const reel = await reelOrThrow(reelId);
  const { deletedCount } = await Like.deleteOne({ user: user._id, reel: reel._id });
  if (deletedCount) {
    await Reel.updateOne({ _id: reel._id, likes: { $gt: 0 } }, { $inc: { likes: -1 } });
  }
  const { likes } = await Reel.findById(reel._id).select('likes').lean();
  return { liked: false, likes };
}

/** Ids of tapes I liked (most recent first), so hearts show filled. */
async function likedIds(userId) {
  const rows = await Like.find({ user: userId }).sort({ createdAt: -1 }).limit(2000).select('reel').lean();
  return rows.map((r) => String(r.reel));
}

async function listComments(reelId, { before, limit = 30 } = {}) {
  await reelOrThrow(reelId);
  const filter = { reel: reelId };
  const cursor = before ? new Date(before) : null;
  if (cursor && !Number.isNaN(cursor.getTime())) filter.createdAt = { $lt: cursor };
  return Comment.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 30, 50))
    .populate('user', PUBLIC_USER)
    .lean();
}

async function addComment(user, reelId, rawText) {
  const reel = await reelOrThrow(reelId);
  const text = typeof rawText === 'string' ? rawText.trim() : '';
  if (!text) throw new HttpError(400, 'Write something first');
  if (text.length > 500) throw new HttpError(400, 'Keep it under 500 characters');
  const comment = await Comment.create({ reel: reel._id, user: user._id, text });
  await Reel.updateOne({ _id: reel._id }, { $inc: { comments: 1 } });
  notifications.record({ user: reel.user, actor: user._id, type: 'comment', reel: reel._id, text });
  return Comment.findById(comment._id).populate('user', PUBLIC_USER).lean();
}

/** Authors can delete their own comment; tape owners can delete any on their tape. */
async function deleteComment(user, commentId) {
  if (!mongoose.isValidObjectId(commentId)) throw new HttpError(400, 'Invalid comment');
  const comment = await Comment.findById(commentId).lean();
  if (!comment) throw new HttpError(404, 'Comment not found');
  const reel = await Reel.findById(comment.reel).select('user').lean();
  const allowed = String(comment.user) === String(user._id) || String(reel?.user) === String(user._id);
  if (!allowed) throw new HttpError(403, 'You can only delete your own comments');
  await Comment.deleteOne({ _id: comment._id });
  await Reel.updateOne({ _id: comment.reel, comments: { $gt: 0 } }, { $inc: { comments: -1 } });
}

module.exports = { like, unlike, likedIds, listComments, addComment, deleteComment };
