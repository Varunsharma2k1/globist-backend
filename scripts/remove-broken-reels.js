/**
 * Removes tapes whose video isn't a real upload: the old seeded demo tapes
 * (mediaUrl "/uploads/reels/…", which only ever existed on a dev laptop) and
 * tapes with no media at all. Also removes their likes, comments and
 * notifications. Real tapes (R2/CDN https URLs) are never touched.
 *
 *   node scripts/remove-broken-reels.js        # preview only
 *   node scripts/remove-broken-reels.js --yes  # delete
 */
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const Reel = require('../src/modules/reels/reel.model');
const Like = require('../src/modules/reels/like.model');
const ReelComment = require('../src/modules/reels/comment.model');
const Notification = require('../src/modules/notifications/notification.model');

const BROKEN = {
  $or: [{ mediaUrl: { $regex: '^/uploads/' } }, { mediaUrl: { $in: ['', null] } }, { mediaUrl: { $exists: false } }],
};

async function main() {
  if (!env.mongo.uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(env.mongo.uri);
  const reels = await Reel.find(BROKEN, 'caption location mediaUrl createdAt').lean();
  console.log(`Found ${reels.length} broken tape(s):`);
  for (const r of reels)
    console.log(`  ${r._id}  ${r.location || '-'}  ${r.mediaUrl || '(no media)'}  "${(r.caption || '').slice(0, 40)}"`);

  if (!process.argv.includes('--yes')) {
    console.log('\nPreview only. Run again with --yes to delete them.');
  } else if (reels.length) {
    const ids = reels.map((r) => r._id);
    const [likes, comments, notes, gone] = await Promise.all([
      Like.deleteMany({ reel: { $in: ids } }),
      ReelComment.deleteMany({ reel: { $in: ids } }),
      Notification.deleteMany({ reel: { $in: ids } }),
      Reel.deleteMany({ _id: { $in: ids } }),
    ]);
    console.log(
      `\nDeleted ${gone.deletedCount} tapes, ${likes.deletedCount} likes, ${comments.deletedCount} comments, ${notes.deletedCount} notifications.`
    );
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
