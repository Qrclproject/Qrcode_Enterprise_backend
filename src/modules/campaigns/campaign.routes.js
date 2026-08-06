const express = require('express');
const router = express.Router();
const ctrl = require('./campaign.controller');
const validate = require('../../middleware/validate');
const { createCampaignSchema, launchCampaignSchema, retryFailedSchema } = require('./campaign.validation');
const auth = require('../../middleware/auth');

// Existing routes
router.post('/', auth, validate(createCampaignSchema), ctrl.create);
router.get('/history', auth, ctrl.getHistory);
router.post('/launch', auth, validate(launchCampaignSchema), ctrl.launch);
router.post('/:campaignId/retry', auth, validate(retryFailedSchema), ctrl.retryFailed);
router.delete('/:campaignId', auth, ctrl.remove);
router.get('/:campaignId', auth, ctrl.getById);

// QR generation
router.post('/:campaignId/generate-qrs', auth, ctrl.generateQRs);
router.get('/:campaignId/qr-progress', auth, ctrl.getQRProgress);

// Delete ALL
router.delete('/', auth, ctrl.deleteAll);

// ─── Check‑in ────────────────────────────────────────────────────
router.post('/:campaignId/check-in', auth, ctrl.checkIn);

// ─── Scan history ──────────────────────────────────────────────
router.get('/:campaignId/scan-history', auth, ctrl.getScanHistory);

module.exports = router;