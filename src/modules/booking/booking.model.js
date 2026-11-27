const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  trip: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
  agency: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  adults: { type: Number, default: 1, min: 1 },
  children: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  platformFee: { type: Number, default: 500 },
  paymentMethod: { type: String, enum: ['upi', 'card', 'netbanking'], default: 'upi' },
  referralPointsUsed: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'confirmed' },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Razorpay flow (HLD C): pending -> confirmed on verified webhook/callback.
  payment: {
    provider: { type: String, enum: ['razorpay', 'none'], default: 'none' },
    orderId: { type: String, index: true, sparse: true },
    paymentId: { type: String },
    status: { type: String, enum: ['created', 'paid', 'failed', 'refunded'], default: undefined },
  },
  holdExpiresAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
