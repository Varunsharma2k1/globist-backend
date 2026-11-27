const mongoose = require('mongoose');

/**
 * Lookup table: a tagged location's text -> map position. One row per
 * DISTINCT location ever used on a tape, filled once and reused, so the
 * live map never re-geocodes. Tapes themselves are unchanged.
 */
const placeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // normalized location text
    name: { type: String, required: true }, // display name (as first tagged)
    lat: Number,
    lng: Number,
    state: String, // map state code: HP, MP, UK, …
    pinId: String, // same pin for variants ("Manali" / "Manali, HP")
    head: { type: String, index: true }, // first part before a comma, letters only ("orchha")
    status: { type: String, enum: ['ok', 'not_found', 'error'], default: 'ok' },
    source: { type: String, enum: ['gazetteer', 'google', 'nominatim', 'alias'] },
    checkedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Place', placeSchema);
