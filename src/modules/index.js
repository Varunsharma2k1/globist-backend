/**
 * Module registry — the HLD's "nine services as modules in one Node app".
 * Each entry is owned by one team/person (see docs/ARCHITECTURE.md). To add
 * a module: create src/modules/<name>/, export a router, add a line here.
 *
 * Rule: modules talk to each other through *.service.js exports, never by
 * reaching into another module's routes.
 */
module.exports = [
  // path                 router
  ['/api/health', require('./health/health.routes')],
  ['/api/auth', require('./auth/auth.routes')],
  ['/api/users', require('./users/users.routes')],
  ['/api/feed', require('./feed/feed.routes')],
  ['/api/reels', require('./reels/reels.routes')],
  ['/api/media', require('./media/media.routes')],
  ['/api/engagement', require('./engagement/engagement.routes')],
  ['/api/explore', require('./search/explore.routes')],
  ['/api/search', require('./search/places.routes')],
  ['/api/trips', require('./trips/trips.routes')],
  ['/api/agencies', require('./trips/agencies.routes')],
  ['/api/regions', require('./trips/regions.routes')],
  ['/api/bookings', require('./booking/booking.routes')],
  ['/api/payments', require('./payments/payments.routes').router],
  ['/api/notifications', require('./notifications/notifications.routes')],
  ['/api/chat', require('./chat/chat.routes')],
  ['/api/reviews', require('./reviews/reviews.routes')],
  ['/api/places', require('./places/places.routes')],
  ['/api/support', require('./support/support.routes')],
  ['/api/communities', require('./communities/communities.routes')],
];
