require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { ensureDemoAccounts } = require('./seed/demoAccounts');
const path = require('path');
const { connectDB } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const seedDatabase = require('./seed/seed');

// Route imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const agencyRoutes = require('./routes/agencies');
const regionRoutes = require('./routes/regions');
const bookingRoutes = require('./routes/bookings');
const reelRoutes = require('./routes/reels');
const exploreRoutes = require('./routes/explore');
const tripRoutes = require('./routes/trips');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
// CLIENT_ORIGIN can be a comma-separated list (e.g. for a deployed web app +
// local dev). Falls back to common local dev ports if unset.
const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve locally uploaded reel videos, e.g. /uploads/reels/manali.mp4
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/agencies', agencyRoutes);
app.use('/api/regions', regionRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reels', reelRoutes);
app.use('/api/explore', exploreRoutes);
app.use('/api/trips', tripRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    await connectDB();

    const User = require('./models/User');
    // phone/email are now optional+sparse-unique; bring any older index
    // (non-sparse unique phone) in line with the schema.
    await User.syncIndexes();
    // Give the pre-existing demo user an email so it can log in with email.
    await User.updateOne(
      { phone: '+91 98765 43210', email: { $exists: false } },
      { $set: { email: 'demo@globist.app' } }
    );
    // Only seed a fresh/empty database. With a persistent MONGO_URI this
    // means real data survives restarts instead of being wiped and re-seeded
    // with new _ids every time the process starts.
    const existingUserCount = await User.countDocuments();
    if (existingUserCount === 0) {
      await seedDatabase();
    }

    await ensureDemoAccounts();

    app.listen(PORT, () => {
      console.log(`\n🚀 Triptape API running on http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/api/health`);
      console.log(`\n📱 Demo Login:`);
      console.log(`   Phone: +91 98765 43210`);
      console.log(`   Password: 123456`);
      console.log(`   OTP: 123456 (any 6 digits work)\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
