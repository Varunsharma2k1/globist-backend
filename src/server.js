/**
 * Long-running server: HTTP API + Socket.IO chat + (optionally) workers.
 * This is what runs on EC2 / ECS. Vercel uses api/index.js instead.
 */
const http = require('http');
const env = require('./config/env');
const logger = require('./infra/logger');
const app = require('./app');
const { connectDB, disconnectDB } = require('./infra/mongo');
const { initObservability, close: closeObservability } = require('./infra/observability');
const postgres = require('./infra/postgres');
const redis = require('./infra/redis');
const queue = require('./infra/queue');
const { attachSocket } = require('./modules/chat/chat.socket');
const workers = require('./workers');
const { bootstrapData } = require('./seed/bootstrap');

async function start() {
  initObservability();
  await connectDB();
  await bootstrapData();

  // Without Redis jobs run inline, so their processors must be registered here.
  // With Redis they run in `npm run worker`, unless RUN_WORKERS_IN_API=true.
  const inApi = !env.features.redis || process.env.RUN_WORKERS_IN_API === 'true';
  const running = inApi ? workers.registerAll() : [];
  if (inApi) await workers.scheduleMaintenance();

  const server = http.createServer(app);
  attachSocket(server, { origins: env.corsOrigins });

  server.listen(env.port, () => {
    logger.info(`Triptape API on http://localhost:${env.port}  (deps: /api/health/deps)`);
    const on = Object.entries(env.features).filter(([, v]) => v).map(([k]) => k);
    logger.info(`connections enabled: ${on.length ? on.join(', ') : 'none — all dev fallbacks'}`);
    if (!env.isProd) logger.info('demo login: riya.kapoor@triptape.app / Triptape@123');
  });

  const shutdown = async (signal) => {
    logger.info(`${signal}: shutting down`);
    server.close();
    await Promise.allSettled([...running.map((w) => w.close()), queue.close(), redis.close(), postgres.close(), closeObservability()]);
    await disconnectDB().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('failed to start', { err: err.message, stack: err.stack });
  process.exit(1);
});
