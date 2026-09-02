const express = require('express');
const router = express.Router();
const axios = require('axios');
const { verifyWebhook, handleWebhookEvent } = require('./whatsapp.webhook');
const {
  sendTestMessage,
  getCredentials,
  sendTextMessage,
  checkNumbers,   // 👈 import
} = require('./whatsapp.service');
const auth = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const Campaign = require('../campaigns/campaign.model');
const WhatsAppMessage = require('../campaigns/message.model');
// Webhook – no auth (called by Meta)
router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhookEvent);
router.post('/send-text', auth, asyncHandler(async (req, res) => {
  const { phone, text } = req.body;
  if (!phone || !text) throw new ApiError(400, 'Phone and text are required');

  const normalizedPhone = phone.replace(/\D/g, '');
  const result = await sendTextMessage(normalizedPhone, text);

  // Save outgoing message in all matching campaigns
  const campaigns = await Campaign.find({ 'recipients.phone': normalizedPhone });
  for (const campaign of campaigns) {
    const recipient = campaign.recipients.find(r => r.phone === normalizedPhone);
    if (recipient) {
      await WhatsAppMessage.create({
        campaignId: campaign._id,
        recipientId: recipient._id,
        phone: normalizedPhone,
        direction: 'outgoing',
        body: text,
        whatsappMessageId: result.messages?.[0]?.id,
        timestamp: new Date(),
      });
    }
  }

  res.json({ success: true, data: result });
}));
// Health check – validates WhatsApp API credentials
router.get('/health', async (req, res) => {
  try {
    const { phoneNumberId, accessToken } = await getCredentials();

    const url = `https://graph.facebook.com/v22.0/${phoneNumberId}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 5000,
    });

    if (response.data && response.data.id) {
      return res.json({
        status: 'ok',
        service: 'whatsapp',
        details: 'API credentials valid',
        phoneNumberId: response.data.id,
        displayPhoneNumber: response.data.display_phone_number,
      });
    } else {
      throw new Error('Invalid API response');
    }
  } catch (error) {
    console.error('WhatsApp health check failed:', error.message);
    return res.status(503).json({
      status: 'error',
      service: 'whatsapp',
      details: error.response?.data?.error?.message || error.message || 'Unable to verify WhatsApp API credentials',
    });
  }
});

// Check numbers – protected (uses third‑party validation now)
router.post('/check-numbers', auth, asyncHandler(async (req, res) => {
  const { phones } = req.body;
  if (!Array.isArray(phones) || phones.length === 0) {
    return res.status(400).json({ success: false, message: 'phones array is required' });
  }
  const results = await checkNumbers(phones);
  res.json({ success: true, results });
}));

// Test send – protected
router.post('/test-send', auth, asyncHandler(async (req, res) => {
  const { phone, templateName, variables } = req.body;
  await sendTestMessage(phone, templateName, variables);
  res.json({ success: true, message: 'Test message sent' });
}));

module.exports = router;