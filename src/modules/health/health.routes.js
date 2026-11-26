const express = require('express');
const env = require('../../config/env');
const mongo = require('../../infra/mongo');
const postgres = require('../../infra/postgres');
const redis = require('../../infra/redis');
const storage = require('../../infra/storage');

const router = express.Router();

router.get('/', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// GET /api/health/deps — which HLD connections are live (no secrets shown)
router.get('/deps', async (req, res) => {
  const check = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      return `error: ${e.message}`;
    }
  };
  const [mongoS, pgS, redisS, storageS] = await Promise.all([
    check(mongo.health), check(postgres.health), check(redis.health), check(storage.health),
  ]);
  const enabled = (k) => (env.features[k] ? 'enabled' : 'disabled (dev fallback)');
  res.json({
    env: env.NODE_ENV,
    stores: { mongo: mongoS, postgres: pgS, redis: redisS, storage: storageS },
    integrations: {
      razorpay: enabled('razorpay'), fcm: enabled('fcm'), sms: enabled('sms'), email: enabled('email'),
      maps: enabled('maps'), sentry: enabled('sentry'), posthog: enabled('posthog'),
    },
  });
});

module.exports = router;
