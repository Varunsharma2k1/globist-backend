const User = require('../../modules/users/user.model');
const sessions = require('../../modules/auth/session.service');

const PUBLIC_FIELDS = '-password -refreshToken -otpCode -otpExpiry -passwordReset -googleId';

function bearer(req) {
  const h = req.headers.authorization;
  return h && h.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Resolves a verified, non-revoked user from an access token, or throws. */
async function userFromToken(token) {
  const decoded = sessions.verifyAccessToken(token);
  if (!decoded.sid || (await sessions.isRevoked(decoded.sid))) {
    const err = new Error('revoked');
    err.name = 'RevokedError';
    throw err;
  }
  const user = await User.findById(decoded.userId).select(PUBLIC_FIELDS);
  if (!user) {
    const err = new Error('no user');
    err.name = 'RevokedError';
    throw err;
  }
  return { user, sid: decoded.sid };
}

// The app treats TOKEN_EXPIRED as "refresh and retry"; anything else as "sign in again".
const auth = async (req, res, next) => {
  const token = bearer(req);
  if (!token) return res.status(401).json({ code: 'NO_TOKEN', message: 'Please sign in' });
  try {
    const { user, sid } = await userFromToken(token);
    req.user = user;
    req.auth = { sid };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', message: 'Token expired' });
    }
    return res.status(401).json({ code: 'SESSION_INVALID', message: 'Please sign in again' });
  }
};

// Sets req.user when a valid token is present; never blocks the request.
const optionalAuth = async (req, res, next) => {
  const token = bearer(req);
  if (token) {
    try {
      const { user, sid } = await userFromToken(token);
      req.user = user;
      req.auth = { sid };
    } catch {
      // continue as guest
    }
  }
  next();
};

module.exports = { auth, optionalAuth, userFromToken };
