/** FCM push (Android first; APNs goes through FCM too). Logs instead when unset. */
const fs = require('fs');
const env = require('../config/env');
const logger = require('../infra/logger');

let messaging = null;
function getMessaging() {
  if (!env.features.fcm) return null;
  if (!messaging) {
    const admin = require('firebase-admin');
    const json = env.fcm.serviceAccountBase64
      ? JSON.parse(Buffer.from(env.fcm.serviceAccountBase64, 'base64').toString('utf8'))
      : JSON.parse(fs.readFileSync(env.fcm.serviceAccountPath, 'utf8'));
    const app = admin.apps.length ? admin.app() : admin.initializeApp({ credential: admin.credential.cert(json) });
    messaging = app.messaging();
  }
  return messaging;
}

/** tokens: device FCM tokens. Returns tokens FCM says are dead (remove them). */
async function sendPush(tokens, { title, body, data = {} }) {
  if (!tokens?.length) return { sent: 0, invalidTokens: [] };
  const m = getMessaging();
  if (!m) {
    logger.info('[push:dev]', { to: tokens.length, title, body });
    return { sent: 0, invalidTokens: [], mock: true };
  }
  const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
  const res = await m.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: stringData,
    android: { priority: 'high', notification: { channelId: 'default' } },
  });
  const invalidTokens = res.responses
    .map((r, i) =>
      !r.success && /registration-token-not-registered|invalid-argument/.test(r.error?.code || '') ? tokens[i] : null
    )
    .filter(Boolean);
  return { sent: res.successCount, invalidTokens };
}

module.exports = { sendPush };
