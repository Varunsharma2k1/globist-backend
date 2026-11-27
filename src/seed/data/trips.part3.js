// Trips for Meghalaya, Karnataka.
module.exports = (regions, agencies) => [
    // ── Meghalaya Trips ──
    {
      agency: agencies[19]._id,
      name: 'Double Root Bridge Trek',
      description: 'Trek to the famous double-decker living root bridge of Nongriat in the Khasi Hills.',
      pricePerPerson: 8500,
      duration: 3,
      difficulty: 'moderate',
      groupSize: { min: 4, max: 15 },
      nextSlot: new Date('2026-10-01'),
      itinerary: [
        { day: 1, title: 'Arrival · Cherrapunji', description: 'Drive from Shillong, visit Seven Sisters Falls.' },
        { day: 2, title: 'Root Bridge Trek', description: 'Descend 3,500 steps to Nongriat village and the double-decker living root bridge.' },
        { day: 3, title: 'Rainbow Falls & Return', description: 'Trek to Rainbow Falls, ascend back, departure.' }
      ],
      imageType: 'jungle',
      activeUsers: 12,
      region: regions[6]._id,
      isFeatured: true
    },
    {
      agency: agencies[20]._id,
      name: 'Shillong City & Cafe Hop',
      description: 'Explore the Scotland of the East — live music venues, cozy cafes, and Ward\'s Lake.',
      pricePerPerson: 6000,
      duration: 2,
      difficulty: 'easy',
      groupSize: { min: 2, max: 10 },
      nextSlot: new Date('2026-09-15'),
      itinerary: [
        { day: 1, title: 'City Tour', description: 'Ward\'s Lake, Don Bosco Museum, Police Bazaar, live music at a local cafe.' },
        { day: 2, title: 'Day Trip', description: 'Drive to Dawki river (crystal clear), Mawlynnong (cleanest village).' }
      ],
      imageType: 'jungle',
      activeUsers: 8,
      region: regions[6]._id
    },
    // ── Karnataka Trips ──
    {
      agency: agencies[21]._id,
      name: 'Coorg Coffee Estate Stay',
      description: 'Stay in a colonial-era plantation bungalow, trek through coffee estates, and visit Abbey Falls.',
      pricePerPerson: 11000,
      duration: 3,
      difficulty: 'easy',
      groupSize: { min: 2, max: 8 },
      nextSlot: new Date('2026-09-01'),
      itinerary: [
        { day: 1, title: 'Plantation Check-in', description: 'Arrive at coffee estate bungalow, evening plantation walk, bonfire.' },
        { day: 2, title: 'Trek & Waterfalls', description: 'Trek to Abbey Falls, Mandalpatti viewpoint, coffee tasting.' },
        { day: 3, title: 'Bylakuppe & Departure', description: 'Visit Tibetan Golden Temple at Bylakuppe, departure.' }
      ],
      imageType: 'jungle',
      activeUsers: 10,
      region: regions[7]._id
    },
    {
      agency: agencies[22]._id,
      name: 'Hampi Ruins Expedition',
      description: 'Explore the UNESCO World Heritage ruins of Vijayanagara Empire — boulder climbing and coracle rides.',
      pricePerPerson: 4500,
      duration: 2,
      difficulty: 'easy',
      groupSize: { min: 4, max: 20 },
      nextSlot: new Date('2026-10-15'),
      itinerary: [
        { day: 1, title: 'Temple Circuit', description: 'Virupaksha Temple, Vittala Temple with Stone Chariot, sunset at Hemakuta Hill.' },
        { day: 2, title: 'Adventure Day', description: 'Boulder climbing, coracle ride on Tungabhadra, hippie island exploration.' }
      ],
      imageType: 'desert',
      activeUsers: 18,
      region: regions[7]._id,
      isFeatured: true
    }
];
