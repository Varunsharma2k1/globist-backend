// Agencies for Himachal Pradesh, Uttarakhand, Rajasthan, Kerala.
// Takes the already-inserted regions so it can link each agency to its region._id.
module.exports = (regions) => [
    // ── Himachal Pradesh ──
    {
      name: 'Himalayan High Treks',
      description: 'Expert-led expeditions to Spiti and Pin Valley. Specializing in high-altitude survival and local culture experiences.',
      location: 'Manali, Himachal Pradesh',
      region: regions[0]._id,
      categories: ['Adventure', 'Treks'],
      rating: 4.9,
      reviewCount: 1240,
      isVerified: true,
      startingPrice: 12500,
      imageType: 'mountain'
    },
    {
      name: 'Manali Luxury Escapes',
      description: 'Bespoke riverside villas and wellness retreats in the heart of Old Manali. Premium transport included.',
      location: 'Old Manali, Himachal Pradesh',
      region: regions[0]._id,
      categories: ['Luxury'],
      rating: 4.7,
      reviewCount: 850,
      isVerified: true,
      startingPrice: 25000,
      imageType: 'valley'
    },
    {
      name: 'Shimla Heritage Walks',
      description: 'Deep dive into colonial history. Authentic local food and hidden trail experiences.',
      location: 'Shimla, Himachal Pradesh',
      region: regions[0]._id,
      categories: ['City Tours'],
      rating: 4.8,
      reviewCount: 620,
      isVerified: true,
      startingPrice: 4500,
      imageType: 'snow'
    },
    {
      name: 'Kasol Adventure Camp',
      description: 'Riverside camping, cliff jumping, and the legendary Kheerganga trek through pine forests.',
      location: 'Kasol, Himachal Pradesh',
      region: regions[0]._id,
      categories: ['Adventure', 'Treks'],
      rating: 4.6,
      reviewCount: 430,
      isVerified: true,
      startingPrice: 6500,
      imageType: 'jungle'
    },
    // ── Uttarakhand ──
    {
      name: 'Ganges Valley Treks',
      description: 'Rafting, camping, and spiritual journeys along the sacred Ganges river.',
      location: 'Rishikesh, Uttarakhand',
      region: regions[1]._id,
      categories: ['Adventure', 'Treks'],
      rating: 4.8,
      reviewCount: 856,
      isVerified: true,
      startingPrice: 8000,
      imageType: 'valley'
    },
    {
      name: 'Auli Snow Escapes',
      description: 'Premium skiing and snowboarding experiences in the heart of the Garhwal Himalayas.',
      location: 'Auli, Uttarakhand',
      region: regions[1]._id,
      categories: ['Adventure'],
      rating: 4.7,
      reviewCount: 623,
      isVerified: true,
      startingPrice: 18000,
      imageType: 'snow'
    },
    {
      name: 'Nainital Lake Retreats',
      description: 'Luxury lakeside cottages with private views of Naini Lake and curated city walking tours.',
      location: 'Nainital, Uttarakhand',
      region: regions[1]._id,
      categories: ['Luxury', 'City Tours'],
      rating: 4.5,
      reviewCount: 312,
      isVerified: true,
      startingPrice: 15000,
      imageType: 'valley'
    },
    // ── Rajasthan ──
    {
      name: 'Royal Desert Safaris',
      description: 'Camel safaris, desert camping under the stars, and Rajput fort explorations in the Thar.',
      location: 'Jaisalmer, Rajasthan',
      region: regions[2]._id,
      categories: ['Adventure'],
      rating: 4.8,
      reviewCount: 920,
      isVerified: true,
      startingPrice: 9500,
      imageType: 'desert'
    },
    {
      name: 'Udaipur Heritage Tours',
      description: 'Guided palace tours, boat rides on Lake Pichola, and authentic Rajasthani cuisine experiences.',
      location: 'Udaipur, Rajasthan',
      region: regions[2]._id,
      categories: ['City Tours', 'Luxury'],
      rating: 4.9,
      reviewCount: 1100,
      isVerified: true,
      startingPrice: 12000,
      imageType: 'desert'
    },
    {
      name: 'Jaipur Walking Tours',
      description: 'Explore the Pink City on foot — Hawa Mahal, Amber Fort, local bazaars, and street food trails.',
      location: 'Jaipur, Rajasthan',
      region: regions[2]._id,
      categories: ['City Tours'],
      rating: 4.6,
      reviewCount: 540,
      isVerified: false,
      startingPrice: 3500,
      imageType: 'desert'
    },
    // ── Kerala ──
    {
      name: 'Kerala Backwater Cruises',
      description: 'Luxury houseboat stays and backwater explorations in Alleppey.',
      location: 'Alleppey, Kerala',
      region: regions[3]._id,
      categories: ['Luxury'],
      rating: 4.6,
      reviewCount: 430,
      isVerified: true,
      startingPrice: 15000,
      imageType: 'beach'
    },
    {
      name: 'Munnar Tea Trail Treks',
      description: 'Trek through endless tea plantations, visit spice gardens, and stay in hilltop eco-lodges.',
      location: 'Munnar, Kerala',
      region: regions[3]._id,
      categories: ['Treks', 'Adventure'],
      rating: 4.7,
      reviewCount: 380,
      isVerified: true,
      startingPrice: 7500,
      imageType: 'jungle'
    },
    {
      name: 'Kochi Heritage Walks',
      description: 'Explore Fort Kochi\'s colonial architecture, Chinese fishing nets, and spice markets on foot.',
      location: 'Kochi, Kerala',
      region: regions[3]._id,
      categories: ['City Tours'],
      rating: 4.5,
      reviewCount: 290,
      isVerified: true,
      startingPrice: 3000,
      imageType: 'beach'
    },
];
