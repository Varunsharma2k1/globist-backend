/**
 * Razorpay (HLD payments). Orders are created with the server-side price;
 * webhooks are verified with HMAC-SHA256 over the raw body.
 *
 * Without keys, `createOrder` returns a mock order (id `order_mock_*`) so
 * the booking flow runs end to end in dev; confirm it with
 * POST /api/payments/mock/confirm.
 */
const crypto = require('crypto');
const env = require('../config/env');

let client = null;
const getClient = () => {
  if (!env.features.razorpay) return null;
  if (!client) {
    const Razorpay = require('razorpay');
    client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  }
  return client;
};

/** amountPaise: integer paise. receipt: your booking id. */
async function createOrder({ amountPaise, receipt, notes = {} }) {
  const c = getClient();
  if (!c) {
    return {
      id: `order_mock_${crypto.randomBytes(6).toString('hex')}`,
      amount: amountPaise,
      currency: 'INR',
      receipt,
      mock: true,
    };
  }
  return c.orders.create({ amount: amountPaise, currency: 'INR', receipt: String(receipt), notes });
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Verifies the X-Razorpay-Signature header against the RAW request body. */
function verifyWebhook(rawBody, signature) {
  if (!env.razorpay.webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}

/** Verifies the checkout callback (order_id|payment_id signed with key secret). */
function verifyCheckout({ orderId, paymentId, signature }) {
  if (!env.razorpay.keySecret) return false;
  const expected = crypto.createHmac('sha256', env.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

async function refund(paymentId, amountPaise) {
  const c = getClient();
  if (!c) return { id: `rfnd_mock_${Date.now()}`, mock: true };
  return c.payments.refund(paymentId, amountPaise ? { amount: amountPaise } : {});
}

module.exports = { createOrder, verifyWebhook, verifyCheckout, refund, publicKeyId: () => env.razorpay.keyId || null };
