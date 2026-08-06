const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const validate = require('../../middleware/validate');
const { registerSchema, loginSchema, createAgentSchema, updateAgentSchema } = require('./auth.validation');
const { authLimiter } = require('../../middleware/rateLimiter');
const auth = require('../../middleware/auth');
const adminOnly = require('../../middleware/adminOnly');

// Public routes
router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);

// ─── Agent management (admin only) ─────────────────────────────
router.post('/agents', auth, adminOnly, validate(createAgentSchema), authController.createAgent);
router.get('/agents', auth, adminOnly, authController.getAgents);
router.put('/agents/:agentId', auth, adminOnly, validate(updateAgentSchema), authController.updateAgent);
router.delete('/agents/:agentId', auth, adminOnly, authController.deleteAgent);

module.exports = router;