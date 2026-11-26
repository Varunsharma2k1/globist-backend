/**
 * Transcode worker (HLD: FFmpeg -> HLS 240/480/720p + thumbnail).
 *
 * If `ffmpeg` is on PATH it produces HLS renditions and a thumbnail in the
 * media bucket. Otherwise it "passes through": copies the original into
 * media/ and marks the reel ready with an MP4 mediaUrl — so uploads work in
 * dev without FFmpeg installed. Images always pass through.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { pipeline } = require('stream/promises');
const storage = require('../../infra/storage');
const logger = require('../../infra/logger');
const Reel = require('../reels/reel.model');

const RENDITIONS = [
  { name: '240p', height: 240, bitrate: '400k' },
  { name: '480p', height: 480, bitrate: '1000k' },
  { name: '720p', height: 720, bitrate: '2500k' },
];
const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-500)}`))));
  });

async function uploadDir(dir, prefix) {
  for (const f of await fs.promises.readdir(dir)) {
    const type = f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : f.endsWith('.ts') ? 'video/mp2t' : 'image/jpeg';
    await storage.putObject({ key: `${prefix}/${f}`, body: await fs.promises.readFile(path.join(dir, f)), contentType: type, bucket: 'media' });
  }
}

async function processTranscodeJob({ data }) {
  const { reelId, key } = data;
  const reel = await Reel.findById(reelId);
  if (!reel || reel.status === 'ready') return;

  const ext = path.extname(key);
  const isVideo = ['.mp4', '.mov'].includes(ext);
  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tt-'));
  const input = path.join(work, `in${ext}`);
  try {
    await pipeline(await storage.getObjectStream({ key, bucket: 'raw' }), fs.createWriteStream(input));
    const prefix = `reels/${reelId}`;

    if (isVideo && hasFfmpeg()) {
      const out = path.join(work, 'hls');
      await fs.promises.mkdir(out);
      for (const r of RENDITIONS) {
        await run(['-i', input, '-vf', `scale=-2:${r.height}`, '-c:v', 'libx264', '-b:v', r.bitrate, '-c:a', 'aac', '-b:a', '96k',
          '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(out, `${r.name}_%03d.ts`), path.join(out, `${r.name}.m3u8`)]);
      }
      await run(['-i', input, '-ss', '00:00:01', '-frames:v', '1', '-vf', 'scale=-2:720', path.join(out, 'thumb.jpg')]);
      const master = ['#EXTM3U', ...RENDITIONS.flatMap((r) => [
        `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(r.bitrate, 10) * 1000},RESOLUTION=${Math.round((r.height * 9) / 16)}x${r.height}`,
        `${r.name}.m3u8`,
      ])].join('\n');
      await fs.promises.writeFile(path.join(out, 'master.m3u8'), master);
      await uploadDir(out, prefix);
      reel.hlsUrl = storage.publicUrl(`${prefix}/master.m3u8`);
      reel.thumbnailUrl = storage.publicUrl(`${prefix}/thumb.jpg`);
      reel.mediaUrl = reel.hlsUrl;
    } else {
      const outKey = `${prefix}/original${ext}`;
      await storage.putObject({ key: outKey, body: await fs.promises.readFile(input), contentType: isVideo ? 'video/mp4' : 'image/jpeg', bucket: 'media' });
      reel.mediaUrl = storage.publicUrl(outKey);
    }
    reel.status = 'ready';
    await reel.save();
    logger.info('reel ready', { reelId, hls: Boolean(reel.hlsUrl) });
  } catch (err) {
    reel.status = 'failed';
    await reel.save();
    throw err;
  } finally {
    fs.promises.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { processTranscodeJob };
