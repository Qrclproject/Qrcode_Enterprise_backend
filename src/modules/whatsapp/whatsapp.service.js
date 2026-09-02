const axios = require('axios');
const config = require('../../config');
const Settings = require('../settings/settings.model');
const ApiError = require('../../utils/apiError');

// ─── Helper: get credentials (database first, then .env) ──────────
const getCredentials = async (userId) => {
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
      console.warn('Could not read settings from DB, using .env credentials:', err.message);
    }
  }

  return {
    phoneNumberId: config.whatsapp.phoneNumberId,
    accessToken: config.whatsapp.accessToken,
  };
};
// At the bottom, add the new function
const sendTextMessage = async (to, text, userId = null) => {
  const creds = await getCredentials(userId);
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v25.0';
  const url = `https://graph.facebook.com/${apiVersion}/${creds.phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to,               // digits only, e.g., "2349133281741"
    type: 'text',
    text: { body: text },
  };

  try {
    const { data } = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    return data;
  } catch (err) {
    throw new ApiError(400, err.response?.data?.error?.message || err.message);
  }
};

// ─── Send a template message (optionally with a specific user) ────
const sendTemplateMessage = async (to, templateName, components = [], userId = null) => {
  const creds = await getCredentials(userId);
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v25.0';
const url = `https://graph.facebook.com/${apiVersion}/${creds.phoneNumberId}/messages`;

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

  // 🔍 Log request
  console.log('\n===== WHATSAPP REQUEST =====');
  console.log('URL:', url);
  console.log('Body:', JSON.stringify(body, null, 2));
  console.log('=============================\n');

  try {
    const { data } = await axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // ✅ Log response
    console.log('\n===== WHATSAPP RESPONSE =====');
    console.log('Status: 200 (success)');
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('==============================\n');

    if (data.error) {
      throw new ApiError(400, data.error.message || 'WhatsApp API error');
    }
    return data;
  } catch (err) {
    // ❌ Log error response
    console.error('\n===== WHATSAPP ERROR =====');
    console.error('Status:', err.response?.status);
    console.error('Data:', JSON.stringify(err.response?.data, null, 2));
    console.error('===========================\n');

    if (err instanceof ApiError) throw err;
    throw new ApiError(400, err.response?.data?.error?.message || err.message);
  }
};

// ─── Send a test message ──────────────────────────────────────────
const sendTestMessage = async (to, templateName, variables, userId = null) => {
  const components = [];
  if (variables.qrUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: variables.qrUrl } }],
    });
  }

  const bodyParams = [];
  const numericKeys = Object.keys(variables)
    .filter(k => !isNaN(k) && k !== 'qrUrl')
    .sort((a, b) => Number(a) - Number(b));

  if (numericKeys.length > 0) {
    numericKeys.forEach(key => {
      bodyParams.push({ type: 'text', text: variables[key] || '' });
    });
  } else {
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

// ─── Third‑Party Number Validation ────────────────────────────────
const checkNumbers = async (phones) => {
  if (!Array.isArray(phones) || phones.length === 0) {
    throw new ApiError(400, 'phones array is required');
  }

  const baseUrl = process.env.NUMBER_CHECK_API_URL;
  const apiKey = process.env.NUMBER_CHECK_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new ApiError(500, 'Third‑party number validation is not configured');
  }

  // Process with limited concurrency to avoid rate limits
  const concurrency = 5;
  const queue = [...phones];
  const results = [];

  const worker = async () => {
    while (queue.length > 0) {
      const phone = queue.shift();
      try {
        // Assumes provider returns { exists: boolean } on GET /{phone}
        const { data } = await axios.get(`${baseUrl}/${encodeURIComponent(phone)}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 10000,
        });

        const exists = data?.exists === true;
        results.push({ input: phone, status: exists ? 'valid' : 'invalid' });
      } catch (err) {
        // If individual check fails, mark as invalid and include error
        results.push({
          input: phone,
          status: 'invalid',
          error: err.response?.data?.message || err.message,
        });
      }
    }
  };

  // Start workers
  const workers = Array(Math.min(concurrency, phones.length))
    .fill(null)
    .map(() => worker());
  await Promise.all(workers);

  // Restore original order for easier frontend display
  const resultMap = new Map(results.map(r => [r.input, r]));
  return phones.map(phone => resultMap.get(phone) || { input: phone, status: 'invalid' });
};

// ─── Exports ──────────────────────────────────────────────────────
module.exports = {
  sendTemplateMessage,
  sendTestMessage,
  getCredentials,
  checkNumbers,sendTextMessage,
};