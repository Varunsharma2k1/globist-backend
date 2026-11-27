/**
 * Verifies Google Sign-In ID tokens. The app sends the idToken from the native
 * Google sign-in sheet; its audience is our *web* OAuth client ID
 * (GOOGLE_OAUTH_CLIENT_IDS may list several: web, android, ios).
 */
const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');
const { HttpError } = require('../shared/http');

const client = new OAuth2Client();

async function verifyIdToken(idToken) {
  if (!env.auth.googleClientIds.length) {
    throw new HttpError(503, 'Google sign-in is not configured (GOOGLE_OAUTH_CLIENT_IDS)');
  }
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.auth.googleClientIds });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Invalid Google token');
  }
  if (!payload.email || !payload.email_verified) {
    throw new HttpError(401, 'Google account email is not verified');
  }
  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    avatar: payload.picture || '',
  };
}

module.exports = { verifyIdToken };
