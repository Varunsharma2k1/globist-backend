/**
 * The ONLY place that reads process.env. Everything else imports `env`.
 *
 * Every external connection in the HLD has a block here. A connection is
 * "enabled" when its required vars are set; when it isn't, the matching
 * infra/integration module degrades to a safe local fallback (in-memory,
 * local disk, console log) so the app always boots. `env.features` shows
 * what's live; GET /api/health/deps reports the same.
 */
require('dotenv').config();

// Blank values (`KEY=` in .env) count as unset so fallbacks apply.
const str = (name, fallback = '') => (process.env[name] || '').trim() || fallback;
const num = (name, fallback) => {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`[env] ${name} must be a number, got "${v}"`);
  return n;
};
const bool = (name, fallback = false) => {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};
const list = (name, fallback = []) => {
  const v = str(name);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : fallback;
};

const NODE_ENV = str('NODE_ENV', 'development');
const isProd = NODE_ENV === 'production';

const env = {
  NODE_ENV,
  isProd,
  isServerless: Boolean(process.env.VERCEL),
  port: num('PORT', 5001),
  corsOrigins: list('CLIENT_ORIGIN', ['http://localhost:5173', 'http://localhost:3000']),
  publicBaseUrl: str('PUBLIC_BASE_URL', `http://localhost:${num('PORT', 5001)}`),

  auth: {
    jwtSecret: str('JWT_SECRET', 'globist-secret-key-2024'),
    jwtRefreshSecret: str('JWT_REFRESH_SECRET') || `${str('JWT_SECRET', 'globist-secret-key-2024')}-refresh`,
    // HLD target is 15m once the app refreshes tokens; 7d keeps today's app working.
    accessTtl: str('JWT_ACCESS_TTL', '7d'),
    refreshTtl: str('JWT_REFRESH_TTL', '30d'),
    googleClientIds: list('GOOGLE_OAUTH_CLIENT_IDS'),
  },

  // ── Data stores ──────────────────────────────────────────────
  mongo: { uri: str('MONGO_URI') }, // current primary store; in-memory if unset
  postgres: {
    url: str('DATABASE_URL'), // HLD primary (Neon/RDS). Bookings + payments move here first.
    poolMax: num('PG_POOL_MAX', 10),
    ssl: bool('PG_SSL', true),
  },
  redis: { url: str('REDIS_URL') }, // cache, rate limits, seat holds, BullMQ, socket adapter

  // ── Media (Cloudflare R2, S3-compatible) ─────────────────────
  storage: {
    accountId: str('R2_ACCOUNT_ID'),
    accessKeyId: str('R2_ACCESS_KEY_ID'),
    secretAccessKey: str('R2_SECRET_ACCESS_KEY'),
    endpoint: str('R2_ENDPOINT'), // optional override, e.g. MinIO locally
    rawBucket: str('R2_RAW_BUCKET', 'triptape-raw'),
    mediaBucket: str('R2_MEDIA_BUCKET', 'triptape-media'),
    cdnBaseUrl: str('CDN_BASE_URL'), // public URL in front of the media bucket
    uploadUrlTtlSec: num('UPLOAD_URL_TTL_SEC', 900),
  },

  // ── Third-party ──────────────────────────────────────────────
  razorpay: {
    keyId: str('RAZORPAY_KEY_ID'),
    keySecret: str('RAZORPAY_KEY_SECRET'),
    webhookSecret: str('RAZORPAY_WEBHOOK_SECRET'),
  },
  fcm: {
    // Either a path to the service-account JSON, or the JSON itself (base64).
    serviceAccountPath: str('FIREBASE_SERVICE_ACCOUNT_PATH'),
    serviceAccountBase64: str('FIREBASE_SERVICE_ACCOUNT_BASE64'),
  },
  sms: {
    msg91AuthKey: str('MSG91_AUTH_KEY'),
    msg91OtpTemplateId: str('MSG91_OTP_TEMPLATE_ID'),
    senderId: str('MSG91_SENDER_ID', 'TRPTPE'),
  },
  email: {
    sesRegion: str('SES_REGION', 'ap-south-1'),
    accessKeyId: str('AWS_ACCESS_KEY_ID'),
    secretAccessKey: str('AWS_SECRET_ACCESS_KEY'),
    from: str('EMAIL_FROM', 'Triptape <no-reply@triptape.app>'),
  },
  maps: { googleApiKey: str('GOOGLE_MAPS_API_KEY') },

  // ── Ops ──────────────────────────────────────────────────────
  sentry: { dsn: str('SENTRY_DSN'), tracesSampleRate: num('SENTRY_TRACES_SAMPLE_RATE', 0.1) },
  posthog: { apiKey: str('POSTHOG_API_KEY'), host: str('POSTHOG_HOST', 'https://us.i.posthog.com') },
  logLevel: str('LOG_LEVEL', isProd ? 'info' : 'debug'),

  rateLimit: {
    windowSec: num('RATE_LIMIT_WINDOW_SEC', 60),
    max: num('RATE_LIMIT_MAX', 300),
    authMax: num('RATE_LIMIT_AUTH_MAX', 20),
  },
  seedOnEmpty: bool('SEED_ON_EMPTY', true),
};

const s = env.storage;
env.features = {
  mongo: Boolean(env.mongo.uri),
  postgres: Boolean(env.postgres.url),
  redis: Boolean(env.redis.url),
  storage: Boolean((s.accountId || s.endpoint) && s.accessKeyId && s.secretAccessKey),
  razorpay: Boolean(env.razorpay.keyId && env.razorpay.keySecret),
  fcm: Boolean(env.fcm.serviceAccountPath || env.fcm.serviceAccountBase64),
  sms: Boolean(env.sms.msg91AuthKey),
  email: Boolean(env.email.accessKeyId && env.email.secretAccessKey),
  maps: Boolean(env.maps.googleApiKey),
  sentry: Boolean(env.sentry.dsn),
  posthog: Boolean(env.posthog.apiKey),
};

if (isProd) {
  const problems = [];
  if (env.auth.jwtSecret === 'globist-secret-key-2024') problems.push('JWT_SECRET must be set');
  if (!env.mongo.uri) problems.push('MONGO_URI must be set (in-memory DB is dev-only)');
  if (problems.length) throw new Error(`[env] Production misconfigured:\n - ${problems.join('\n - ')}`);
}

module.exports = env;
