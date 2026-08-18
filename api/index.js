const app = require('../index');
const { connectDB } = require('../config/db');
const seedDatabase = require('../seed/seed');

let isConnected = false;

module.exports = async (req, res) => {
  if (!isConnected) {
    try {
      await connectDB();
      // Only seed if empty
      const User = require('../models/User');
      const count = await User.countDocuments();
      if (count === 0) {
        await seedDatabase();
      }
      isConnected = true;
    } catch (e) {
      console.error('API initialization error:', e);
    }
  }
  return app(req, res);
};
