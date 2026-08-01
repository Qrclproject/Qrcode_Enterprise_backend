const Campaign = require('./campaign.model');
const Template = require('../templates/template.model'); // 👈 NEW: import Template model
const { sendTemplateMessage } = require('../whatsapp/whatsapp.service');
const ApiError = require('../../utils/apiError');
const { deleteResources } = require('../../utils/cloudinaryCleanup');

// ─── Helpers ──────────────────────────────────────────────────────────
const getWaitMilliseconds = (value, unit) => {
  const multipliers = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };
  return (value || 1) * (multipliers[unit] || 60000);
};

// ─── Create campaign (unchanged) ────────────────────────────────────
const createCampaign = async (data) => {
  const campaign = await Campaign.create(data);
  return campaign;
};

// ─── Launch campaign ────────────────────────────────────────────────
const launchCampaign = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  if (campaign.status === 'sending') throw new ApiError(400, 'Campaign is already sending');

  // 👇 NEW: Fetch the template to get the WhatsApp-approved name
  let templateName = 'event_qr_delivery'; // fallback
  if (campaign.templateId) {
    const template = await Template.findById(campaign.templateId);
    if (template && template.whatsappTemplateName) {
      templateName = template.whatsappTemplateName;
    } else {
      // If template exists but has no whatsappTemplateName, fallback to its name or id
      // but we strongly recommend adding the field.
      console.warn(`Template ${campaign.templateId} has no whatsappTemplateName. Using fallback.`);
    }
  }

  campaign.status = 'sending';
  await campaign.save();

  const total = campaign.recipients.length;

  for (let i = 0; i < total; i++) {
    const recipient = campaign.recipients[i];
    try {
      const components = [];

      // ── Header (QR image) if present ──
      if (recipient.qrUrl) {
        components.push({
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: { link: recipient.qrUrl },
            },
          ],
        });
      }

      // ── Body parameters ──
      // 🔥 IMPORTANT: The order and number of parameters must match the WhatsApp template's placeholders.
      // Currently we send name, event, date as {{1}}, {{2}}, {{3}}.
      // If your template expects different placeholders, adjust accordingly.
      components.push({
        type: 'body',
        parameters: [
          { type: 'text', text: recipient.name || '' },
          { type: 'text', text: recipient.event || '' },
          { type: 'text', text: recipient.date || '' },
        ],
      });

      // 👇 Use the resolved templateName (WhatsApp-approved name)
      await sendTemplateMessage(
        recipient.phone,
        templateName, // ✅ Now this is the correct WhatsApp template name
        components,
        campaign.userId
      );

      recipient.status = 'sent';
      campaign.delivered += 1;
    } catch (err) {
      recipient.status = 'failed';
      recipient.failureReason = err.message || 'Unknown error';
      campaign.failed += 1;
    }

    // ── Batching delay ──
    if (i < total - 1 && (i + 1) % campaign.batchSize === 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, getWaitMilliseconds(campaign.waitValue, campaign.waitUnit))
      );
    }

    await campaign.save();
  }

  campaign.status = 'completed';
  await campaign.save();
  return campaign;
};

// ─── Get single campaign (unchanged) ──────────────────────────────
const getCampaignById = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  return campaign;
};

// ─── Get campaign history (unchanged) ──────────────────────────────
const getCampaignHistory = async (filters = {}) => {
  const { search, status, page = 1, limit = 10 } = filters;
  const query = {};
  if (status && status !== 'all') query.status = status;
  if (search) query.name = { $regex: search, $options: 'i' };
  const total = await Campaign.countDocuments(query);
  const campaigns = await Campaign.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  return { campaigns, total, page, totalPages: Math.ceil(total / limit) };
};

// ─── Retry failed recipients ───────────────────────────────────────
const retryFailedRecipients = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  // 👇 Fetch template name (same logic as launch)
  let templateName = 'event_qr_delivery';
  if (campaign.templateId) {
    const template = await Template.findById(campaign.templateId);
    if (template && template.whatsappTemplateName) {
      templateName = template.whatsappTemplateName;
    }
  }

  const failedRecipients = campaign.recipients.filter((r) => r.status === 'failed');
  if (failedRecipients.length === 0) throw new ApiError(400, 'No failed recipients to retry');

  campaign.status = 'sending';
  await campaign.save();

  for (const recipient of failedRecipients) {
    try {
      const components = [];
      if (recipient.qrUrl) {
        components.push({
          type: 'header',
          parameters: [{ type: 'image', image: { link: recipient.qrUrl } }],
        });
      }
      components.push({
        type: 'body',
        parameters: [
          { type: 'text', text: recipient.name || '' },
          { type: 'text', text: recipient.event || '' },
          { type: 'text', text: recipient.date || '' },
        ],
      });

      await sendTemplateMessage(
        recipient.phone,
        templateName, // ✅ Use WhatsApp template name
        components,
        campaign.userId
      );
      recipient.status = 'sent';
      recipient.failureReason = undefined;
      campaign.delivered += 1;
      campaign.failed -= 1;
    } catch (err) {
      recipient.failureReason = err.message || 'Unknown error';
    }
  }

  campaign.status = 'completed';
  await campaign.save();
  return campaign;
};

// ─── Delete campaign (unchanged) ──────────────────────────────────
const deleteCampaign = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  // Collect public IDs of all QR images for this campaign
  const publicIds = [];
  for (const recipient of campaign.recipients) {
    if (recipient.qrUrl && recipient.qrUrl.includes('cloudinary.com')) {
      const parts = recipient.qrUrl.split('/');
      const folderAndFile = parts.slice(parts.indexOf('upload') + 2).join('/');
      const publicId = folderAndFile.replace(/\.[^.]+$/, '');
      publicIds.push(publicId);
    }
  }

  // Delete from Cloudinary (in batches of 100)
  if (publicIds.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < publicIds.length; i += batchSize) {
      const batch = publicIds.slice(i, i + batchSize);
      await deleteResources(batch);
    }
  }

  // Finally, delete the campaign from the database
  await Campaign.findByIdAndDelete(campaignId);
  return { deleted: true, imagesRemoved: publicIds.length };
};

// ─── Exports ─────────────────────────────────────────────────────────
module.exports = {
  createCampaign,
  launchCampaign,
  getCampaignHistory,
  retryFailedRecipients,
  deleteCampaign,
  getCampaignById,
};