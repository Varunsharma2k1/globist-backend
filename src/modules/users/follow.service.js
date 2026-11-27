const mongoose = require('mongoose');
const { HttpError } = require('../../shared/http');
const Follow = require('./follow.model');
const User = require('./user.model');
const Reel = require('../reels/reel.model');
const notifications = require('../notifications/notifications.service');

const PUBLIC_USER = 'name avatar role explorerTier';

const assertId = (id) => {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid user');
};

async function counts(userId) {
  const [followers, following] = await Promise.all([
    Follow.countDocuments({ following: userId }),
    Follow.countDocuments({ follower: userId }),
  ]);
  return { followers, following };
}

/** Public profile card: who they are + real counts (+ whether you follow them). */
async function publicProfile(userId, viewer) {
  assertId(userId);
  const user = await User.findById(userId).select(`${PUBLIC_USER} bio location username website`).lean();
  if (!user) throw new HttpError(404, 'User not found');
  const [c, tapes, followed] = await Promise.all([
    counts(userId),
    Reel.countDocuments({ user: userId, status: { $in: ['ready', null] }, mediaUrl: { $nin: [null, ''] } }),
    viewer ? Follow.exists({ follower: viewer._id, following: userId }) : null,
  ]);
  return { user, ...c, tapes, isFollowing: Boolean(followed) };
}

async function follow(viewer, userId) {
  assertId(userId);
  if (String(viewer._id) === userId) throw new HttpError(400, 'You can’t follow yourself');
  if (!(await User.exists({ _id: userId }))) throw new HttpError(404, 'User not found');
  // Upsert: following twice is harmless.
  await Follow.updateOne(
    { follower: viewer._id, following: userId },
    { $setOnInsert: { follower: viewer._id, following: userId } },
    { upsert: true }
  );
  notifications.record({ user: userId, actor: viewer._id, type: 'follow' });
  return { isFollowing: true, ...(await counts(userId)) };
}

async function unfollow(viewer, userId) {
  assertId(userId);
  await Follow.deleteOne({ follower: viewer._id, following: userId });
  return { isFollowing: false, ...(await counts(userId)) };
}

/** kind 'followers' = who follows userId; 'following' = who userId follows. */
async function list(userId, kind) {
  assertId(userId);
  const side = kind === 'followers' ? 'follower' : 'following';
  const filter = kind === 'followers' ? { following: userId } : { follower: userId };
  const rows = await Follow.find(filter).sort({ createdAt: -1 }).limit(200).populate(side, PUBLIC_USER).lean();
  return rows.map((r) => r[side]).filter(Boolean);
}

async function followingIds(userId) {
  const rows = await Follow.find({ follower: userId }).select('following').limit(5000).lean();
  return rows.map((r) => String(r.following));
}

module.exports = { counts, publicProfile, follow, unfollow, list, followingIds };
