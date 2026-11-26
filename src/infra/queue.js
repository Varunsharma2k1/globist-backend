/**
 * Event bus / job queue (HLD: BullMQ on Redis → SQS → Kafka later).
 *
 * Producers call `enqueue(QUEUES.X, name, data)`. With Redis it's a real
 * BullMQ job (retries + backoff, failed jobs kept as the DLQ). Without Redis
 * the job runs in-process on the next tick via the registered handler, so
 * features work end to end in dev with no extra services.
 */
const env = require('../config/env');
const logger = require('./logger');
const { newBullConnection } = require('./redis');

const QUEUES = Object.freeze({
  TRANSCODE: 'transcode', // reel uploaded → HLS renditions
  NOTIFY: 'notify', // push / sms / email
  EVENTS: 'events', // domain events (outbox relay → fan-out, indexer)
  COUNTERS: 'counters', // periodic Redis → DB flush
});

const DEFAULT_JOB_OPTS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: 5000, // kept = dead-letter for inspection
};

const queues = new Map();
const localHandlers = new Map(); // queueName -> async (job) => {}

function getQueue(name) {
  if (!env.features.redis) return null;
  if (!queues.has(name)) {
    const { Queue } = require('bullmq');
    queues.set(name, new Queue(name, { connection: newBullConnection(), defaultJobOptions: DEFAULT_JOB_OPTS }));
  }
  return queues.get(name);
}

async function enqueue(queueName, jobName, data, opts = {}) {
  const q = getQueue(queueName);
  if (q) return q.add(jobName, data, opts);

  const handler = localHandlers.get(queueName);
  if (!handler) {
    logger.debug('queue: no local handler, dropping job', { queueName, jobName });
    return null;
  }
  setImmediate(async () => {
    try {
      await handler({ name: jobName, data, id: `local-${Date.now()}` });
    } catch (err) {
      logger.error('local job failed', { queueName, jobName, err: err.message });
    }
  });
  return { id: 'local' };
}

/**
 * Register a processor. With Redis this starts a BullMQ Worker (call from
 * the worker process); without Redis it's used inline by `enqueue`.
 */
function registerWorker(queueName, handler, { concurrency = 2 } = {}) {
  localHandlers.set(queueName, handler);
  if (!env.features.redis) return null;
  const { Worker } = require('bullmq');
  const worker = new Worker(queueName, handler, { connection: newBullConnection(), concurrency });
  worker.on('failed', (job, err) =>
    logger.warn('job failed', { queue: queueName, job: job?.name, attempts: job?.attemptsMade, err: err.message })
  );
  return worker;
}

async function close() {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}

module.exports = { QUEUES, enqueue, registerWorker, close };
