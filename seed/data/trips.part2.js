// Trips for Kerala, Goa, Ladakh.
module.exports = (regions, agencies) => [
    // ── Kerala Trips ──
    {
      agency: agencies[10]._id,
      name: 'Kerala Backwater Cruise',
      description: 'Luxury houseboat cruise through the backwaters of Alleppey with local cuisine.',
      pricePerPerson: 15000,
      duration: 3,
      difficulty: 'easy',
      groupSize: { min: 2, max: 6 },
      nextSlot: new Date('2026-09-01'),
      itinerary: [
        { day: 1, title: 'Board Houseboat', description: 'Board premium houseboat, welcome drinks, sunset cruise.' },
        { day: 2, title: 'Village Tour', description: 'Visit toddy shops, coir-making villages, and spice gardens.' },
        { day: 3, title: 'Departure', description: 'Morning bird watching, Kerala breakfast, disembark.' }
      ],
      imageType: 'beach',
      activeUsers: 6,
      region: regions[3]._id
    },
    {
      agency: agencies[11]._id,
      name: 'Munnar Tea Plantation Trek',
      description: 'Trek through rolling tea gardens, visit Eravikulam National Park, and stay in eco-lodge.',
      pricePerPerson: 7500,
      duration: 3,
      difficulty: 'moderate',
      groupSize: { min: 4, max: 12 },
      nextSlot: new Date('2026-08-15'),
      itinerary: [
        { day: 1, title: 'Arrival · Munnar', description: 'Eco-lodge check-in, evening tea tasting session.' },
        { day: 2, title: 'Tea Garden Trek', description: 'Full-day trek through tea plantations and spice gardens.' },
        { day: 3, title: 'Eravikulam & Departure', description: 'Morning visit to Eravikulam National Park, departure.' }
      ],
      imageType: 'jungle',
      activeUsers: 14,
      region: regions[3]._id,
      isFeatured: true
    },
    {
      agency: agencies[12]._id,
      name: 'Fort Kochi Heritage Walk',
      description: 'Walk through Fort Kochi\'s colonial streets, Chinese fishing nets, spice markets, and Jew Town.',
      pricePerPerson: 3000,
      duration: 1,
      difficulty: 'easy',
      groupSize: { min: 5, max: 20 },
      nextSlot: new Date('2026-08-01'),
      itinerary: [
        { day: 1, title: 'Fort Kochi Walk', description: 'Chinese fishing nets, St. Francis Church, Mattancherry Palace, Jew Town, and spice market.' }
      ],
      imageType: 'beach',
      activeUsers: 20,
      region: regions[3]._id
    },
    // ── Goa Trips ──
    {
      agency: agencies[13]._id,
      name: 'South Goa Luxury Retreat',
      description: 'Private beach villa, yacht sunset cruise, candlelight dinner, and premium spa package.',
      pricePerPerson: 22000,
      duration: 4,
      difficulty: 'easy',
      groupSize: { min: 2, max: 4 },
      nextSlot: new Date('2026-11-01'),
      itinerary: [
        { day: 1, title: 'Villa Check-in', description: 'Private beach villa, welcome cocktails, sunset swim.' },
        { day: 2, title: 'Yacht Cruise', description: 'Private yacht cruise along the Goan coast, dolphin spotting.' },
        { day: 3, title: 'Spa & Cuisine', description: 'Full-day spa, Goan cooking class, candlelight dinner.' },
        { day: 4, title: 'Departure', description: 'Beach brunch, private transfer.' }
      ],
      imageType: 'beach',
      activeUsers: 5,
      region: regions[4]._id
    },
    {
      agency: agencies[14]._id,
      name: 'Goa Water Sports Package',
      description: 'Parasailing, scuba diving, jet skiing, and banana boat rides — the ultimate Goa adrenaline rush.',
      pricePerPerson: 5500,
      duration: 2,
      difficulty: 'moderate',
      groupSize: { min: 2, max: 12 },
      nextSlot: new Date('2026-10-15'),
      itinerary: [
        { day: 1, title: 'Beach Sports', description: 'Parasailing, jet skiing, banana boat at Baga Beach.' },
        { day: 2, title: 'Scuba Diving', description: 'Scuba diving at Grande Island, snorkeling, island lunch.' }
      ],
      imageType: 'beach',
      activeUsers: 30,
      region: regions[4]._id,
      isFeatured: true
    },
    {
      agency: agencies[15]._id,
      name: 'Old Goa Heritage Walk',
      description: 'Portuguese churches, Latin Quarter stroll, and Goan-Portuguese fusion cuisine tasting.',
      pricePerPerson: 2500,
      duration: 1,
      difficulty: 'easy',
      groupSize: { min: 6, max: 25 },
      nextSlot: new Date('2026-10-01'),
      itinerary: [
        { day: 1, title: 'Heritage Walk', description: 'Basilica of Bom Jesus, Se Cathedral, Fontainhas Latin Quarter, local cuisine trail.' }
      ],
      imageType: 'beach',
      activeUsers: 22,
      region: regions[4]._id
    },
    // ── Ladakh Trips ──
    {
      agency: agencies[16]._id,
      name: 'Leh-Ladakh Moto Expedition',
      description: 'Iconic 10-day motorcycle ride over the highest motorable passes in the world.',
      pricePerPerson: 28000,
      duration: 10,
      difficulty: 'hard',
      groupSize: { min: 4, max: 12 },
      nextSlot: new Date('2026-07-01'),
      itinerary: [
        { day: 1, title: 'Arrival · Leh', description: 'Acclimatization day, Leh Market, Shanti Stupa.' },
        { day: 2, title: 'Magnetic Hill & Confluence', description: 'Visit Magnetic Hill, Zanskar-Indus confluence.' },
        { day: 3, title: 'Khardung La', description: 'Ride over Khardung La (5,359m), descend to Nubra Valley.' },
        { day: 4, title: 'Nubra Valley', description: 'Diskit Monastery, double-humped camel ride.' },
        { day: 5, title: 'Pangong Lake', description: 'Ride to Pangong Tso lake, overnight lakeside camp.' },
        { day: 6, title: 'Return to Leh', description: 'Return via Chang La pass.' }
      ],
      imageType: 'mountain',
      activeUsers: 16,
      region: regions[5]._id,
      isFeatured: true
    },
    {
      agency: agencies[17]._id,
      name: 'Chadar Frozen River Trek',
      description: 'Walk on the frozen Zanskar River through one of the most extreme treks in the world.',
      pricePerPerson: 35000,
      duration: 9,
      difficulty: 'hard',
      groupSize: { min: 6, max: 14 },
      nextSlot: new Date('2027-01-15'),
      itinerary: [
        { day: 1, title: 'Arrival · Leh', description: 'Acclimatization, gear check.' },
        { day: 2, title: 'Drive to Chilling', description: 'Drive to trek starting point at Chilling village.' },
        { day: 3, title: 'Frozen River Walk', description: 'Begin walking on the frozen Zanskar River.' },
        { day: 4, title: 'Deep Canyon', description: 'Navigate through narrow ice canyon.' },
        { day: 5, title: 'Nerak Waterfall', description: 'Reach the frozen Nerak waterfall — the ultimate reward.' }
      ],
      imageType: 'snow',
      activeUsers: 8,
      region: regions[5]._id
    },
    {
      agency: agencies[18]._id,
      name: 'Leh Monastery Circuit',
      description: 'Cultural tour of Ladakh\'s most iconic Buddhist monasteries and palaces.',
      pricePerPerson: 5000,
      duration: 2,
      difficulty: 'easy',
      groupSize: { min: 4, max: 20 },
      nextSlot: new Date('2026-08-01'),
      itinerary: [
        { day: 1, title: 'Leh Monastery Tour', description: 'Leh Palace, Thiksey Monastery (mini Potala), Hemis Monastery.' },
        { day: 2, title: 'Alchi & Likir', description: 'Drive to 1,000-year-old Alchi monastery, Likir Monastery.' }
      ],
      imageType: 'mountain',
      activeUsers: 25,
      region: regions[5]._id
    },
];
