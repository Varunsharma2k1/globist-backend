// Usage: npm run demo:reset  (needs MONGO_URI; the in-memory DB resets on restart)
require('dotenv').config();
const mongoose = require('mongoose');
const { resetDemoAccounts, EXISTING_USER, NEW_USER, PASSWORD } = require('./demoAccounts');

(async () => {
  if (!process.env.MONGO_URI) {
    console.log('MONGO_URI is not set: the in-memory database resets whenever the server restarts.');
    process.exit(0);
  }
  await mongoose.connect(process.env.MONGO_URI);
  await resetDemoAccounts();
  console.log(`Sign In scene:  ${EXISTING_USER.email} / ${PASSWORD}`);
  console.log(`Sign Up scene:  ${NEW_USER.name}, ${NEW_USER.email} / ${PASSWORD}`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
