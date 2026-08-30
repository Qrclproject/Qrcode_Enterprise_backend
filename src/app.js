const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');
const mediaRoutes = require('./modules/media/media.routes');
// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const campaignRoutes = require('./modules/campaigns/campaign.routes');
const templateRoutes = require('./modules/templates/template.routes');
const whatsappRoutes = require('./modules/whatsapp/whatsapp.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const designRoutes = require('./modules/designs/design.routes');

const app = express();

// ─── TRUST REVERSE PROXY FOR RENDER DEPLOYMENTS ─────────────────
// This must be set before any rate limiters process requests
app.set('trust proxy', 1);

// ─── CORS: allow both local dev and production frontend ──────────
const allowedOrigins = [
  'http://localhost:5173',    
  'https://qrcode-enterprise.vercel.app',      // production
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// ─── Increase request body size limits ──────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(generalLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/designs', designRoutes);
app.use('/api/media', mediaRoutes);
// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error handler
app.use(errorHandler);

module.exports = app;
