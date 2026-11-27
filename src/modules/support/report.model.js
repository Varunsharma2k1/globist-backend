const mongoose = require('mongoose');

/** "Report a problem" submissions, reviewed by the team. */
const reportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for guests
    category: { type: String, enum: ['bug', 'payment', 'booking', 'account', 'content', 'other'], required: true },
    message: { type: String, required: true, minlength: 10, maxlength: 2000 },
    email: { type: String, maxlength: 254 }, // where to reply (guests)
    platform: { type: String, enum: ['android', 'ios', 'web', 'unknown'], default: 'unknown' },
    appVersion: { type: String, maxlength: 20 },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open', index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', reportSchema);
