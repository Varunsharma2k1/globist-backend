const mongoose = require('mongoose');

/**
 * A visitor's comment on an agency profile (the "Reviews" tab).
 * `verifiedTraveller` is set by the server when the author has a real
 * booking with that agency, so readers can tell customers from browsers.
 */
const reviewSchema = new mongoose.Schema(
  {
    agency: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
    verifiedTraveller: { type: Boolean, default: false },
    // Soft-hide for moderation later (reported / removed) without losing history.
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Newest-first listing per agency, and "my reviews" lookups.
reviewSchema.index({ agency: 1, hidden: 1, createdAt: -1 });
reviewSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
