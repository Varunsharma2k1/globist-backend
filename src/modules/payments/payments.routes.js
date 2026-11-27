const express = require('express');
const env = require('../../config/env');
const { auth } = require('../../shared/middleware/auth');
const { asyncHandler, HttpError } = require('../../shared/http');
const Booking = require('../booking/booking.model');
const razorpay = require('../../integrations/razorpay');
const payments = require('./payments.service');
const logger = require('../../infra/logger');

/**
 * Webhook router: mounted BEFORE express.json() with a raw body, because
 * the HMAC is computed over the exact bytes Razorpay sent.
 */
const webhookRouter = express.Router();
webhookRouter.post(
  '/webhook',
  express.raw({ type: '*/*', limit: '1mb' }),
  asyncHandler(async (req, res) => {
    if (!razorpay.verifyWebhook(req.body, req.headers['x-razorpay-signature'])) {
      return res.status(400).json({ message: 'Invalid signature' });
    }
    const event = JSON.parse(req.body.toString('utf8'));
    const entity = event.payload?.payment?.entity;
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      await payments.confirmByOrder(entity?.order_id || event.payload?.order?.entity?.id, entity?.id);
    } else if (event.event === 'payment.failed' && entity?.order_id) {
      await payments.failByOrder(entity.order_id);
    } else {
      logger.debug('razorpay webhook ignored', { event: event.event });
    }
    res.json({ ok: true }); // 2xx so Razorpay stops retrying
  })
);

const router = express.Router();

// POST /api/payments/verify — Checkout success callback from the app.
router.post(
  '/verify',
  auth,
  asyncHandler(async (req, res) => {
    const { orderId, paymentId, signature } = req.body || {};
    if (!razorpay.verifyCheckout({ orderId, paymentId, signature }))
      throw new HttpError(400, 'Payment verification failed');
    const owned = await Booking.exists({ 'payment.orderId': orderId, user: req.user._id });
    if (!owned) throw new HttpError(404, 'Booking not found');
    const { booking } = await payments.confirmByOrder(orderId, paymentId);
    res.json({ booking });
  })
);

// POST /api/payments/mock/confirm { bookingId } — dev only, no Razorpay keys.
router.post(
  '/mock/confirm',
  auth,
  asyncHandler(async (req, res) => {
    if (env.features.razorpay || env.isProd) throw new HttpError(404, 'Not found');
    const booking = await Booking.findOne({ _id: req.body?.bookingId, user: req.user._id });
    if (!booking?.payment?.orderId) throw new HttpError(404, 'Booking not found');
    const out = await payments.confirmByOrder(booking.payment.orderId, `pay_mock_${Date.now()}`);
    res.json(out);
  })
);

module.exports = { router, webhookRouter };
