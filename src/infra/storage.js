/**
 * Object storage (HLD: Cloudflare R2, S3 API). Two buckets:
 *   raw   — private, direct uploads from the app via presigned PUT
 *   media — public behind the CDN (HLS renditions, thumbnails, avatars)
 *
 * Without R2 credentials, presigned uploads point at this API's local
 * PUT endpoint (/api/media/local-upload/...) and files land in ./uploads,
 * so the app's upload flow is identical in dev.
 */
const path = require('path');
const fs = require('fs');
const env = require('../config/env');

const LOCAL_ROOT = path.join(__dirname, '..', '..', 'uploads');
let s3 = null;

function getS3() {
  if (!env.features.storage) return null;
  if (!s3) {
    const { S3Client } = require('@aws-sdk/client-s3');
    const cfg = env.storage;
    s3 = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint || `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: Boolean(cfg.endpoint),
    });
  }
  return s3;
}

const bucketName = (kind) => (kind === 'raw' ? env.storage.rawBucket : env.storage.mediaBucket);

/** Presigned PUT the app uploads to directly (bytes never hit the API). */
async function createUploadUrl({ key, contentType, bucket = 'raw' }) {
  const client = getS3();
  if (!client) {
    return {
      uploadUrl: `${env.publicBaseUrl}/api/media/local-upload/${bucket}/${encodeURIComponent(key)}`,
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      key,
    };
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucketName(bucket), Key: key, ContentType: contentType }),
    { expiresIn: env.storage.uploadUrlTtlSec }
  );
  return { uploadUrl, method: 'PUT', headers: { 'Content-Type': contentType }, key };
}

async function putObject({ key, body, contentType, bucket = 'media', cacheControl }) {
  const client = getS3();
  if (!client) {
    const file = path.join(LOCAL_ROOT, bucket, key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, body);
    return { key };
  }
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName(bucket),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl || 'public, max-age=31536000, immutable',
    })
  );
  return { key };
}

async function getObjectStream({ key, bucket = 'raw' }) {
  const client = getS3();
  if (!client) return fs.createReadStream(path.join(LOCAL_ROOT, bucket, key));
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const out = await client.send(new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }));
  return out.Body;
}

async function exists({ key, bucket = 'raw' }) {
  const client = getS3();
  if (!client) return fs.existsSync(path.join(LOCAL_ROOT, bucket, key));
  const { HeadObjectCommand } = require('@aws-sdk/client-s3');
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucketName(bucket), Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Public URL for something in the media bucket. */
function publicUrl(key) {
  if (env.features.storage && env.storage.cdnBaseUrl) return `${env.storage.cdnBaseUrl.replace(/\/$/, '')}/${key}`;
  return `/uploads/media/${key}`;
}

/** Local-dev only: resolve where a local-upload PUT should be written. */
function localPath(bucket, key) {
  const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
  return path.join(LOCAL_ROOT, bucket === 'raw' ? 'raw' : 'media', safe);
}

async function health() {
  if (!env.features.storage) return 'disabled (local disk)';
  const { HeadBucketCommand } = require('@aws-sdk/client-s3');
  await getS3().send(new HeadBucketCommand({ Bucket: env.storage.mediaBucket }));
  return 'ok';
}

module.exports = { createUploadUrl, putObject, getObjectStream, exists, publicUrl, localPath, health, LOCAL_ROOT };
