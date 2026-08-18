// Agencies for Goa, Ladakh, Meghalaya, Karnataka.
module.exports = (regions) => [
    // ── Goa ──
    {
      name: 'Goa Beach Luxury',
      description: 'Private beach villas, yacht tours, sunset dinners, and premium spa experiences.',
      location: 'South Goa, Goa',
      region: regions[4]._id,
      categories: ['Luxury'],
      rating: 4.8,
      reviewCount: 670,
      isVerified: true,
      startingPrice: 22000,
      imageType: 'beach'
    },
    {
      name: 'Goa Adventure Sports',
      description: 'Parasailing, scuba diving, jet skiing, and island hopping adventures along the Goan coastline.',
      location: 'Baga, Goa',
      region: regions[4]._id,
      categories: ['Adventure'],
      rating: 4.5,
      reviewCount: 450,
      isVerified: true,
      startingPrice: 5500,
      imageType: 'beach'
    },
    {
      name: 'Old Goa Heritage Trail',
      description: 'Walk through Portuguese churches, Latin Quarter, and taste authentic Goan-Portuguese fusion cuisine.',
      location: 'Panjim, Goa',
      region: regions[4]._id,
      categories: ['City Tours'],
      rating: 4.4,
      reviewCount: 280,
      isVerified: false,
      startingPrice: 2500,
      imageType: 'beach'
    },
    // ── Ladakh ──
    {
      name: 'Ladakh Moto Expeditions',
      description: 'Iconic motorcycle expeditions over Khardung La, Pangong Lake, and Nubra Valley with expert riders.',
      location: 'Leh, Ladakh',
      region: regions[5]._id,
      categories: ['Adventure'],
      rating: 4.9,
      reviewCount: 1050,
      isVerified: true,
      startingPrice: 28000,
      imageType: 'mountain'
    },
    {
      name: 'Zanskar Valley Treks',
      description: 'Multi-day treks through the frozen Chadar river and remote Zanskar villages.',
      location: 'Zanskar, Ladakh',
      region: regions[5]._id,
      categories: ['Treks'],
      rating: 4.8,
      reviewCount: 420,
      isVerified: true,
      startingPrice: 35000,
      imageType: 'snow'
    },
    {
      name: 'Leh Palace & Monastery Tours',
      description: 'Guided cultural tours of ancient Buddhist monasteries, Leh Palace, and local Ladakhi homes.',
      location: 'Leh, Ladakh',
      region: regions[5]._id,
      categories: ['City Tours'],
      rating: 4.6,
      reviewCount: 310,
      isVerified: true,
      startingPrice: 5000,
      imageType: 'mountain'
    },
    // ── Meghalaya ──
    {
      name: 'Living Root Bridge Treks',
      description: 'Multi-day treks to the famous double-decker living root bridges of Nongriat.',
      location: 'Cherrapunji, Meghalaya',
      region: regions[6]._id,
      categories: ['Treks', 'Adventure'],
      rating: 4.7,
      reviewCount: 260,
      isVerified: true,
      startingPrice: 8500,
      imageType: 'jungle'
    },
    {
      name: 'Shillong City Escapes',
      description: 'Rock capital of India — live music, cafe hopping, Ward\'s Lake, and Don Bosco Museum.',
      location: 'Shillong, Meghalaya',
      region: regions[6]._id,
      categories: ['City Tours', 'Luxury'],
      rating: 4.4,
      reviewCount: 180,
      isVerified: false,
      startingPrice: 6000,
      imageType: 'jungle'
    },
    // ── Karnataka ──
    {
      name: 'Coorg Coffee Trail',
      description: 'Stay in plantation bungalows, trek through coffee estates, and visit Abbey Falls.',
      location: 'Coorg, Karnataka',
      region: regions[7]._id,
      categories: ['Treks', 'Luxury'],
      rating: 4.6,
      reviewCount: 520,
      isVerified: true,
      startingPrice: 11000,
      imageType: 'jungle'
    },
    {
      name: 'Hampi Heritage Expeditions',
      description: 'Explore the ancient Vijayanagara Empire ruins, boulder climbing, and coracle rides on the Tungabhadra.',
      location: 'Hampi, Karnataka',
      region: regions[7]._id,
      categories: ['City Tours', 'Adventure'],
      rating: 4.7,
      reviewCount: 390,
      isVerified: true,
      startingPrice: 4500,
      imageType: 'desert'
    }
];
