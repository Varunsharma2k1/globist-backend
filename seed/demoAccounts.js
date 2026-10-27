/**
 * Accounts for screen-recording the sign-in / sign-up flow.
 *
 * - EXISTING_USER is created at server start (if missing): use it for the
 *   "Sign In" scene.
 * - NEW_USER is never created here. Signing in with that email sends the app
 *   to Sign Up, where it gets registered for real.
 *
 * With the default in-memory database, restarting the server resets everything,
 * including the new user. With a persistent MONGO_URI run `npm run demo:reset`.
 */
const User = require('../models/User');

const PASSWORD = 'Triptape@123';

const EXISTING_USER = { name: 'Riya Kapoor', email: 'riya.kapoor@triptape.app', role: 'traveler' };
const NEW_USER = { name: 'Kabir Malhotra', email: 'kabir.malhotra@triptape.app' };

async function ensureDemoAccounts() {
  const exists = await User.exists({ email: EXISTING_USER.email });
  if (!exists) {
    // Plaintext: the User model's pre('save') hook hashes it.
    await User.create({ ...EXISTING_USER, password: PASSWORD, needsAccountType: false });
  }
}

// Removes both demo accounts and recreates the existing one.
async function resetDemoAccounts() {
  await User.deleteMany({ email: { $in: [EXISTING_USER.email, NEW_USER.email] } });
  await ensureDemoAccounts();
}

module.exports = { ensureDemoAccounts, resetDemoAccounts, EXISTING_USER, NEW_USER, PASSWORD };
