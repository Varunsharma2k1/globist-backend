const mongoose = require('mongoose');

const itineraryItemSchema = new mongoose.Schema(
  {
    day: { type: Number, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    activities: [{ type: String }],
    stay: { type: String, default: '' },
    meals: [{ type: String }],
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    agency: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    pricePerPerson: { type: Number, required: true },
    duration: { type: Number, required: true }, // days
    difficulty: { type: String, enum: ['easy', 'moderate', 'hard'], default: 'moderate' },
    groupSize: {
      min: { type: Number, default: 2 },
      max: { type: Number, default: 15 },
    },
    nextSlot: { type: Date },
    itinerary: [itineraryItemSchema],
    // Trip page details (set by the agency).
    highlights: [{ type: String }],
    inclusions: [{ type: String }],
    exclusions: [{ type: String }],
    startPoint: { type: String, default: '' },
    endPoint: { type: String, default: '' },
    places: [{ type: String }], // sub-locations for Explore (e.g. "Kaza", "Chandratal")
    imageType: { type: String, default: 'mountain' },
    activeUsers: { type: Number, default: 0 },
    region: { type: mongoose.Schema.Types.ObjectId, ref: 'Region' },
    isFeatured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Trip', tripSchema);
