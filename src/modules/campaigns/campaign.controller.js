const asyncHandler = require('../../utils/asyncHandler');
const campaignService = require('./campaign.service');
const Campaign = require('./campaign.model');
const qrService = require('./qr.service');
const ApiError = require('../../utils/apiError');
const { deleteResources } = require('../../utils/cloudinaryCleanup');

// ─── CRUD ────────────────────────────────────────────────────────────
const create = asyncHandler(async (req, res) => {
  const campaignData = { ...req.body, userId: req.user._id };
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

// ─── Upload static header image ───────────────────────────────────────
const uploadHeaderImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'Image file is required');
  }
  const imageUrl = await campaignService.uploadHeaderImage(req.file.buffer);
  res.json({ success: true, url: imageUrl });
});

// ─── Update header image / includeHeaderImage for an existing campaign ──
const updateHeaderImage = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const { headerImageUrl, includeHeaderImage } = req.body;

  console.log('🔧 updateHeaderImage controller received:', { headerImageUrl, includeHeaderImage });

  const campaign = await campaignService.updateCampaignHeaderImage(campaignId, {
    headerImageUrl: headerImageUrl !== undefined ? headerImageUrl : undefined,
    includeHeaderImage: includeHeaderImage !== undefined ? includeHeaderImage : undefined,
  });

  res.json({ success: true, data: campaign });
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
  const userId = req.user._id;
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

// ─── Add recipients to existing campaign ─────────────────────
const addRecipients = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const { recipients, generateQr, sendNow } = req.body;

  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw new ApiError(400, 'recipients must be a non-empty array');
  }

  const campaign = await campaignService.addRecipientsToCampaign(campaignId, recipients, {
    generateQr: generateQr === true,
    sendNow: sendNow === true,
  });

  res.json({ success: true, data: campaign });
});

// ─── Get progress of add-recipients process ──────────────────
const getAddRecipientsProgress = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const campaign = await Campaign.findById(campaignId).select('addRecipientsStatus');
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  const { total, completed, status, phase } = campaign.addRecipientsStatus || {};
  res.json({
    success: true,
    total: total || 0,
    completed: completed || 0,
    status: status || 'pending',
    phase: phase || 'none',
  });
});

// ─── Send manual message to a specific number ─────────────────
const sendManual = asyncHandler(async (req, res) => {
  const { campaignId } = req.params;
  const { phone, variables } = req.body;
  if (!phone) throw new ApiError(400, 'Phone number is required');
  const result = await campaignService.sendManualMessage(campaignId, phone, variables || {});
  res.json({ success: true, data: result });
});

// ─── Reset check‑in for a recipient ────────────────────────────
const resetRecipientCheckIn = asyncHandler(async (req, res) => {
  const { campaignId, recipientId } = req.params;
  const result = await campaignService.resetRecipientCheckIn(campaignId, recipientId);
  res.json({ success: true, data: result });
});

async function processQRCodes(campaignId) {
  const campaign = await Campaign.findById(campaignId).populate('designId');
  if (!campaign) return;
  if (campaign.qrGenerationStatus?.status !== 'processing') return;

  const design = campaign.designId || null;
  const mapping = campaign.mapping || {};

  if (design) {
    console.log(`🎨 Using design: ${design.name}`);
    console.log(`  qrConfig:`, design.qrConfig);
    console.log(`  textOverlays:`, design.textOverlays?.length || 0);
  } else {
    console.log(`⚠️ No design assigned – generating plain QR codes.`);
  }

  const recipients = campaign.recipients;
  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    try {
      const qrUrl = await qrService.generateRecipientQR(recipient, campaignId, design, mapping);
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

// ─── Exports ──────────────────────────────────────────────────────
module.exports = {
  create,
  launch,
  getHistory,
  retryFailed,
  remove,
  uploadHeaderImage,
  updateHeaderImage,
  generateQRs,
  getQRProgress,
  getById,
  deleteAll,
  checkIn,
  getScanHistory,
  addRecipients,
  resetRecipientCheckIn,
  sendManual,
  getAddRecipientsProgress,   // 👈 new
};