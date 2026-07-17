const express = require('express');
const router = express.Router();
const { verifyWebhook, handleWebhookEvent } = require('./whatsapp.webhook');
const { sendTestMessage } = require('./whatsapp.service');
const auth = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');

// Webhook – no auth (called by Meta)
router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhookEvent);

// Test send – protected
router.post('/test-send', auth, asyncHandler(async (req, res) => {
  const { phone, templateName, variables } = req.body;
  await sendTestMessage(phone, templateName, variables);
  res.json({ success: true, message: 'Test message sent' });
}));

module.exports = router;