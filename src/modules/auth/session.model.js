const mongoose = require('mongoose');

/**
 * One row per signed-in device. The refresh token itself is never stored:
 * only its SHA-256 hash, so a database leak can't be replayed as logins.
 */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true },
    // The hash it replaced, kept briefly to (a) tolerate a lost response and
    // (b) detect a stolen, already-rotated token being replayed.
    prevTokenHash: { type: String },
    rotatedAt: { type: Date },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }, // sliding; renewed on each refresh
    absoluteExpiresAt: { type: Date, required: true }, // hard cap, never extended
    revokedAt: { type: Date },
    revokeReason: {
      type: String,
      enum: ['logout', 'logout_all', 'revoked', 'reuse_detected', 'user_deleted', 'password_changed'],
    },
    device: {
      platform: String,
      name: String,
      userAgent: String,
      ip: String,
    },
  },
  { timestamps: true }
);

// Mongo deletes sessions on their own once fully expired.
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
