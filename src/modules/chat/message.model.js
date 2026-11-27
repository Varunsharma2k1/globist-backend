const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
    // Client-generated id: lets the app match its optimistic bubble to the
    // saved message, and makes retries idempotent (no duplicate on resend).
    clientId: { type: String },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, sender: 1, clientId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Message', messageSchema);
