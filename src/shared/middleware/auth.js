const jwt = require('jsonwebtoken');
const User = require('../../modules/users/user.model');

const env = require('../../config/env');

const JWT_SECRET = env.auth.jwtSecret;

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId).select('-password -refreshToken');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Optional auth - doesn't fail if no token, just sets req.user if present
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password -refreshToken');
      if (user) req.user = user;
    }
  } catch (e) {
    // Silently continue without auth
  }
  next();
};

const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: env.auth.accessTtl });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, env.auth.jwtRefreshSecret, { expiresIn: env.auth.refreshTtl });
};

module.exports = { auth, optionalAuth, generateAccessToken, generateRefreshToken, JWT_SECRET };
