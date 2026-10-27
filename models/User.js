const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, unique: true, sparse: true, trim: true },
  email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['traveler', 'creator', 'agency'], default: 'traveler' },
  // True for brand-new accounts until they pick traveler/creator/agency.
  // Defaults to false so pre-existing (seeded) users aren't prompted.
  needsAccountType: { type: Boolean, default: false },
  interests: [{ type: String }],
  bio: { type: String, default: '' },
  location: { type: String, default: '' },
  avatar: { type: String, default: '' },
  referralPoints: { type: Number, default: 0 },
  explorerTier: { type: String, enum: ['bronze', 'silver', 'gold', 'elite'], default: 'bronze' },
  stats: {
    trips: { type: Number, default: 0 },
    followers: { type: Number, default: 0 },
    following: { type: Number, default: 0 },
    bookingsInspired: { type: Number, default: 0 },
    reviews: { type: Number, default: 0 }
  },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Trip' }],
  isVerified: { type: Boolean, default: false },
  refreshToken: { type: String },
  otpCode: { type: String },
  otpExpiry: { type: Date }
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Calculate explorer tier based on bookings inspired
userSchema.methods.calculateTier = function() {
  const b = this.stats.bookingsInspired;
  if (b >= 50) return 'elite';
  if (b >= 25) return 'gold';
  if (b >= 10) return 'silver';
  return 'bronze';
};

module.exports = mongoose.model('User', userSchema);
