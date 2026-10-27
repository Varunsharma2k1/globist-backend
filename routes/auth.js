const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { auth, generateAccessToken, generateRefreshToken, JWT_SECRET } = require('../middleware/auth');

// Account types a new user can choose (existing users may still be creators).
const SIGNUP_ROLES = ['traveler', 'agency'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

// GOOGLE_CLIENT_IDS: comma-separated OAuth client IDs (web/iOS/Android) whose
// ID tokens we accept.
const googleClientIds = (process.env.GOOGLE_CLIENT_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const googleClient = new OAuth2Client();

const sanitize = (user) => {
  const obj = user.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.otpCode;
  delete obj.otpExpiry;
  return obj;
};

// Issues a fresh token pair, stores the refresh token and builds the response.
const startSession = async (user) => {
  const token = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = refreshToken;
  await user.save();
  return { token, refreshToken, user: sanitize(user) };
};

// POST /api/auth/signup  { name, email, password }
// New accounts start with needsAccountType=true; the app then asks the user
// to choose traveler / creator / agency (see PATCH /account-type).
router.post('/signup', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const { password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    if (await User.findOne({ email })) {
      return res.status(409).json({
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists. Please sign in.',
      });
    }

    const user = new User({ name, email, password, needsAccountType: true });
    res.status(201).json(await startSession(user));
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login  { email, password }
router.post('/login', async (req, res, next) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // The app uses this code to send first-time users to the sign-up form.
      return res.status(404).json({
        code: 'USER_NOT_FOUND',
        message: 'No account found for this email',
      });
    }
    if (!user.password) {
      return res.status(401).json({ message: 'This account uses Google sign-in. Please continue with Google.' });
    }
    if (!(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    res.json(await startSession(user));
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/google  { idToken }
// Verifies a Google ID token, then signs in or creates the account.
router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required' });
    }
    if (!googleClientIds.length) {
      return res.status(503).json({ message: 'Google sign-in is not configured on the server' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: googleClientIds });
      payload = ticket.getPayload();
    } catch (err) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }
    if (!payload.email || !payload.email_verified) {
      return res.status(401).json({ message: 'Google account email is not verified' });
    }

    const email = payload.email.toLowerCase();
    let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });

    if (user) {
      // Link Google to an existing email/password account on first use.
      if (!user.googleId) user.googleId = payload.sub;
      if (!user.avatar && payload.picture) user.avatar = payload.picture;
    } else {
      user = new User({
        name: payload.name || email.split('@')[0],
        email,
        googleId: payload.sub,
        authProvider: 'google',
        avatar: payload.picture || '',
        isVerified: true,
        needsAccountType: true,
      });
    }

    res.json(await startSession(user));
  } catch (error) {
    next(error);
  }
});

// PATCH /api/auth/account-type  { role }  — one-time choice after first sign-up.
router.patch('/account-type', auth, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!SIGNUP_ROLES.includes(role)) {
      return res.status(400).json({ message: `Role must be one of: ${SIGNUP_ROLES.join(', ')}` });
    }

    const user = await User.findById(req.user._id);
    user.role = role;
    user.needsAccountType = false;
    await user.save();

    res.json({ user: sanitize(user) });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET + '-refresh');
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    res.json({ accessToken: generateAccessToken(user._id) });
  } catch (error) {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', auth, async (req, res, next) => {
  try {
    req.user.refreshToken = undefined;
    await req.user.save();
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
