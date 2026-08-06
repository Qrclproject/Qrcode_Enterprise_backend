const jwt = require('jsonwebtoken');
const User = require('./auth.model');
const config = require('../../config');
const ApiError = require('../../utils/apiError');

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
      permissions: user.permissions || [],
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
};

const register = async ({ name, email, password }) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) throw new ApiError(400, 'Email already registered');

  const user = await User.create({ name, email, password, role: 'admin' });
  const token = generateToken(user);

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role, permissions: user.permissions },
  };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(401, 'Invalid email or password');

  const isMatch = await user.comparePassword(password);
  if (!isMatch) throw new ApiError(401, 'Invalid email or password');

  const token = generateToken(user);
  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role, permissions: user.permissions },
  };
};


// ─── Agent management ──────────────────────────────────────────
const createAgent = async (adminId, { email, name, password, permissions }) => {
  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(400, 'Email already registered');

  const agent = await User.create({
    email,
    name,
    password,
    role: 'agent',
    permissions: permissions || [],
  });

  return { id: agent._id, email: agent.email, name: agent.name, role: agent.role, permissions: agent.permissions };
};

const getAgents = async () => {
  return User.find({ role: 'agent' }).select('-password').sort({ createdAt: -1 });
};

const updateAgent = async (agentId, updateData) => {
  const agent = await User.findById(agentId);
  if (!agent) throw new ApiError(404, 'Agent not found');
  if (agent.role !== 'agent') throw new ApiError(400, 'User is not an agent');

  if (updateData.name !== undefined) agent.name = updateData.name;
  if (updateData.permissions !== undefined) agent.permissions = updateData.permissions;

  await agent.save();
  return { id: agent._id, email: agent.email, name: agent.name, role: agent.role, permissions: agent.permissions };
};

const deleteAgent = async (agentId) => {
  const agent = await User.findById(agentId);
  if (!agent) throw new ApiError(404, 'Agent not found');
  if (agent.role !== 'agent') throw new ApiError(400, 'User is not an agent');
  await agent.deleteOne();
  return { success: true };
};

module.exports = { register, login, createAgent, getAgents, updateAgent, deleteAgent };