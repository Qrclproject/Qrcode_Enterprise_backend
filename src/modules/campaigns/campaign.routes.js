const express = require('express');
const router = express.Router();
const multer = require('multer');
const ctrl = require('./campaign.controller');
const validate = require('../../middleware/validate');
const { createCampaignSchema, launchCampaignSchema, retryFailedSchema } = require('./campaign.validation');
const auth = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler');
const WhatsAppMessage = require('./message.model');

const upload = multer({ storage: multer.memoryStorage() });

// ─── Debug: test the phone normalizer ──────────────────────────
router.post('/debug/normalize-phone', auth, ctrl.debugNormalize);

// ─── Renormalize existing campaign recipients ──────────────────
router.post('/:campaignId/renormalize-phones', auth, ctrl.renormalizePhones);

// ─── Fetch messages ─────────────────────────────────────────────
router.get(
  '/:campaignId/messages',
  auth,
  asyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const { phone, recipientId, direction, status } = req.query;
    const filter = { campaignId };
    if (phone) filter.phone = phone;
    else if (recipientId) filter.recipientId = recipientId;
    if (direction) filter.direction = direction;
    if (status) filter.status = status;
    const messages = await WhatsAppMessage.find(filter).sort({ timestamp: 1 });
    res.json({ success: true, data: messages });
  })
);

router.delete('/:campaignId/scan-history/:scanId', auth, ctrl.deleteScanHistory);
router.put('/:campaignId/rename', auth, ctrl.rename);
router.post('/', auth, validate(createCampaignSchema), ctrl.create);
router.get('/history', auth, ctrl.getHistory);
router.post('/launch', auth, validate(launchCampaignSchema), ctrl.launch);
router.post('/:campaignId/retry', auth, validate(retryFailedSchema), ctrl.retryFailed);
router.delete('/:campaignId', auth, ctrl.remove);
router.get('/:campaignId', auth, ctrl.getById);

router.post('/:campaignId/generate-qrs', auth, ctrl.generateQRs);
router.get('/:campaignId/qr-progress', auth, ctrl.getQRProgress);

router.delete('/', auth, ctrl.deleteAll);

router.post('/upload-header', auth, upload.single('image'), ctrl.uploadHeaderImage);
router.put('/:campaignId/header-image', auth, ctrl.updateHeaderImage);

router.post('/:campaignId/check-in', auth, ctrl.checkIn);
router.post('/:campaignId/recipients', auth, ctrl.addRecipients);
router.get('/:campaignId/add-recipients-progress', auth, ctrl.getAddRecipientsProgress);
router.post('/:campaignId/recipients/:recipientId/reset-checkin', auth, ctrl.resetRecipientCheckIn);
router.post('/:campaignId/send-manual', auth, ctrl.sendManual);
router.get('/:campaignId/scan-history', auth, ctrl.getScanHistory);

module.exports = router;
