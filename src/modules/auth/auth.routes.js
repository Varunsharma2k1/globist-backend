const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const router = express.Router();
const env = require('../../config/env');
const User = require('../users/user.model');
const { verifyIdToken: verifyGoogleIdToken } = require('../../integrations/google');
const { auth } = require('../../shared/middleware/auth');
const rateLimit = require('../../shared/middleware/rateLimit');
const { asyncHandler } = require('../../shared/http');
const sessions = require('./session.service');
const mailer = require('../../integrations/email'); // module object so tests can stub sendEmail

// Brute-force protection: per IP, plus per account for password login.
const limitIp = rateLimit({ name: 'auth', max: env.rateLimit.authMax });
const limitAccount = rateLimit({
  name: 'auth-email',
  max: 10,
  windowSec: 15 * 60,
  key: (req) => (typeof req.body?.email === 'string' ? `email:${req.body.email.trim().toLowerCase()}` : null),
});
const limitRefresh = rateLimit({ name: 'auth-refresh', max: 60 });

// Account types a new user can choose (existing users may still be creators).
const SIGNUP_ROLES = ['traveler', 'agency'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores bytes beyond 72

const sanitize = (user) => {
  const obj = user.toObject();
  obj.hasPassword = Boolean(obj.password); // never the password itself
  delete obj.password;
  delete obj.refreshToken;
  delete obj.otpCode;
  delete obj.otpExpiry;
  delete obj.passwordReset;
  delete obj.googleId;
  return obj;
};

// Saves the user and opens a new device session (see session.service).
const startSession = async (user, req) => {
  if (user.isNew || user.isModified()) await user.save();
  return { ...(await sessions.createSession(user, req)), user: sanitize(user) };
};

// Only plain strings are accepted from input (never objects/arrays).
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const emailOf = (body) => text(body?.email).toLowerCase();

/** Returns an error message for a bad new password, or null. */
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  return null;
}

// Same bcrypt work whether or not the account exists, so response timing
// doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', env.auth.bcryptRounds);
const BAD_LOGIN = { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password' };

// POST /api/auth/signup  { name, email, password }
// New accounts start with needsAccountType=true; the app then asks the user
// to choose traveler / creator / agency (see PATCH /account-type).
router.post('/signup', limitIp, async (req, res, next) => {
  try {
    const name = text(req.body?.name).slice(0, 80);
    const email = emailOf(req.body);
    const { password } = req.body || {};

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ message: problem });
    if (await User.exists({ email })) {
      return res.status(409).json({
        code: 'EMAIL_EXISTS',
        message: 'An account with this email already exists. Please sign in.',
      });
    }

    const user = new User({ name, email, password, needsAccountType: true });
    res.status(201).json(await startSession(user, req));
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login  { email, password }
// One generic answer for "no such account", "wrong password" and
// "Google-only account", so the endpoint can't be used to probe emails.
router.post('/login', limitIp, limitAccount, async (req, res, next) => {
  try {
    const email = emailOf(req.body);
    const { password } = req.body || {};
    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    const ok = user?.password
      ? await user.comparePassword(password)
      : (await bcrypt.compare(password, DUMMY_HASH), false);
    if (!ok) return res.status(401).json(BAD_LOGIN);

    res.json(await startSession(user, req));
  } catch (error) {
    next(error);
  }
});

// ── Password reset (emailed 6-digit code) ───────────────────────────
const RESET_TTL_MS = 10 * 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;
const resetHash = (userId, code) =>
  crypto.createHmac('sha256', env.auth.jwtSecret).update(`${userId}:${code}`).digest('hex');
const limitResetEmail = rateLimit({
  name: 'reset-email',
  max: 3,
  windowSec: 15 * 60,
  key: (req) => (emailOf(req.body) ? `email:${emailOf(req.body)}` : null),
});

// POST /api/auth/password/forgot  { email }
// Always the same reply, whether or not the account exists.
router.post(
  '/password/forgot',
  limitIp,
  limitResetEmail,
  asyncHandler(async (req, res) => {
    const email = emailOf(req.body);
    const reply = { message: 'If an account exists for this email, we sent a 6-digit code. It expires in 10 minutes.' };
    if (!EMAIL_RE.test(email)) return res.json(reply);

    const user = await User.findOne({ email });
    if (user) {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      user.passwordReset = {
        codeHash: resetHash(user._id, code),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
        attempts: 0,
      };
      await user.save();
      await mailer.sendEmail({
        to: user.email,
        subject: 'Your Triptape password reset code',
        text:
          `Your Triptape code is ${code}. It expires in 10 minutes.\n\n` +
          "If you didn't ask to reset your password, ignore this email — your account is safe.",
      });
    }
    res.json(reply);
  })
);

// POST /api/auth/password/reset  { email, code, newPassword }
// Sets the new password, signs out EVERY device, and signs this one in.
router.post(
  '/password/reset',
  limitIp,
  limitAccount,
  asyncHandler(async (req, res) => {
    const email = emailOf(req.body);
    const code = text(req.body?.code);
    const { newPassword } = req.body || {};
    const invalidCode = { code: 'INVALID_CODE', message: 'That code is wrong or has expired. Request a new one.' };

    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ message: problem });

    const user = await User.findOne({ email });
    const pr = user?.passwordReset;
    if (!user || !pr?.codeHash || !pr.expiresAt || pr.expiresAt.getTime() < Date.now() || !/^\d{6}$/.test(code)) {
      return res.status(400).json(invalidCode);
    }
    const expected = Buffer.from(pr.codeHash);
    const given = Buffer.from(resetHash(user._id, code));
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      // Guessing is capped: after 5 wrong tries the code is destroyed.
      const attempts = (pr.attempts || 0) + 1;
      if (attempts >= RESET_MAX_ATTEMPTS) user.passwordReset = undefined;
      else user.passwordReset.attempts = attempts;
      await user.save();
      return res.status(400).json(invalidCode);
    }

    user.password = newPassword;
    user.passwordReset = undefined;
    user.passwordChangedAt = new Date();
    user.isVerified = true; // they proved they own the inbox
    await user.save();
    await sessions.revokeAllForUser(user._id, { reason: 'password_changed' });
    res.json(await startSession(user, req));
  })
);

// POST /api/auth/password/change  { currentPassword, newPassword }  (signed in)
// Other devices are signed out; this one stays signed in.
router.post(
  '/password/change',
  auth,
  limitIp,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ message: problem });

    const user = await User.findById(req.user._id);
    // Google-only accounts have no current password; they set one here.
    if (user.password && !(typeof currentPassword === 'string' && (await user.comparePassword(currentPassword)))) {
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' });
    }
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();
    const signedOut = await sessions.revokeAllForUser(user._id, {
      exceptSid: req.auth.sid,
      reason: 'password_changed',
    });
    res.json({ message: 'Password updated', otherDevicesSignedOut: signedOut });
  })
);

// POST /api/auth/google  { idToken }
// Signs in with Google. Finds the user by googleId, else links an existing
// email account (Google has verified the email), else creates a new account
// that still has to pick traveler / agency.
router.post('/google', limitIp, async (req, res, next) => {
  try {
    const idToken = text(req.body?.idToken);
    if (!idToken || idToken.length > 4096) return res.status(400).json({ message: 'idToken is required' });

    const g = await verifyGoogleIdToken(idToken);
    let user = await User.findOne({ googleId: g.googleId });
    let isNew = false;
    if (!user) {
      user = await User.findOne({ email: g.email });
      if (user) {
        user.googleId = g.googleId;
        if (!user.avatar) user.avatar = g.avatar;
      } else {
        isNew = true;
        user = new User({
          name: g.name,
          email: g.email,
          avatar: g.avatar,
          googleId: g.googleId,
          authProvider: 'google',
          isVerified: true,
          needsAccountType: true,
        });
      }
    }
    res.status(isNew ? 201 : 200).json(await startSession(user, req));
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

// POST /api/auth/refresh  { refreshToken } -> { token, refreshToken, accessTokenExpiresAt }
// The old refresh token is dead after this; the app must store the new one.
router.post(
  '/refresh',
  limitRefresh,
  asyncHandler(async (req, res) => {
    res.json(await sessions.rotate(req.body?.refreshToken));
  })
);

// POST /api/auth/logout  { refreshToken } — ends this device's session.
// Needs no access token, so it works even after the access token expired.
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await sessions.revokeByRefreshToken(req.body?.refreshToken);
    res.json({ message: 'Logged out' });
  })
);

// POST /api/auth/logout-all — signs out every device, including this one.
router.post(
  '/logout-all',
  auth,
  asyncHandler(async (req, res) => {
    const count = await sessions.revokeAllForUser(req.user._id);
    res.json({ message: 'Logged out of all devices', count });
  })
);

// GET /api/auth/sessions — signed-in devices ("current" marks this one).
router.get(
  '/sessions',
  auth,
  asyncHandler(async (req, res) => {
    res.json({ sessions: await sessions.listActive(req.user._id, req.auth.sid) });
  })
);

// DELETE /api/auth/sessions/:id — sign out one device.
router.delete(
  '/sessions/:id',
  auth,
  asyncHandler(async (req, res) => {
    if (!/^[a-f0-9]{24}$/.test(req.params.id)) return res.status(400).json({ message: 'Invalid session id' });
    await sessions.revokeSessionById(req.user._id, req.params.id);
    res.json({ message: 'Device signed out' });
  })
);

module.exports = router;
