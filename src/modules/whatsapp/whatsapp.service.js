const axios = require('axios');
const config = require('../../config');
const Settings = require('../settings/settings.model');
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

  // 🔍 Enhanced log
  console.log('\n===== WHATSAPP REQUEST (FULL) =====');
  console.log('URL:', url);
  console.log('Body:', JSON.stringify(body, null, 2));
  console.log('=====================================\n');

  const { data } = await axios.post(url, body, {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

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
  // Build body parameters from variables object
  // For dynamic placeholders, we assume variables contains keys 1,2,3,... or name, event, date
  // We'll map any keys that are numbers to parameters in order
  const bodyParams = [];
  // If variables has numeric keys, use them in order
  const numericKeys = Object.keys(variables)
    .filter(k => !isNaN(k) && k !== 'qrUrl')
    .sort((a, b) => Number(a) - Number(b));
  if (numericKeys.length > 0) {
    numericKeys.forEach(key => {
      bodyParams.push({ type: 'text', text: variables[key] || '' });
    });
  } else {
    // Fallback to legacy fields: name, event, date
    bodyParams.push({ type: 'text', text: variables.name || 'Test User' });
    bodyParams.push({ type: 'text', text: variables.event || 'Test Event' });
    bodyParams.push({ type: 'text', text: variables.date || '2026-01-01' });
  }

  components.push({
    type: 'body',
    parameters: bodyParams,
  });

  return sendTemplateMessage(to, templateName, components, userId);
};

// ─── Exports ──────────────────────────────────────────────────────
module.exports = {
  sendTemplateMessage,
  sendTestMessage,
  getCredentials, // 👈 Now exported for health check and other uses
};