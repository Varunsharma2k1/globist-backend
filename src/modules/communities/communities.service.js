/**
 * Communities: membership, posts, comments and votes, shared by every device.
 * The community catalogue (names, covers) ships in the app; the server only
 * accepts the known slugs below so nobody can invent communities.
 */
const mongoose = require('mongoose');
const { HttpError } = require('../../shared/http');
const presence = require('../../shared/presence');
const { CommunityMember, CommunityPost, CommunityComment, CommunityVote } = require('./community.models');

const SLUGS = new Set([
  'kedarkantha-club',
  'offbeat-himalaya',
  'solo-trippies',
  'spiti-riders',
  'homestay-hunters',
  'monsoon-trails',
  'frames-himalaya',
]);
const FLAIRS = new Set(['Question', 'Trek Report', 'Photo', 'Tips', 'Hidden gem', 'Meet-up']);
const PUBLIC_USER = 'name username avatar';
const LIMITS = { title: 200, body: 5000, comment: 1000 };

const assertSlug = (slug) => {
  if (!SLUGS.has(slug)) throw new HttpError(404, 'Community not found');
};
const assertId = (id) => {
  if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid post');
};
const cleanText = (v, max, what, required = true) => {
  const t = typeof v === 'string' ? v.trim() : '';
  if (required && !t) throw new HttpError(400, `${what} is required`);
  if (t.length > max) throw new HttpError(400, `${what} must be under ${max} characters`);
  return t;
};

function shape(post, myVotes, viewerId) {
  return {
    ...post,
    userVote: myVotes.get(String(post._id)) || 0,
    isMine: viewerId ? String(post.user?._id || post.user) === String(viewerId) : false,
  };
}

async function votesFor(viewerId, postIds) {
  if (!viewerId || !postIds.length) return new Map();
  const rows = await CommunityVote.find({ user: viewerId, post: { $in: postIds } }).lean();
  return new Map(rows.map((r) => [String(r.post), r.value]));
}

/**
 * Real numbers per community: { slug: { members, online } }.
 * members = people who joined; online = those members with the app open now
 * (from shared/presence, so it scales with it).
 */
async function memberStats() {
  const ids = presence.onlineUserIds().filter((id) => mongoose.isValidObjectId(id));
  const [all, live] = await Promise.all([
    CommunityMember.aggregate([{ $group: { _id: '$community', n: { $sum: 1 } } }]),
    ids.length
      ? CommunityMember.aggregate([
          { $match: { user: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
          { $group: { _id: '$community', n: { $sum: 1 } } },
        ])
      : [],
  ]);
  const out = Object.fromEntries([...SLUGS].map((s) => [s, { members: 0, online: 0 }]));
  for (const r of all) if (out[r._id]) out[r._id].members = r.n;
  for (const r of live) if (out[r._id]) out[r._id].online = r.n;
  return out;
}

async function joinedSlugs(userId) {
  return (await CommunityMember.find({ user: userId }).lean()).map((m) => m.community);
}

async function join(user, slug) {
  assertSlug(slug);
  await CommunityMember.updateOne(
    { user: user._id, community: slug },
    { $setOnInsert: { user: user._id, community: slug } },
    { upsert: true }
  );
  return { joined: true };
}

async function leave(user, slug) {
  assertSlug(slug);
  await CommunityMember.deleteOne({ user: user._id, community: slug });
  return { joined: false };
}

async function listPosts(slug, viewerId) {
  assertSlug(slug);
  const posts = await CommunityPost.find({ community: slug })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('user', PUBLIC_USER)
    .lean();
  const mine = await votesFor(
    viewerId,
    posts.map((p) => p._id)
  );
  return posts.map((p) => shape(p, mine, viewerId));
}

async function createPost(user, slug, body = {}) {
  assertSlug(slug);
  if (!(await CommunityMember.exists({ user: user._id, community: slug }))) {
    throw new HttpError(403, 'Join the community to post');
  }
  const post = await CommunityPost.create({
    community: slug,
    user: user._id,
    title: cleanText(body.title, LIMITS.title, 'Title'),
    body: cleanText(body.body, LIMITS.body, 'Post', false),
    flair: FLAIRS.has(body.flair) ? body.flair : '',
  });
  const full = await CommunityPost.findById(post._id).populate('user', PUBLIC_USER).lean();
  return shape(full, new Map(), user._id);
}

async function getPost(postId, viewerId) {
  assertId(postId);
  const post = await CommunityPost.findById(postId).populate('user', PUBLIC_USER).lean();
  if (!post) throw new HttpError(404, 'Post not found');
  const comments = await CommunityComment.find({ post: postId })
    .sort({ createdAt: 1 })
    .limit(500)
    .populate('user', PUBLIC_USER)
    .lean();
  const mine = await votesFor(viewerId, [post._id]);
  return {
    ...shape(post, mine, viewerId),
    comments: comments.map((c) => ({ ...c, isMine: String(c.user?._id) === String(viewerId) })),
  };
}

async function addComment(user, postId, text) {
  assertId(postId);
  const clean = cleanText(text, LIMITS.comment, 'Comment');
  if (!(await CommunityPost.exists({ _id: postId }))) throw new HttpError(404, 'Post not found');
  const c = await CommunityComment.create({ post: postId, user: user._id, text: clean });
  await CommunityPost.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });
  const full = await CommunityComment.findById(c._id).populate('user', PUBLIC_USER).lean();
  return { ...full, isMine: true };
}

/**
 * value: 1, -1 or 0 (clear). The score is recounted from the vote rows
 * (ups minus downs), so it is always exact and repeats are harmless.
 */
async function vote(user, postId, value) {
  assertId(postId);
  const v = Number(value);
  if (![1, -1, 0].includes(v)) throw new HttpError(400, 'Vote must be 1, -1 or 0');
  if (!(await CommunityPost.exists({ _id: postId }))) throw new HttpError(404, 'Post not found');

  if (v === 0) await CommunityVote.deleteOne({ user: user._id, post: postId });
  else await CommunityVote.updateOne({ user: user._id, post: postId }, { $set: { value: v } }, { upsert: true });

  const [agg] = await CommunityVote.aggregate([
    { $match: { post: new mongoose.Types.ObjectId(postId) } },
    { $group: { _id: null, score: { $sum: '$value' } } },
  ]);
  const score = agg?.score || 0;
  await CommunityPost.updateOne({ _id: postId }, { $set: { score } });
  return { score, userVote: v };
}

/** Account deletion: their posts (with replies + votes), comments, votes, memberships. */
async function removeUserData(userId) {
  const posts = (await CommunityPost.find({ user: userId }, '_id').lean()).map((p) => p._id);
  await Promise.all([
    CommunityComment.deleteMany({ $or: [{ user: userId }, { post: { $in: posts } }] }),
    CommunityVote.deleteMany({ $or: [{ user: userId }, { post: { $in: posts } }] }),
    CommunityMember.deleteMany({ user: userId }),
  ]);
  await CommunityPost.deleteMany({ _id: { $in: posts } });
}

module.exports = {
  memberStats,
  joinedSlugs,
  join,
  leave,
  listPosts,
  createPost,
  getPost,
  addComment,
  vote,
  removeUserData,
};
