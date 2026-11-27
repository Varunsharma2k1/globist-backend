/** Google Maps / Places (geocode + autocomplete), server-side so the key stays private. */
const env = require('../config/env');

const BASE = 'https://maps.googleapis.com/maps/api';

async function call(path, params) {
  if (!env.features.maps) {
    const err = new Error('Maps is not configured (set GOOGLE_MAPS_API_KEY)');
    err.status = 503;
    throw err;
  }
  const qs = new URLSearchParams({ ...params, key: env.maps.googleApiKey });
  const res = await fetch(`${BASE}${path}?${qs}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Google Maps ${res.status}`);
  return res.json();
}

const autocomplete = (input, { sessionToken } = {}) =>
  call('/place/autocomplete/json', { input, components: 'country:in', ...(sessionToken ? { sessiontoken: sessionToken } : {}) });

const geocode = (address) => call('/geocode/json', { address, region: 'in' });

module.exports = { autocomplete, geocode };
