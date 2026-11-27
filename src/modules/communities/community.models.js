const mongoose = require('mongoose');
const { Schema } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name, required: true });

/** A user's membership of one community (communities are identified by slug). */
const memberSchema = new Schema(
  { user: ref('User'), community: { type: String, required: true } },
  { timestamps: true }
);
memberSchema.index({ user: 1, community: 1 }, { unique: true });
memberSchema.index({ community: 1 });

const postSchema = new Schema(
  {
    community: { type: String, required: true },
    user: ref('User'),
    title: { type: String, required: true },
    body: { type: String, default: '' },
    flair: { type: String, default: '' },
    score: { type: Number, default: 0 }, // ups minus downs, recounted on every vote
    commentCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
postSchema.index({ community: 1, createdAt: -1 });

const commentSchema = new Schema(
  { post: ref('CommunityPost'), user: ref('User'), text: { type: String, required: true } },
  { timestamps: true }
);
commentSchema.index({ post: 1, createdAt: 1 });

/** One vote per user per post: +1 or -1 (removing a vote deletes the row). */
const voteSchema = new Schema(
  { post: ref('CommunityPost'), user: ref('User'), value: { type: Number, enum: [1, -1], required: true } },
  { timestamps: true }
);
voteSchema.index({ user: 1, post: 1 }, { unique: true });

module.exports = {
  CommunityMember: mongoose.model('CommunityMember', memberSchema),
  CommunityPost: mongoose.model('CommunityPost', postSchema),
  CommunityComment: mongoose.model('CommunityComment', commentSchema),
  CommunityVote: mongoose.model('CommunityVote', voteSchema),
};
