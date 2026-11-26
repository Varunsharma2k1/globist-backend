const mongoose = require('mongoose');

/**
 * A 1:1 conversation between two users. `pairKey` (sorted participant ids)
 * makes find-or-create race-safe via a unique index. When one side is an
 * agency, `agency` records which agency the thread is about so the inbox can
 * show the agency's name instead of its owner account.
 */
const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
  pairKey: { type: String, required: true, unique: true },
  agency: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency' },
  lastMessage: {
    text: String,
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: Date,
  },
  // userId -> unread message count
  unread: { type: Map, of: Number, default: {} },
  // userId -> last time that user read the thread
  lastReadAt: { type: Map, of: Date, default: {} },
}, { timestamps: true });

conversationSchema.index({ participants: 1, updatedAt: -1 });

conversationSchema.statics.pairKeyFor = (a, b) => [String(a), String(b)].sort().join(':');

module.exports = mongoose.model('Conversation', conversationSchema);
