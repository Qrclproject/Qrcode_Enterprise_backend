const jwt = require('jsonwebtoken');
const User = require('./auth.model');
const config = require('../../config');
const ApiError = require('../../utils/apiError');

const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
};

const register = async ({ name, email, password }) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError(400, 'Email already registered');
  }

  const user = await User.create({ name, email, password });
  const token = generateToken(user._id, user.email);

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email },
  };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const token = generateToken(user._id, user.email);
  return {
    token,
    user: { id: user._id, name: user.name, email: user.email },
  };
};

module.exports = { register, login };