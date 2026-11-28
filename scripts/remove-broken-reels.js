/**
 * Keeps only tapes whose video is a real upload in our R2 media bucket
 * (served from CDN_BASE_URL or an r2.dev / r2.cloudflarestorage.com URL).
 * Everything else — old seeded demo tapes, sample videos from other sites,
 * local "/uploads/…" paths, tapes with no media — is deleted together with
 * its likes, comments and notifications.
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

// Our media bucket's public address (CDN_BASE_URL), or Cloudflare's own R2 hosts.
function onR2(url) {
  if (typeof url !== 'string') return false;
  const cdn = (env.storage.cdnBaseUrl || '').replace(/\/$/, '');
  if (cdn && url.startsWith(`${cdn}/`)) return true;
  return /^https:\/\/[^/]+\.(r2\.dev|r2\.cloudflarestorage\.com)\//.test(url);
}

async function main() {
  if (!env.mongo.uri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(env.mongo.uri);
  const all = await Reel.find({}, 'caption location mediaUrl createdAt').lean();
  const keep = all.filter((r) => onR2(r.mediaUrl));
  const reels = all.filter((r) => !onR2(r.mediaUrl));
  console.log(`Keeping ${keep.length} tape(s) on R2:`);
  for (const r of keep) console.log(`  ✓ ${r._id}  ${r.location || '-'}  "${(r.caption || '').slice(0, 40)}"`);
  if (!keep.length) {
    console.log('\nNo R2 tapes found — refusing to delete everything. Check CDN_BASE_URL.');
    await mongoose.disconnect();
    return;
  }
  console.log(`\nRemoving ${reels.length} tape(s) not on R2:`);
  for (const r of reels)
    console.log(
      `  ✗ ${r._id}  ${r.location || '-'}  ${r.mediaUrl || '(no media)'}  "${(r.caption || '').slice(0, 40)}"`
    );

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
