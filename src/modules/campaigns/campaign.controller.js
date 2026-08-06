const asyncHandler = require('../../utils/asyncHandler');
const campaignService = require('./campaign.service');
const Campaign = require('./campaign.model');
const qrService = require('./qr.service');
const ApiError = require('../../utils/apiError');
const { deleteResources } = require('../../utils/cloudinaryCleanup');

// ─── CRUD ────────────────────────────────────────────────────────────
const create = asyncHandler(async (req, res) => {
  const campaignData = { ...req.body, userId: req.user.userId };
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

// ─── QR generation ──────────────────────────────────────────────────
const generateQRs = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  if (!campaign.recipients || campaign.recipients.length === 0) {
    throw new ApiError(400, 'Campaign has no recipients to generate QR codes for');
  }

  campaign.qrGenerationStatus = {
    total: campaign.recipients.length,
    completed: 0,
    status: 'processing',
  };
  await campaign.save();

  console.log(`🚀 Starting QR generation for campaign ${campaignId} with ${campaign.recipients.length} recipients`);

  // Start background processing – we don't await so it runs asynchronously
  processQRCodes(campaign._id).catch(err => {
    console.error('❌ QR generation background job crashed:', err.message);
  });

  res.json({
    success: true,
    message: 'QR generation started',
    campaignId,
    total: campaign.recipients.length,
  });
});

const getQRProgress = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const campaign = await Campaign.findById(campaignId).select('qrGenerationStatus recipients');
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  const total = campaign.qrGenerationStatus?.total || 0;
  const completed = campaign.qrGenerationStatus?.completed || 0;
  const status = campaign.qrGenerationStatus?.status || 'pending';

  console.log(`📊 QR progress for ${campaignId}: ${completed}/${total} (${status})`);

  res.json({
    success: true,
    total,
    completed,
    status,
  });
});

const getById = asyncHandler(async (req, res) => {
  const campaign = await campaignService.getCampaignById(req.params.campaignId);
  res.json({ success: true, data: campaign });
});

// ─── Delete ALL ──────────────────────────────────────────────────────
const deleteAll = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const campaigns = await Campaign.find({ userId });
  if (campaigns.length === 0) {
    return res.json({ success: true, message: 'No campaigns to delete' });
  }

  const allPublicIds = [];
  for (const campaign of campaigns) {
    for (const recipient of campaign.recipients) {
      if (recipient.qrUrl && recipient.qrUrl.includes('cloudinary.com')) {
        const parts = recipient.qrUrl.split('/');
        const folderAndFile = parts.slice(parts.indexOf('upload') + 2).join('/');
        const publicId = folderAndFile.replace(/\.[^.]+$/, '');
        allPublicIds.push(publicId);
      }
    }
  }

  if (allPublicIds.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < allPublicIds.length; i += batchSize) {
      const batch = allPublicIds.slice(i, i + batchSize);
      await deleteResources(batch);
    }
  }

  await Campaign.deleteMany({ userId });

  res.json({
    success: true,
    message: `Deleted ${campaigns.length} campaigns and ${allPublicIds.length} images`,
  });
});

// ─── Check‑in ──────────────────────────────────────────────────
const checkIn = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const { qrData } = req.body;
  if (!qrData) throw new ApiError(400, 'QR data is required');
  const result = await campaignService.checkInRecipient(campaignId, qrData);
  res.json({ success: true, data: result });
});

// ─── Get scan history ─────────────────────────────────────────
const getScanHistory = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const { search, page, limit } = req.query;
  const result = await campaignService.getScanHistory(campaignId, {
    search,
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
  });
  res.json({ success: true, data: result });
});

// ─── Background QR processing ────────────────────────────────────
async function processQRCodes(campaignId) {
  console.log(`🔄 processQRCodes called for campaign ${campaignId}`);
  
  const campaign = await Campaign.findById(campaignId).populate('designId');
  if (!campaign) {
    console.error(`❌ Campaign ${campaignId} not found`);
    return;
  }

  if (campaign.qrGenerationStatus?.status !== 'processing') {
    console.warn(`⚠️ Campaign ${campaignId} is not in processing state (status: ${campaign.qrGenerationStatus?.status})`);
    return;
  }

  const design = campaign.designId || null;
  const recipients = campaign.recipients;

  if (!recipients || recipients.length === 0) {
    console.warn(`⚠️ Campaign ${campaignId} has no recipients`);
    campaign.qrGenerationStatus.status = 'failed';
    await campaign.save();
    return;
  }

  console.log(`📋 Processing ${recipients.length} recipients for campaign ${campaignId}`);

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    try {
      console.log(`🔄 Generating QR for recipient ${i+1}/${recipients.length} (${recipient.phone})`);
      const qrUrl = await qrService.generateRecipientQR(recipient, campaignId, design);
      recipient.qrUrl = qrUrl;
      campaign.qrGenerationStatus.completed = i + 1;
      await campaign.save();
      console.log(`✅ QR generated for ${recipient.phone} (${i+1}/${recipients.length})`);
    } catch (err) {
      console.error(`❌ QR generation failed for ${recipient.phone}:`, err.message);
      // continue with next recipient
    }
  }

  // Mark as completed regardless of partial failures
  campaign.qrGenerationStatus.status = 'completed';
  await campaign.save();
  console.log(`✅ QR generation completed for campaign ${campaignId} (${campaign.qrGenerationStatus.completed}/${campaign.qrGenerationStatus.total})`);
}

// ─── Exports ──────────────────────────────────────────────────────
module.exports = {
  create,
  launch,
  getHistory,
  retryFailed,
  remove,
  generateQRs,
  getQRProgress,
  getById,
  deleteAll,
  checkIn,
  getScanHistory,
};