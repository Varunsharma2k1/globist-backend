/**
 * Pin one agency (and its trips) to the top of the app's lists.
 *
 *   node scripts/feature-agency.js "Himalayan High Treks"
 *   node scripts/feature-agency.js --list
 *
 * Only one agency is featured at a time: this clears the flag elsewhere.
 */
const mongoose = require('mongoose');
const { connectDB } = require('../src/infra/mongo');
const Agency = require('../src/modules/trips/agency.model');
const Trip = require('../src/modules/trips/trip.model');

(async () => {
  const arg = process.argv.slice(2).join(' ').trim();
  await connectDB();
  if (!arg || arg === '--list') {
    const all = await Agency.find().select('name location isVerified isFeatured').sort({ name: 1 }).lean();
    all.forEach((a) => console.log(`${a.isFeatured ? '★' : ' '} ${a.name} — ${a.location}${a.isVerified ? ' ✓' : ''}`));
    console.log('\nusage: node scripts/feature-agency.js "<agency name>"');
  } else {
    const agency = await Agency.findOne({ name: new RegExp(`^${arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!agency) {
      console.log(`No agency named "${arg}". Run with --list to see names.`);
    } else {
      await Agency.updateMany({ _id: { $ne: agency._id } }, { $set: { isFeatured: false } });
      await Trip.updateMany({ agency: { $ne: agency._id } }, { $set: { isFeatured: false } });
      await Agency.updateOne({ _id: agency._id }, { $set: { isFeatured: true, isVerified: true } });
      const { modifiedCount } = await Trip.updateMany({ agency: agency._id }, { $set: { isFeatured: true } });
      const trips = await Trip.countDocuments({ agency: agency._id });
      console.log(`★ Featured "${agency.name}" (${trips} trip${trips === 1 ? '' : 's'}, ${modifiedCount} updated).`);
    }
  }
  await mongoose.disconnect();
})();
