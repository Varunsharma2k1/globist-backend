/**
 * Background workers (HLD: Fargate Spot workers; Tier 1 runs them on the
 * API box). `registerAll()` wires every queue to its processor.
 *
 *   npm run worker          — separate process (needs REDIS_URL)
 *   RUN_WORKERS_IN_API=true — same process as the API (Tier 1 single server)
 *   no REDIS_URL            — jobs run inline in the API automatically
 */
const env = require('../config/env');
const logger = require('../infra/logger');
const { QUEUES, registerWorker, enqueue } = require('../infra/queue');
const { processTranscodeJob } = require('../modules/media/transcode.job');
const { processNotifyJob } = require('../modules/notifications/notifications.service');
const { flushCounters } = require('../modules/engagement/engagement.service');
const payments = require('../modules/payments/payments.service');
const bookings = require('../modules/booking/booking.service');

const MAINTENANCE_EVERY_MS = 60 * 1000;

async function processEventJob({ name, data }) {
  // Domain events (outbox relay target). Feed fan-out and the search
  // indexer subscribe here as they're built.
  logger.info('event', { name, ...data });
}

async function processCountersJob() {
  const flushed = await flushCounters();
  const expired = await payments.expireStaleHolds();
  const completed = await bookings.completeFinishedTrips();
  if (flushed || expired || completed) logger.debug('maintenance', { flushed, expired, completed });
}

let timer = null;

function registerAll() {
  const workers = [
    registerWorker(QUEUES.TRANSCODE, processTranscodeJob, { concurrency: 1 }),
    registerWorker(QUEUES.NOTIFY, processNotifyJob, { concurrency: 5 }),
    registerWorker(QUEUES.EVENTS, processEventJob),
    registerWorker(QUEUES.COUNTERS, processCountersJob, { concurrency: 1 }),
  ].filter(Boolean);
  return workers;
}

/** Periodic counter flush + hold expiry (repeatable job with Redis, timer without). */
async function scheduleMaintenance() {
  if (env.features.redis) {
    await enqueue(
      QUEUES.COUNTERS,
      'maintenance',
      {},
      { repeat: { every: MAINTENANCE_EVERY_MS }, jobId: 'maintenance' }
    );
  } else if (!timer) {
    timer = setInterval(
      () => processCountersJob().catch((e) => logger.warn('maintenance failed', { err: e.message })),
      MAINTENANCE_EVERY_MS
    );
    timer.unref();
  }
}

module.exports = { registerAll, scheduleMaintenance };

// Standalone worker process.
if (require.main === module) {
  (async () => {
    const { connectDB } = require('../infra/mongo');
    const { initObservability } = require('../infra/observability');
    initObservability();
    if (!env.features.redis) {
      logger.error('npm run worker needs REDIS_URL (without it jobs already run inside the API)');
      process.exit(1);
    }
    await connectDB();
    const workers = registerAll();
    await scheduleMaintenance();
    logger.info(`workers running: ${Object.values(QUEUES).join(', ')}`);
    const stop = async () => {
      await Promise.all(workers.map((w) => w.close()));
      process.exit(0);
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  })();
}
