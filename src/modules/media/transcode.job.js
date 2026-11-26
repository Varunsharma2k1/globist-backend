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
// zscale (libzimg) is needed for proper HDR -> SDR tone mapping. Static
// FFmpeg builds (use one on the server) have it; some Homebrew builds don't.
const hasZscale = () => /\bzscale\b/.test(spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }).stdout || '');

/** Video stream info: size after rotation, and whether it is HDR / 10-bit. */
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,pix_fmt,color_transfer,color_primaries:stream_side_data=rotation', '-of', 'json', file], { encoding: 'utf8' });
  const st = JSON.parse(r.stdout || '{}').streams?.[0] || {};
  const rotation = Math.abs(Number(st.side_data_list?.find((d) => d.rotation !== undefined)?.rotation || 0));
  const rotated = rotation === 90 || rotation === 270;
  return {
    width: rotated ? st.height : st.width,
    height: rotated ? st.width : st.height,
    hdr: ['smpte2084', 'arib-std-b67'].includes(st.color_transfer) || st.color_primaries === 'bt2020',
    tenBit: /10|12/.test(st.pix_fmt || ''),
  };
}

/**
 * Video filter that makes ANY phone recording playable on ANY phone:
 * HDR (iPhone/Pixel/Samsung "HDR video", HLG or PQ, 10-bit BT.2020) is tone
 * mapped to normal SDR BT.709, and everything ends up 8-bit 4:2:0 — budget
 * Android decoders (e.g. Redmi A-series) can't play 10-bit at all.
 */
function videoFilter(info, height, zscale) {
  const scale = `scale=-2:${height}:flags=lanczos`;
  if (info.hdr && zscale) {
    return `zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,${scale}`;
  }
  // No zscale: still force 8-bit SDR (colours slightly flatter on HDR input, but it plays everywhere).
  return `${scale},format=yuv420p`;
}

// H.264 High@4.0, 8-bit, fixed 2 s GOP so every rendition's segments line up for ABR switching.
const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
  '-g', '48', '-keyint_min', '48', '-sc_threshold', '0',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];

const run = (args) =>
  new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args]);
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-500)}`))));
  });

async function uploadDir(dir, prefix) {
  for (const f of await fs.promises.readdir(dir)) {
    const type = f.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl'
      : f.endsWith('.ts') ? 'video/mp2t'
      : f.endsWith('.mp4') ? 'video/mp4'
      : 'image/jpeg';
    await storage.putObject({ key: `${prefix}/${f}`, body: await fs.promises.readFile(path.join(dir, f)), contentType: type, bucket: 'media' });
  }
}

async function processTranscodeJob({ data }) {
  const { reelId, key, force } = data;
  const reel = await Reel.findById(reelId);
  if (!reel || (reel.status === 'ready' && !force)) return;

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
      const info = probe(input);
      const zscale = hasZscale();
      if (info.hdr && !zscale) logger.warn('HDR upload but ffmpeg has no zscale; converting without tone mapping', { reelId });
      // Never upscale: keep renditions at or below the source's short side.
      const shortSide = Math.min(info.width || 720, info.height || 720);
      const renditions = RENDITIONS.filter((r, i) => i === 0 || r.height <= shortSide);
      for (const r of renditions) {
        await run(['-i', input, '-vf', videoFilter(info, r.height, zscale), ...X264, '-b:v', r.bitrate,
          '-maxrate', r.bitrate, '-bufsize', `${parseInt(r.bitrate, 10) * 2}k`,
          '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
          '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(out, `${r.name}_%03d.ts`), path.join(out, `${r.name}.m3u8`)]);
      }
      // Primary playback file: ONE progressive MP4 at the top rendition.
      // Short reels start faster this way (one request, no playlist round
      // trips) and never shimmer between qualities. `+faststart` puts the
      // index at the front so playback begins while the rest downloads.
      // HLS is still produced for long videos / adaptive streaming later.
      const top = renditions[renditions.length - 1];
      await run(['-i', input, '-vf', videoFilter(info, top.height, zscale), ...X264, '-b:v', top.bitrate,
        '-maxrate', top.bitrate, '-bufsize', `${parseInt(top.bitrate, 10) * 2}k`,
        '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-movflags', '+faststart', path.join(out, `${top.name}.mp4`)]);
      await run(['-ss', '00:00:01', '-i', input, '-frames:v', '1', '-vf', videoFilter(info, 720, zscale), '-q:v', '3', path.join(out, 'thumb.jpg')]);
      const aspect = info.width && info.height ? info.width / info.height : 9 / 16;
      const master = ['#EXTM3U', ...renditions.flatMap((r) => [
        `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(r.bitrate, 10) * 1000},RESOLUTION=${2 * Math.round((r.height * aspect) / 2)}x${r.height},CODECS="avc1.640028,mp4a.40.2"`,
        `${r.name}.m3u8`,
      ])].join('\n');
      await fs.promises.writeFile(path.join(out, 'master.m3u8'), master);
      await uploadDir(out, prefix);
      reel.hlsUrl = storage.publicUrl(`${prefix}/master.m3u8`);
      reel.thumbnailUrl = storage.publicUrl(`${prefix}/thumb.jpg`);
      reel.mediaUrl = storage.publicUrl(`${prefix}/${top.name}.mp4`);
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

module.exports = { processTranscodeJob, _internal: { probe, videoFilter, X264, hasZscale } };
