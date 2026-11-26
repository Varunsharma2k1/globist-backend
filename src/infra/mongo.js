/**
 * MongoDB (today's primary store for users, reels, trips, chat). The HLD
 * moves bookings/payments to Postgres first, then the rest in stages.
 * Without MONGO_URI an in-memory server is used (dev only; resets on restart).
 */
const mongoose = require('mongoose');
const env = require('../config/env');
const logger = require('./logger');

let mongod = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (env.mongo.uri) {
    await mongoose.connect(env.mongo.uri);
    logger.info('MongoDB connected (MONGO_URI)');
    return;
  }
  if (env.isServerless) {
    process.env.MONGOMS_DOWNLOAD_DIR = '/tmp';
    process.env.MONGOMS_PREFER_GLOBAL_PATH = 'true';
  }
  const { MongoMemoryServer } = require('mongodb-memory-server');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  logger.warn('MongoDB in-memory (data resets on restart) — set MONGO_URI to persist');
}

async function health() {
  return mongoose.connection.readyState === 1 ? 'ok' : 'down';
}

async function disconnectDB() {
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
  mongod = null;
}

module.exports = { connectDB, disconnectDB, health };
