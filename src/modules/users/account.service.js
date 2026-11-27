/**
 * Account deletion. Removes the person and what they created; keeps
 * bookings/payments (needed for accounting and tax records) but they no
 * longer point at a live account.
 */
const logger = require('../../infra/logger');
const User = require('./user.model');
const Follow = require('./follow.model');
const Reel = require('../reels/reel.model');
const Review = require('../reviews/review.model');
const sessions = require('../auth/session.service');
const communities = require('../communities/communities.service');

async function deleteAccount(userId) {
  // Sign out everywhere first, so no device keeps a working session.
  await sessions.revokeAllForUser(userId, { reason: 'user_deleted' });
  const [reels, follows, reviews] = await Promise.all([
    Reel.deleteMany({ user: userId }),
    Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
    Review.deleteMany({ user: userId }),
  ]);
  await communities.removeUserData(userId);
  await User.deleteOne({ _id: userId });
  logger.info('account deleted', {
    userId: String(userId),
    reels: reels.deletedCount,
    follows: follows.deletedCount,
    reviews: reviews.deletedCount,
  });
}

module.exports = { deleteAccount };
