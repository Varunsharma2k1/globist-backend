// Bookings owned by the demo user.
module.exports = (demoUser, trips, agencies) => [
    {
      user: demoUser._id,
      trip: trips[0]._id,
      agency: agencies[0]._id,
      checkIn: new Date('2026-07-15'),
      checkOut: new Date('2026-07-21'),
      adults: 2,
      children: 0,
      totalAmount: 24300,
      discount: 1200,
      platformFee: 500,
      paymentMethod: 'upi',
      referralPointsUsed: 0,
      status: 'confirmed'
    },
    {
      user: demoUser._id,
      trip: trips[4]._id,
      agency: agencies[4]._id,
      checkIn: new Date('2026-08-05'),
      checkOut: new Date('2026-08-08'),
      adults: 1,
      children: 0,
      totalAmount: 7300,
      discount: 1200,
      platformFee: 500,
      paymentMethod: 'upi',
      referralPointsUsed: 0,
      status: 'confirmed'
    }
];
