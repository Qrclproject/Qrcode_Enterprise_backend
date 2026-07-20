const asyncHandler = require('../../utils/asyncHandler');
const campaignService = require('./campaign.service');
const Campaign = require('./campaign.model');
const qrService = require('./qr.service');
const ApiError = require('../../utils/apiError');

// ─── Existing CRUD functions ────────────────────────────────────
const create = asyncHandler(async (req, res) => {
  const campaignData = {
    ...req.body,
    userId: req.user.userId,
  };
  const campaign = await campaignService.createCampaign(campaignData);
  res.status(201).json({ success: true, data: campaign });
});

const launch = asyncHandler(async (req, res) => {
  const { campaignId } = req.body;
  const campaign = await campaignService.launchCampaign(campaignId);
  res.json({ success: true, data: campaign });
});

const getHistory = asyncHandler(async (req, res) => {
  const result = await campaignService.getCampaignHistory(req.query);
  res.json({ success: true, ...result });
});

const retryFailed = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const campaign = await campaignService.retryFailedRecipients(campaignId);
  res.json({ success: true, data: campaign });
});

const remove = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  await campaignService.deleteCampaign(campaignId);
  res.json({ success: true, message: 'Campaign deleted' });
});

// ─── QR generation endpoints ────────────────────────────────────

// POST /api/campaigns/:campaignId/generate-qrs
const generateQRs = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  campaign.qrGenerationStatus = {
    total: campaign.recipients.length,
    completed: 0,
    status: 'processing',
  };
  await campaign.save();

  // Start background processing
  processQRCodes(campaign._id).catch((err) => {
    console.error('QR generation failed:', err.message);
  });

  res.json({ success: true, message: 'QR generation started', campaignId });
});

// GET /api/campaigns/:campaignId/qr-progress
const getQRProgress = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const campaign = await Campaign.findById(campaignId).select('qrGenerationStatus recipients');
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  res.json({
    success: true,
    total: campaign.qrGenerationStatus?.total || 0,
    completed: campaign.qrGenerationStatus?.completed || 0,
    status: campaign.qrGenerationStatus?.status || 'pending',
  });
});
const getById = asyncHandler(async (req, res) => {
  const campaign = await campaignService.getCampaignById(req.params.campaignId);
  res.json({ success: true, data: campaign });
});

async function processQRCodes(campaignId) {
  const campaign = await Campaign.findById(campaignId).populate('designId');
  if (!campaign || campaign.qrGenerationStatus?.status !== 'processing') return;

  const design = campaign.designId || null;   // will be null if no design assigned

  const recipients = campaign.recipients;
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    try {
      const qrUrl = await qrService.generateRecipientQR(recipient, campaignId, design);
      recipient.qrUrl = qrUrl;
      campaign.qrGenerationStatus.completed = i + 1;
      await campaign.save();
    } catch (err) {
      console.error(`QR generation failed for ${recipient.phone}:`, err.message);
    }
  }

  campaign.qrGenerationStatus.status = 'completed';
  await campaign.save();
}

// Export everything
module.exports = {
  create,
  launch,
  getHistory,
  retryFailed,
  remove,
  generateQRs,
  getQRProgress,
  getById,           // <-- add this
};