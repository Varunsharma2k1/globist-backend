// Static seed data — no dependency on other collections.
module.exports = [
    {
      name: 'Himachal Pradesh',
      spotCount: 42,
      verifiedAgencies: 12,
      imageType: 'mountain',
      subLocations: ['Manali', 'Kasol', 'Shimla', 'Spiti'],
      description: 'The land of snow-capped mountains, lush valleys, and ancient temples.',
      isFeatured: true,
      imageUrl: 'https://images.unsplash.com/photo-1571401835393-8c5f35328320?w=800&auto=format&fit=crop&q=70',
      tagline: 'Pine valleys + snow peaks'
    },
    {
      name: 'Uttarakhand',
      spotCount: 35,
      verifiedAgencies: 8,
      imageType: 'valley',
      subLocations: ['Rishikesh', 'Auli', 'Nainital', 'Mussoorie'],
      description: 'The abode of the gods with majestic Himalayan peaks and holy rivers.',
      isFeatured: true,
      imageUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop&q=70',
      tagline: 'Himalayan pilgrimage trails'
    },
    {
      name: 'Rajasthan',
      spotCount: 28,
      verifiedAgencies: 6,
      imageType: 'desert',
      subLocations: ['Jaipur', 'Udaipur', 'Jaisalmer', 'Jodhpur'],
      description: 'Land of kings — palatial heritage, golden deserts, and timeless Rajputana culture.',
      isFeatured: false
    },
    {
      name: 'Kerala',
      spotCount: 24,
      verifiedAgencies: 5,
      imageType: 'beach',
      subLocations: ['Alleppey', 'Munnar', 'Kochi', 'Thekkady'],
      description: 'Gods own country — backwaters, spice gardens, and tropical beaches.',
      isFeatured: false
    },
    {
      name: 'Goa',
      spotCount: 18,
      verifiedAgencies: 4,
      imageType: 'beach',
      subLocations: ['North Goa', 'South Goa', 'Panjim', 'Old Goa'],
      description: 'Sun-soaked beaches, Portuguese heritage, and the legendary Goan nightlife.',
      isFeatured: false
    },
    {
      name: 'Ladakh',
      spotCount: 15,
      verifiedAgencies: 3,
      imageType: 'mountain',
      subLocations: ['Leh', 'Nubra Valley', 'Pangong', 'Zanskar'],
      description: 'High-altitude desert with stark moonscapes, Buddhist monasteries, and the highest motorable passes.',
      isFeatured: false
    },
    {
      name: 'Meghalaya',
      spotCount: 12,
      verifiedAgencies: 2,
      imageType: 'jungle',
      subLocations: ['Shillong', 'Cherrapunji', 'Dawki', 'Nongriat'],
      description: 'Abode of clouds — living root bridges, rainforest canyons, and Asia\'s cleanest village.',
      isFeatured: false
    },
    {
      name: 'Karnataka',
      spotCount: 20,
      verifiedAgencies: 4,
      imageType: 'jungle',
      subLocations: ['Coorg', 'Hampi', 'Bengaluru', 'Chikmagalur'],
      description: 'A southern mosaic of coffee estates, ancient ruins, and coastal getaways.',
      isFeatured: false
    }
];
