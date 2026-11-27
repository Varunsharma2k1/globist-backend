const express = require('express');
const { auth, optionalAuth } = require('../../shared/middleware/auth');
const rateLimit = require('../../shared/middleware/rateLimit');
const { asyncHandler } = require('../../shared/http');
const communities = require('./communities.service');

const router = express.Router();
const limitPost = rateLimit({ name: 'community-post', max: 5 });
const limitComment = rateLimit({ name: 'community-comment', max: 15 });
const limitVote = rateLimit({ name: 'community-vote', max: 120 });
const limitJoin = rateLimit({ name: 'community-join', max: 30 });

// GET /api/communities/stats -> { slug: { members, online } }
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json(await communities.memberStats());
  })
);

// GET /api/communities/mine -> ['slug', ...]
router.get(
  '/mine',
  auth,
  asyncHandler(async (req, res) => {
    res.json(await communities.joinedSlugs(req.user._id));
  })
);

router.put(
  '/:slug/join',
  auth,
  limitJoin,
  asyncHandler(async (req, res) => {
    res.json(await communities.join(req.user, req.params.slug));
  })
);
router.delete(
  '/:slug/join',
  auth,
  limitJoin,
  asyncHandler(async (req, res) => {
    res.json(await communities.leave(req.user, req.params.slug));
  })
);

// Posts
router.get(
  '/:slug/posts',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(await communities.listPosts(req.params.slug, req.user?._id));
  })
);
router.post(
  '/:slug/posts',
  auth,
  limitPost,
  asyncHandler(async (req, res) => {
    res.status(201).json(await communities.createPost(req.user, req.params.slug, req.body));
  })
);
router.get(
  '/posts/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(await communities.getPost(req.params.id, req.user?._id));
  })
);
router.post(
  '/posts/:id/comments',
  auth,
  limitComment,
  asyncHandler(async (req, res) => {
    res.status(201).json(await communities.addComment(req.user, req.params.id, req.body?.text));
  })
);
router.put(
  '/posts/:id/vote',
  auth,
  limitVote,
  asyncHandler(async (req, res) => {
    res.json(await communities.vote(req.user, req.params.id, req.body?.value));
  })
);

module.exports = router;
