const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    reel: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 500 },
  },
  { timestamps: true }
);
commentSchema.index({ reel: 1, createdAt: -1 });

module.exports = mongoose.model('ReelComment', commentSchema);
