const express = require('express');
const router = express.Router();
const multer = require('multer');
const ctrl = require('./campaign.controller');
const validate = require('../../middleware/validate');
const { createCampaignSchema, launchCampaignSchema, retryFailedSchema } = require('./campaign.validation');
const auth = require('../../middleware/auth');
const asyncHandler = require('../../utils/asyncHandler'); // 👈 Add this import
const WhatsAppMessage = require('./message.model'); // import at top

const upload = multer({ storage: multer.memoryStorage() });

router.get(
  '/:campaignId/messages',
  auth,
  asyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const { phone, recipientId } = req.query;

    console.log('\n===== 📥 FETCH MESSAGES REQUEST =====');
    console.log('Campaign ID:', campaignId);
    console.log('Phone:', phone || 'not provided');
    console.log('Recipient ID:', recipientId || 'not provided');
    console.log('=====================================\n');

    const filter = { campaignId };

    // Prefer phone if provided, fallback to recipientId
    if (phone) {
      filter.phone = phone;
    } else if (recipientId) {
      filter.recipientId = recipientId;
    }

    const messages = await WhatsAppMessage.find(filter).sort({ timestamp: 1 });

    console.log('\n===== 📤 FETCH MESSAGES RESPONSE =====');
    console.log('Messages returned:', messages.length);
    console.log('Data:', JSON.stringify(messages, null, 2));
    console.log('======================================\n');

    res.json({ success: true, data: messages });
  })
);
// ─── Existing routes ────────────────────────────────────────────────
router.delete('/:campaignId/scan-history/:scanId', auth, ctrl.deleteScanHistory);
router.put('/:campaignId/rename', auth, ctrl.rename);
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

// Upload static header image (standalone)
router.post('/upload-header', auth, upload.single('image'), ctrl.uploadHeaderImage);

// Update campaign header image
router.put('/:campaignId/header-image', auth, ctrl.updateHeaderImage);

// Check‑in
router.post('/:campaignId/check-in', auth, ctrl.checkIn);

// Add recipients (if needed)
router.post('/:campaignId/recipients', auth, ctrl.addRecipients);

// ✅ Get progress of add-recipients process
router.get('/:campaignId/add-recipients-progress', auth, ctrl.getAddRecipientsProgress);

// ✅ Reset check‑in for a specific recipient
router.post('/:campaignId/recipients/:recipientId/reset-checkin', auth, ctrl.resetRecipientCheckIn);

// Send manual message
router.post('/:campaignId/send-manual', auth, ctrl.sendManual);

// Scan history
router.get('/:campaignId/scan-history', auth, ctrl.getScanHistory);

module.exports = router;