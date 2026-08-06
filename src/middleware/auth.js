const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../utils/apiError');
const User = require('../modules/auth/auth.model');

const auth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new ApiError(401, 'No token provided'));
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    // Fetch the full user from DB to get role and permissions
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return next(new ApiError(401, 'User not found'));
    }
    req.user = user; // attach full user object (includes role, permissions)
    next();
  } catch (err) {
    next(new ApiError(401, 'Invalid or expired token'));
  }
};

module.exports = auth;