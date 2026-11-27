const User = require('../modules/users/user.model');
const Region = require('../modules/trips/region.model');
const Agency = require('../modules/trips/agency.model');
const Trip = require('../modules/trips/trip.model');
const Booking = require('../modules/booking/booking.model');

const regionsData = require('./data/regions');
const demoUserData = require('./data/demoUser');
const buildAgenciesPart1 = require('./data/agencies.part1');
const buildAgenciesPart2 = require('./data/agencies.part2');
const buildTripsPart1 = require('./data/trips.part1');
const buildTripsPart2 = require('./data/trips.part2');
const buildTripsPart3 = require('./data/trips.part3');
const buildBookings = require('./data/bookings');

// Populates a fresh (empty) database with demo content: regions, one demo
// user, agencies, trips, and bookings. (No demo tapes: every tape is a real upload on R2.) Each data set lives in its own
// file under ./data — later sets take the previously-inserted documents as
// arguments so they can link to real _ids (e.g. a trip's `region` field).
async function seedDatabase() {
  console.log('🌱 Seeding database...');

  const regions = await Region.insertMany(regionsData);
  console.log(`  ✓ ${regions.length} regions created`);

  // Plaintext here on purpose — the User model's own pre('save') hook hashes it.
  // (Pre-hashing here too would double-hash the password and break login.)
  const demoUser = await User.create(demoUserData);
  console.log(`  ✓ Demo user created: ${demoUser.name}`);

  const agencies = await Agency.insertMany([...buildAgenciesPart1(regions), ...buildAgenciesPart2(regions)]);
  console.log(`  ✓ ${agencies.length} agencies created`);

  const trips = await Trip.insertMany([
    ...buildTripsPart1(regions, agencies),
    ...buildTripsPart2(regions, agencies),
    ...buildTripsPart3(regions, agencies),
  ]);
  console.log(`  ✓ ${trips.length} trips created`);

  demoUser.wishlist = [trips[0]._id, trips[4]._id, trips[10]._id];
  await demoUser.save();

  const bookings = await Booking.insertMany(buildBookings(demoUser, trips, agencies));
  console.log(`  ✓ ${bookings.length} bookings created`);

  console.log('✅ Database seeded successfully!');
}

module.exports = seedDatabase;
