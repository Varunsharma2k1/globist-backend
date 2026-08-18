// Trips for Himachal Pradesh, Uttarakhand, Rajasthan.
// Takes inserted regions + agencies to link each trip to its region/agency.
module.exports = (regions, agencies) => [
    // ── Himachal Pradesh Trips ──
    {
      agency: agencies[0]._id,
      name: 'Spiti Valley Expedition',
      description: 'Expert-led expeditions to Spiti and Pin Valley. Specializing in high-altitude survival techniques and immersive local culture experiences with certified guides.',
      pricePerPerson: 12500,
      duration: 6,
      difficulty: 'moderate',
      groupSize: { min: 2, max: 15 },
      nextSlot: new Date('2026-07-15'),
      itinerary: [
        { day: 1, title: 'Arrival · Manali', description: 'Pick-up from bus stand. Check-in, orientation and acclimatization walk.' },
        { day: 2, title: 'Solang Valley Trek', description: '10km trek through alpine meadows. Camping overnight.' },
        { day: 3, title: 'Beas Kund Summit', description: 'High altitude trek to glacial lake at 3,700m elevation.' },
        { day: 4, title: 'Rohtang Pass Crossing', description: 'Cross the legendary Rohtang Pass at 3,978m. Visit Keylong.' },
        { day: 5, title: 'Spiti Valley Exploration', description: 'Visit Ki Monastery and Chicham Bridge. Local homestay.' },
        { day: 6, title: 'Departure', description: 'Morning meditation at monastery. Return to Manali.' }
      ],
      imageType: 'mountain',
      activeUsers: 34,
      region: regions[0]._id,
      isFeatured: true
    },
    {
      agency: agencies[1]._id,
      name: 'Manali Riverside Luxury Stay',
      description: 'Premium riverside villa with spa, organic meals, and guided valley walks.',
      pricePerPerson: 25000,
      duration: 5,
      difficulty: 'easy',
      groupSize: { min: 2, max: 8 },
      nextSlot: new Date('2026-07-20'),
      itinerary: [
        { day: 1, title: 'Welcome · Old Manali', description: 'Private transfer, villa check-in, welcome dinner.' },
        { day: 2, title: 'Spa & Wellness', description: 'Morning yoga, ayurvedic spa, organic cooking class.' },
        { day: 3, title: 'Valley Walk', description: 'Guided walk through Jogini Waterfall trail.' },
        { day: 4, title: 'Cultural Experience', description: 'Visit Hadimba Temple, local market tour.' },
        { day: 5, title: 'Departure', description: 'Farewell breakfast, private transfer.' }
      ],
      imageType: 'valley',
      activeUsers: 8,
      region: regions[0]._id
    },
    {
      agency: agencies[2]._id,
      name: 'Shimla Heritage Trail',
      description: 'Walk through colonial-era architecture, taste authentic Himachali cuisine, and explore hidden trails.',
      pricePerPerson: 4500,
      duration: 2,
      difficulty: 'easy',
      groupSize: { min: 5, max: 25 },
      nextSlot: new Date('2026-08-10'),
      itinerary: [
        { day: 1, title: 'Ridge Walk', description: 'Walk along the Ridge, visit Christ Church, and explore Mall Road.' },
        { day: 2, title: 'Hidden Trails', description: 'Nature trail to Jakhu Temple, local food tour.' }
      ],
      imageType: 'snow',
      activeUsers: 18,
      region: regions[0]._id
    },
    {
      agency: agencies[3]._id,
      name: 'Kheerganga Trek & Camp',
      description: 'Trek through Parvati Valley pine forests to the legendary Kheerganga hot springs at 2,960m.',
      pricePerPerson: 6500,
      duration: 3,
      difficulty: 'moderate',
      groupSize: { min: 4, max: 20 },
      nextSlot: new Date('2026-07-01'),
      itinerary: [
        { day: 1, title: 'Kasol to Barshaini', description: 'Drive to Barshaini, begin 12km trek through Parvati Valley.' },
        { day: 2, title: 'Kheerganga Summit', description: 'Reach hot springs, soak under the stars, bonfire night.' },
        { day: 3, title: 'Descent & Departure', description: 'Morning trek down, lunch in Kasol, departure.' }
      ],
      imageType: 'jungle',
      activeUsers: 26,
      region: regions[0]._id,
      isFeatured: true
    },
    // ── Uttarakhand Trips ──
    {
      agency: agencies[4]._id,
      name: 'Rishikesh Rafting Adventure',
      description: 'White water rafting on Grade III-IV rapids with professional instructors. Includes riverside camping.',
      pricePerPerson: 8000,
      duration: 3,
      difficulty: 'moderate',
      groupSize: { min: 4, max: 20 },
      nextSlot: new Date('2026-08-05'),
      itinerary: [
        { day: 1, title: 'Arrival · Rishikesh', description: 'Check-in at riverside camp. Evening aarti at Triveni Ghat.' },
        { day: 2, title: 'White Water Rafting', description: '16km rafting from Shivpuri to Laxman Jhula. Grade III-IV rapids.' },
        { day: 3, title: 'Bungee & Departure', description: 'Optional bungee jumping. Departure after lunch.' }
      ],
      imageType: 'valley',
      activeUsers: 22,
      region: regions[1]._id,
      isFeatured: true
    },
    {
      agency: agencies[5]._id,
      name: 'Auli Skiing Experience',
      description: 'Professional skiing lessons with equipment. Includes gondola rides and panoramic Himalayan views.',
      pricePerPerson: 18000,
      duration: 4,
      difficulty: 'easy',
      groupSize: { min: 2, max: 10 },
      nextSlot: new Date('2026-12-20'),
      itinerary: [
        { day: 1, title: 'Arrival · Joshimath', description: 'Travel to Joshimath, cable car to Auli.' },
        { day: 2, title: 'Skiing Basics', description: 'Professional skiing lessons on beginner slopes.' },
        { day: 3, title: 'Advanced Slopes', description: 'Intermediate skiing with guide. Evening bonfire.' },
        { day: 4, title: 'Free Run & Departure', description: 'Free skiing. Return to Joshimath.' }
      ],
      imageType: 'snow',
      activeUsers: 12,
      region: regions[1]._id,
      isFeatured: true
    },
    {
      agency: agencies[6]._id,
      name: 'Nainital Lakeside Getaway',
      description: 'Luxury cottage stay overlooking Naini Lake with guided boat rides, Mall Road tour, and sunset point visits.',
      pricePerPerson: 15000,
      duration: 3,
      difficulty: 'easy',
      groupSize: { min: 2, max: 6 },
      nextSlot: new Date('2026-09-01'),
      itinerary: [
        { day: 1, title: 'Check-in · Lake View', description: 'Private cottage check-in, evening boat ride on Naini Lake.' },
        { day: 2, title: 'Mall Road & Temples', description: 'Guided walk through Mall Road, Naina Devi Temple visit.' },
        { day: 3, title: 'Sunrise & Departure', description: 'Early morning Tiffin Top hike, breakfast, departure.' }
      ],
      imageType: 'valley',
      activeUsers: 10,
      region: regions[1]._id
    },
    // ── Rajasthan Trips ──
    {
      agency: agencies[7]._id,
      name: 'Desert Safari & Camping',
      description: 'Camel ride through golden sand dunes, overnight desert camp with folk music and stargazing.',
      pricePerPerson: 9500,
      duration: 3,
      difficulty: 'easy',
      groupSize: { min: 4, max: 16 },
      nextSlot: new Date('2026-11-15'),
      itinerary: [
        { day: 1, title: 'Arrival · Jaisalmer', description: 'Fort tour, visit Patwon Ki Haveli.' },
        { day: 2, title: 'Desert Safari', description: 'Camel safari to Sam Sand Dunes. Overnight luxury camp with Rajasthani folk dance.' },
        { day: 3, title: 'Sunrise & Departure', description: 'Desert sunrise, jeep ride back, departure.' }
      ],
      imageType: 'desert',
      activeUsers: 28,
      region: regions[2]._id,
      isFeatured: true
    },
    {
      agency: agencies[8]._id,
      name: 'Udaipur Royal Experience',
      description: 'Stay in heritage haveli, private boat on Lake Pichola, City Palace tour, and Rajasthani thali dinner.',
      pricePerPerson: 12000,
      duration: 4,
      difficulty: 'easy',
      groupSize: { min: 2, max: 10 },
      nextSlot: new Date('2026-10-01'),
      itinerary: [
        { day: 1, title: 'Arrival · Udaipur', description: 'Heritage haveli check-in, evening at Gangaur Ghat.' },
        { day: 2, title: 'City Palace & Lake', description: 'Guided City Palace tour, private boat ride on Lake Pichola.' },
        { day: 3, title: 'Monsoon Palace & Sunset', description: 'Visit Sajjangarh Monsoon Palace, sunset dinner at rooftop.' },
        { day: 4, title: 'Local Market & Departure', description: 'Shopping at Hathi Pol Bazaar, departure.' }
      ],
      imageType: 'desert',
      activeUsers: 15,
      region: regions[2]._id
    },
    {
      agency: agencies[9]._id,
      name: 'Pink City Walking Tour',
      description: 'Full-day walking tour of Jaipur — Hawa Mahal, Amber Fort, local bazaars, and authentic street food.',
      pricePerPerson: 3500,
      duration: 1,
      difficulty: 'easy',
      groupSize: { min: 6, max: 30 },
      nextSlot: new Date('2026-09-15'),
      itinerary: [
        { day: 1, title: 'Jaipur City Walk', description: 'Hawa Mahal at sunrise, Amber Fort, Jantar Mantar, local chai and street food trail.' }
      ],
      imageType: 'desert',
      activeUsers: 40,
      region: regions[2]._id
    },
];
