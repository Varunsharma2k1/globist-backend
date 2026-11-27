/** Startup data steps run by the server before it accepts traffic. */
const env = require('../config/env');
const User = require('../modules/users/user.model');
const seedDatabase = require('./seed');
const { ensureDemoAccounts } = require('./demoAccounts');

async function bootstrapData() {
  await User.syncIndexes();
  await User.updateOne(
    { phone: '+91 98765 43210', email: { $exists: false } },
    { $set: { email: 'demo@triptape.app' } }
  );
  if (env.seedOnEmpty && (await User.countDocuments()) === 0) await seedDatabase();
  if (!env.isProd) await ensureDemoAccounts();
}

module.exports = { bootstrapData };
