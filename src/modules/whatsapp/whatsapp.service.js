const axios = require('axios');
const config = require('../../config');
const Settings = require('../settings/settings.model');   // new – to read saved API credentials
const ApiError = require('../../utils/apiError');

// ─── Helper: get credentials (database first, then .env) ──────────
const getCredentials = async (userId) => {
  // If a user ID is provided, try to load their saved credentials
  if (userId) {
    try {
      const settings = await Settings.findOne({ userId });
      if (
        settings &&
        settings.apiCredentials &&
        settings.apiCredentials.phoneNumberId &&
        settings.apiCredentials.accessToken
      ) {
        return {
          phoneNumberId: settings.apiCredentials.phoneNumberId,
          accessToken: settings.apiCredentials.accessToken,
        };
      }
    } catch (err) {
      // If database lookup fails, fall back to .env
      console.warn('Could not read settings from DB, using .env credentials:', err.message);
    }
  }

  // Fallback – use environment variables (original behaviour)
  return {
    phoneNumberId: config.whatsapp.phoneNumberId,
    accessToken: config.whatsapp.accessToken,
  };
};

// ─── Send a template message (optionally with a specific user) ────
const sendTemplateMessage = async (to, templateName, components = [], userId = null) => {
  const creds = await getCredentials(userId);

  const url = `https://graph.facebook.com/v22.0/${creds.phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components,
    },
  };

  // 🔍 Log what we are about to send
  console.log('\n===== WHATSAPP REQUEST =====');
  console.log('URL:', url);
  console.log('Body:', JSON.stringify(body, null, 2));
  console.log('=============================');

  const { data } = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  // 🔍 Log the response
  console.log('✅ WhatsApp Response:', JSON.stringify(data, null, 2));

  if (data.error) {
    throw new ApiError(400, data.error.message || 'WhatsApp API error');
  }
  return data;
};

// ─── Send a test message (now also accepts userId) ────────────────
const sendTestMessage = async (to, templateName, variables, userId = null) => {
  const components = [];
  if (variables.qrUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: variables.qrUrl } }],
    });
  }
  components.push({
    type: 'body',
    parameters: [
      { type: 'text', text: variables.name || 'Test User' },
      { type: 'text', text: variables.event || 'Test Event' },
      { type: 'text', text: variables.date || '2026-01-01' },
    ],
  });

  return sendTemplateMessage(to, templateName, components, userId);
};

module.exports = { sendTemplateMessage, sendTestMessage };