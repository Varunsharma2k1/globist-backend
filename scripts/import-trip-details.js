/**
 * One-off: moves trip-page details that used to be hard-coded in the app
 * (itinerary, highlights, inclusions, …) into the trips in MongoDB.
 *
 *   node scripts/import-trip-details.js <details.json>
 * JSON shape: { "<trip name>": { itinerary, highlights, inclusions, exclusions, startPoint, endPoint, places } }
 */
const fs = require('fs');
const mongoose = require('mongoose');
const { connectDB } = require('../src/infra/mongo');
const Trip = require('../src/modules/trips/trip.model');

const FIELDS = ['itinerary', 'highlights', 'inclusions', 'exclusions', 'startPoint', 'endPoint', 'places'];

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.log('usage: node scripts/import-trip-details.js <details.json>');
    process.exit(1);
  }
  const details = JSON.parse(fs.readFileSync(file, 'utf8'));
  await connectDB();
  for (const [name, extra] of Object.entries(details)) {
    const set = {};
    for (const f of FIELDS) if (extra[f] !== undefined) set[f] = extra[f];
    if (set.itinerary) {
      set.itinerary = set.itinerary.map((d, i) => ({
        day: d.day ?? i + 1,
        title: d.title || `Day ${i + 1}`,
        description: d.description || '',
        activities: d.activities || [],
        stay: d.stay || '',
        meals: d.meals || [],
      }));
    }
    const { matchedCount } = await Trip.updateMany({ name }, { $set: set });
    console.log(`${matchedCount ? 'ok  ' : 'skip'} ${name}${matchedCount ? '' : ' (no trip with this name)'}`);
  }
  await mongoose.disconnect();
})();
