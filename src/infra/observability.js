/** Sentry (errors/traces) + PostHog (product analytics). Both no-op when unset. */
const env = require('../config/env');
const logger = require('./logger');

let Sentry = null;
let posthog = null;

function initObservability() {
  if (env.features.sentry && !Sentry) {
    Sentry = require('@sentry/node');
    Sentry.init({ dsn: env.sentry.dsn, environment: env.NODE_ENV, tracesSampleRate: env.sentry.tracesSampleRate });
  }
  if (env.features.posthog && !posthog) {
    const { PostHog } = require('posthog-node');
    posthog = new PostHog(env.posthog.apiKey, { host: env.posthog.host, flushAt: 20, flushInterval: 10000 });
  }
}

function captureError(err, context = {}) {
  if (Sentry) Sentry.captureException(err, { extra: context });
  else logger.error(err.message, { ...context, stack: env.isProd ? undefined : err.stack });
}

/** Server-side analytics event, e.g. track(userId, 'booking_confirmed', { amount }). */
function track(distinctId, event, properties = {}) {
  if (posthog) posthog.capture({ distinctId: String(distinctId), event, properties });
  else logger.debug('track', { distinctId: String(distinctId), event });
}

async function close() {
  if (posthog) await posthog.shutdown();
  if (Sentry) await Sentry.close(2000);
}

module.exports = { initObservability, captureError, track, close };
