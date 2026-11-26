/**
 * Vercel serverless entry. No WebSockets or background workers here: chat
 * works over REST and jobs run inline. Production target is src/server.js
 * on EC2/ECS (see docs/ARCHITECTURE.md).
 */
const app = require('../src/app');
const { connectDB } = require('../src/infra/mongo');
const { bootstrapData } = require('../src/seed/bootstrap');
const workers = require('../src/workers');

let ready = null;

module.exports = async (req, res) => {
  if (!ready) {
    ready = (async () => {
      await connectDB();
      await bootstrapData();
      workers.registerAll();
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  try {
    await ready;
  } catch (e) {
    return res.status(503).json({ message: 'Service starting, retry shortly' });
  }
  return app(req, res);
};
