/**
 * Re-run the transcode for existing reels (e.g. after improving the FFmpeg
 * settings). Uses each reel's original upload in the raw bucket, which the
 * R2 lifecycle keeps for 1 day.
 *
 *   node scripts/retranscode.js <reelId> [<reelId> ...]
 *   node scripts/retranscode.js --all-hls      every reel that has an HLS stream
 */
const mongoose = require('mongoose');
const { connectDB } = require('../src/infra/mongo');
const Reel = require('../src/modules/reels/reel.model');
const { processTranscodeJob } = require('../src/modules/media/transcode.job');

(async () => {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('usage: node scripts/retranscode.js <reelId...> | --all-hls');
    process.exit(1);
  }
  await connectDB();
  const filter = args[0] === '--all-hls' ? { hlsUrl: { $exists: true, $ne: null } } : { _id: { $in: args } };
  const reels = await Reel.find(filter).select('_id caption rawKey');
  for (const reel of reels) {
    if (!reel.rawKey) {
      console.log(`skip ${reel._id} (${reel.caption}): no original upload recorded`);
      continue;
    }
    try {
      await processTranscodeJob({ data: { reelId: String(reel._id), key: reel.rawKey, force: true } });
      console.log(`ok   ${reel._id} (${reel.caption})`);
    } catch (err) {
      console.log(`fail ${reel._id} (${reel.caption}): ${err.message.slice(0, 200)}`);
    }
  }
  await mongoose.disconnect();
})();
