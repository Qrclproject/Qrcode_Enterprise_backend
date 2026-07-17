const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const Template = require('../src/modules/templates/template.model');

let token;

beforeAll(async () => {
  const testUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/eventpass_test';
  await mongoose.connect(testUri);
  // Register user and get token
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Template Tester', email: 'templates@test.com', password: 'password123' });
  token = res.body.data.token;
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Template.deleteMany({});
});

describe('Template CRUD', () => {
  it('should create a template', async () => {
    const templateData = {
      name: 'Event Delivery',
      category: 'delivery',
      variants: [{ label: 'Friendly', body: 'Hi {{1}}, your pass for {{2}} on {{3}} is ready!', active: true }],
    };
    const res = await request(app)
      .post('/api/templates')
      .set('Authorization', `Bearer ${token}`)
      .send(templateData);
    expect(res.statusCode).toBe(201);
    expect(res.body.data.name).toBe('Event Delivery');
  });

  it('should clone a template', async () => {
    const original = await Template.create({
      name: 'Original',
      variants: [{ label: 'Default', body: 'Hello {{1}}', active: true }],
    });
    const res = await request(app)
      .post(`/api/templates/${original._id}/clone`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(201);
    expect(res.body.data.name).toBe('Original (Copy)');
  });
});