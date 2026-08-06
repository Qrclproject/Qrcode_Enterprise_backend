const asyncHandler = require('../../utils/asyncHandler');
const authService = require('./auth.service');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json({ success: true, data: result });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json({ success: true, data: result });
});

// ─── Agent management ──────────────────────────────────────────
const createAgent = asyncHandler(async (req, res) => {
  const agent = await authService.createAgent(req.user.id, req.body);
  res.status(201).json({ success: true, data: agent });
});

const getAgents = asyncHandler(async (req, res) => {
  const agents = await authService.getAgents();
  res.json({ success: true, data: agents });
});

const updateAgent = asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const agent = await authService.updateAgent(agentId, req.body);
  res.json({ success: true, data: agent });
});

const deleteAgent = asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  await authService.deleteAgent(agentId);
  res.json({ success: true, message: 'Agent deleted' });
});

module.exports = { register, login, createAgent, getAgents, updateAgent, deleteAgent };