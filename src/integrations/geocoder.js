/**
 * Turns a place name ("Orchha, Madhya Pradesh") into coordinates + state.
 * Google Geocoding when GOOGLE_MAPS_API_KEY is set; otherwise OpenStreetMap
 * Nominatim (free, no key; usage policy: ≤1 request/second, identify the
 * app, cache results — callers must cache, see modules/places).
 * Returns null when nothing in India matches.
 */
const env = require('../config/env');
const maps = require('./maps');

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'TripTape-server/1.0 (travel app; place lookup)';

let lastNominatimAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function viaGoogle(query) {
  const data = await maps.geocode(query);
  const hit = data.results?.[0];
  if (!hit) return null;
  const state = hit.address_components?.find((c) => c.types.includes('administrative_area_level_1'));
  const country = hit.address_components?.find((c) => c.types.includes('country'));
  if (country && country.short_name !== 'IN') return null;
  return {
    lat: hit.geometry.location.lat,
    lng: hit.geometry.location.lng,
    stateName: state?.long_name || '',
    source: 'google',
  };
}

async function viaNominatim(query) {
  // Global 1 req/s throttle for this process.
  const wait = lastNominatimAt + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastNominatimAt = Date.now();
  const qs = new URLSearchParams({ q: query, format: 'jsonv2', countrycodes: 'in', addressdetails: '1', limit: '1' });
  const res = await fetch(`${NOMINATIM}?${qs}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = await res.json();
  if (!hit) return null;
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    stateName: hit.address?.state || hit.address?.state_district || '',
    source: 'nominatim',
  };
}

async function geocodePlace(query) {
  return env.features.maps ? viaGoogle(query) : viaNominatim(query);
}

module.exports = { geocodePlace };
