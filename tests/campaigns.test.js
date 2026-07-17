const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Campaign = require('../src/modules/campaigns/campaign.model');
const { sendTemplateMessage } = require('../src/modules/whatsapp/whatsapp.service');

// Mock the WhatsApp service to avoid real API calls
jest.mock('../src/modules/whatsapp/whatsapp.service', () => ({
  sendTemplateMessage: jest.fn().mockResolvedValue({ messages: [{ id: 'wamid.123' }] }),
}));

let token; // Will hold a valid JWT for authenticated requests

beforeAll(async () => {
  // Connect to test database (or use in‑memory MongoDB)
  const testUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/eventpass_test';
  await mongoose.connect(testUri);

  // Create a test user and obtain a token (you can use the auth routes directly or create one manually)
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email: 'test@example.com', password: 'password123' });
  token = res.body.data.token;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Campaign.deleteMany({});
});

describe('POST /api/campaigns', () => {
  it('should create a new campaign', async () => {
    const campaignData = {
      name: 'Test Campaign',
      recipients: [
        { phone: '+2348012345678', name: 'Alice', event: 'Test Event', date: '2026-08-01', qrUrl: 'https://example.com/qr' },
      ],
      batchSize: 5,
    };
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send(campaignData);
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Test Campaign');
  });
});

describe('POST /api/campaigns/launch', () => {
  it('should launch a campaign and update status to completed', async () => {
    // Create a campaign first
    const campaign = await Campaign.create({
      name: 'Launch Test',
      templateId: 'event_qr_delivery',
      recipients: [
        { phone: '+2348012345678', name: 'Bob', event: 'Event', date: '2026-07-20' },
      ],
      batchSize: 1,
    });
    const res = await request(app)
      .post('/api/campaigns/launch')
      .set('Authorization', `Bearer ${token}`)
      .send({ campaignId: campaign._id.toString() });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.delivered).toBe(1);
    expect(res.body.data.failed).toBe(0);
  });
});

describe('POST /api/campaigns/:campaignId/retry', () => {
  it('should retry failed recipients', async () => {
    const campaign = await Campaign.create({
      name: 'Retry Test',
      recipients: [
        { phone: '+2348012345678', name: 'Fail', status: 'failed', failureReason: 'Test fail' },
        { phone: '+2348098765432', name: 'Pass', status: 'sent' },
      ],
      delivered: 1,
      failed: 1,
    });
    const res = await request(app)
      .post(`/api/campaigns/${campaign._id}/retry`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('completed');
    // After retry, the failed one should now be sent
    expect(res.body.data.failed).toBe(0);
    expect(res.body.data.delivered).toBe(2);
  });
});