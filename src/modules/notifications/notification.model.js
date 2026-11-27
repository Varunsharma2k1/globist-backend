const mongoose = require('mongoose');

/** In-app notifications (the Inbox → Notifications tab). */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // recipient
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who did it (none for system)
    type: { type: String, enum: ['like', 'comment', 'follow', 'booking'], required: true },
    reel: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel' },
    text: { type: String, maxlength: 200, default: '' }, // comment preview / booking title
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
// Old notifications clean themselves up after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model('Notification', notificationSchema);
