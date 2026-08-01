const Campaign = require('./campaign.model');
const Template = require('../templates/template.model');
const { sendTemplateMessage } = require('../whatsapp/whatsapp.service');
const ApiError = require('../../utils/apiError');
const { deleteResources } = require('../../utils/cloudinaryCleanup');
const mongoose = require('mongoose');

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

const extractPlaceholders = (body) => {
  const matches = body.match(/{{(\d+)}}/g) || [];
  return matches.map(m => parseInt(m.match(/\d+/)[0], 10)).sort((a, b) => a - b);
};

// ✅ DYNAMIC: Build body parameters using the campaign's stored mapping
const buildBodyParameters = (recipient, placeholderNumbers, mapping) => {
  return placeholderNumbers.map(num => {
    // Get the column name for this placeholder number from the mapping
    const columnName = mapping?.[String(num)] || '';
    // Get the value from the recipient using the column name
    const value = columnName ? (recipient[columnName] || '') : '';
    return { type: 'text', text: value };
  });
};

const validateTemplateId = (templateId) => {
  if (!templateId) {
    throw new ApiError(400, 'Campaign is missing a template ID. Please recreate the campaign.');
  }
  if (!mongoose.Types.ObjectId.isValid(templateId)) {
    throw new ApiError(400, 'Invalid template ID format.');
  }
  return true;
};

// ─── Create campaign ─────────────────────────────────────────────────
const createCampaign = async (data) => {
  const campaign = await Campaign.create(data);
  return campaign;
};

// ─── Launch campaign ────────────────────────────────────────────────
const launchCampaign = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  if (campaign.status === 'sending') throw new ApiError(400, 'Campaign is already sending');

  validateTemplateId(campaign.templateId);

  const template = await Template.findById(campaign.templateId);
  if (!template) throw new ApiError(404, 'Template not found');
  const templateName = template.whatsappTemplateName || 'event_qr_delivery';

  campaign.status = 'sending';
  await campaign.save();

  const recipients = campaign.recipients;
  const activeIndices = campaign.activeVariants || [0];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    try {
      const variantIndex = activeIndices[i % activeIndices.length];
      const variant = template.variants[variantIndex];
      if (!variant) throw new Error(`Variant at index ${variantIndex} not found`);

      // Extract placeholder numbers from the variant body
      const placeholders = extractPlaceholders(variant.body);
      
      // ✅ DYNAMIC: Build body parameters using the campaign's mapping
      const bodyParams = buildBodyParameters(recipient, placeholders, campaign.mapping);

      const components = [];
      if (recipient.qrUrl) {
        components.push({
          type: 'header',
          parameters: [{ type: 'image', image: { link: recipient.qrUrl } }],
        });
      }
      components.push({
        type: 'body',
        parameters: bodyParams,
      });

      await sendTemplateMessage(recipient.phone, templateName, components, campaign.userId);

      recipient.status = 'sent';
      campaign.delivered += 1;
    } catch (err) {
      recipient.status = 'failed';
      recipient.failureReason = err.message || 'Unknown error';
      campaign.failed += 1;
    }

    if (i < recipients.length - 1 && (i + 1) % campaign.batchSize === 0) {
      await new Promise(resolve =>
        setTimeout(resolve, getWaitMilliseconds(campaign.waitValue, campaign.waitUnit))
      );
    }
    await campaign.save();
  }

  campaign.status = 'completed';
  await campaign.save();
  return campaign;
};

// ─── Get single campaign ─────────────────────────────────────────────
const getCampaignById = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  return campaign;
};

// ─── Get campaign history ───────────────────────────────────────────
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

// ─── Retry failed recipients ────────────────────────────────────────
const retryFailedRecipients = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  validateTemplateId(campaign.templateId);

  const template = await Template.findById(campaign.templateId);
  if (!template) throw new ApiError(404, 'Template not found');
  const templateName = template.whatsappTemplateName || 'event_qr_delivery';

  const failedRecipients = campaign.recipients.filter((r) => r.status === 'failed');
  if (failedRecipients.length === 0) throw new ApiError(400, 'No failed recipients to retry');

  campaign.status = 'sending';
  await campaign.save();

  const activeIndices = campaign.activeVariants || [0];

  for (const recipient of failedRecipients) {
    try {
      const variantIndex = activeIndices[0];
      const variant = template.variants[variantIndex];
      if (!variant) throw new Error('Variant not found');

      const placeholders = extractPlaceholders(variant.body);
      
      // ✅ DYNAMIC: Build body parameters using the campaign's mapping
      const bodyParams = buildBodyParameters(recipient, placeholders, campaign.mapping);

      const components = [];
      if (recipient.qrUrl) {
        components.push({
          type: 'header',
          parameters: [{ type: 'image', image: { link: recipient.qrUrl } }],
        });
      }
      components.push({
        type: 'body',
        parameters: bodyParams,
      });

      await sendTemplateMessage(recipient.phone, templateName, components, campaign.userId);

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

// ─── Delete campaign ─────────────────────────────────────────────────
const deleteCampaign = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  const publicIds = [];
  for (const recipient of campaign.recipients) {
    if (recipient.qrUrl && recipient.qrUrl.includes('cloudinary.com')) {
      const parts = recipient.qrUrl.split('/');
      const folderAndFile = parts.slice(parts.indexOf('upload') + 2).join('/');
      const publicId = folderAndFile.replace(/\.[^.]+$/, '');
      publicIds.push(publicId);
    }
  }

  if (publicIds.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < publicIds.length; i += batchSize) {
      const batch = publicIds.slice(i, i + batchSize);
      await deleteResources(batch);
    }
  }

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