const Campaign = require('./campaign.model');
const { sendTemplateMessage } = require('../whatsapp/whatsapp.service');
const ApiError = require('../../utils/apiError');
const { deleteResources } = require('../../utils/cloudinaryCleanup');
// Helpers
const getWaitMilliseconds = (value, unit) => {
  const multipliers = {
    seconds: 1000,
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
  };
  return (value || 1) * (multipliers[unit] || 60000);
};

const createCampaign = async (data) => {
  const campaign = await Campaign.create(data);
  return campaign;
};

const launchCampaign = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  if (campaign.status === 'sending') throw new ApiError(400, 'Campaign is already sending');

  campaign.status = 'sending';
  await campaign.save();

  const total = campaign.recipients.length;

  for (let i = 0; i < total; i++) {
    const recipient = campaign.recipients[i];
    try {
      const components = [];
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
      components.push({
        type: 'body',
        parameters: [
          { type: 'text', text: recipient.name || '' },
          { type: 'text', text: recipient.event || '' },
          { type: 'text', text: recipient.date || '' },
        ],
      });

      // Pass campaign.userId so the WhatsApp service can use the user's saved credentials
      await sendTemplateMessage(
        recipient.phone,
        campaign.templateId || 'event_qr_delivery',
        components,
        campaign.userId          // ← 4th argument
      );
      recipient.status = 'sent';
      campaign.delivered += 1;
    } catch (err) {
      recipient.status = 'failed';
      recipient.failureReason = err.message || 'Unknown error';
      campaign.failed += 1;
    }

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

const getCampaignById = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  return campaign;
};

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

const retryFailedRecipients = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

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
        campaign.templateId || 'event_qr_delivery',
        components,
        campaign.userId          // ← 4th argument
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


module.exports = {
  createCampaign,
  launchCampaign,
  getCampaignHistory,
  retryFailedRecipients,
  deleteCampaign,
  getCampaignById,
};