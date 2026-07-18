const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const campaignRoutes = require('./modules/campaigns/campaign.routes');
const templateRoutes = require('./modules/templates/template.routes');
const whatsappRoutes = require('./modules/whatsapp/whatsapp.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const settingsRoutes = require('./modules/settings/settings.routes');

const app = express();

// Global middlewares
app.use(cors({ origin: 'https://qrclfrontendevent.vercel.app' }));
app.use(express.json());
app.use(generalLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error handler (must be last)
app.use(errorHandler);

module.exports = app;
