const mongoose = require('mongoose');

/** One row per (user, reel) like. The unique index makes double-likes impossible. */
const likeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reel: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel', required: true },
  },
  { timestamps: true }
);
likeSchema.index({ user: 1, reel: 1 }, { unique: true });
likeSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Like', likeSchema);
