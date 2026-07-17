const request = require('supertest');
const app = require('../src/app');
const config = require('../src/config');

// Mock the WhatsApp service
jest.mock('../src/modules/whatsapp/whatsapp.service', () => ({
  sendTemplateMessage: jest.fn().mockResolvedValue({ messages: [{ id: 'wamid.xyz' }] }),
  sendTestMessage: jest.fn().mockResolvedValue({ messages: [{ id: 'wamid.test' }] }),
}));

describe('WhatsApp Webhook', () => {
  it('should verify webhook with correct token', async () => {
    const res = await request(app)
      .get('/api/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': config.whatsapp.verifyToken,
        'hub.challenge': 'challenge_code',
      });
    expect(res.statusCode).toBe(200);
    expect(res.text).toBe('challenge_code');
  });

  it('should reject invalid webhook token', async () => {
    const res = await request(app)
      .get('/api/whatsapp/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'invalid_token',
        'hub.challenge': 'challenge_code',
      });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/whatsapp/test-send', () => {
  it('should send a test message (authenticated)', async () => {
    // Obtain a token first (or use a static token)
    const authRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'testwhatsapp@example.com', password: 'pass123' });
    const token = authRes.body.data.token;

    const res = await request(app)
      .post('/api/whatsapp/test-send')
      .set('Authorization', `Bearer ${token}`)
      .send({
        phone: '+2348012345678',
        templateName: 'event_qr_delivery',
        variables: { name: 'Test', event: 'Test Event', date: '2026-01-01' },
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });
});