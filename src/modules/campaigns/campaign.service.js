const Campaign = require('./campaign.model');
const Template = require('../templates/template.model');
const { sendTemplateMessage } = require('../whatsapp/whatsapp.service');
const ApiError = require('../../utils/apiError');
const { deleteResources } = require('../../utils/cloudinaryCleanup');
const mongoose = require('mongoose');
const { decrypt } = require('../../utils/encryption');
const cloudinary = require('cloudinary').v2;
const config = require('../../config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

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

const buildBodyParameters = (recipient, placeholderNumbers, mapping) => {
  return placeholderNumbers.map(num => {
    const columnName = mapping?.[String(num)] || '';
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

// ─── Upload static header image to Cloudinary ─────────────────
const uploadHeaderImage = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'campaign_headers',
        resource_type: 'image',
        format: 'png',
      },
      (error, result) => (error ? reject(error) : resolve(result.secure_url))
    );
    stream.end(buffer);
  });
};

// ─── Update campaign header image / includeHeaderImage flag ───
const updateCampaignHeaderImage = async (campaignId, updates) => {
  console.log('🔧 updateCampaignHeaderImage called with:', { campaignId, updates });

  // Defensive: if updates is a string (old behaviour), convert it
  if (typeof updates === 'string') {
    updates = { headerImageUrl: updates };
  }

  const updateFields = {};

  if (updates.headerImageUrl !== undefined) {
    updateFields.headerImageUrl = updates.headerImageUrl;
  }
  if (updates.includeHeaderImage !== undefined) {
    updateFields.includeHeaderImage = updates.includeHeaderImage;
  }

  console.log('🔧 Final updateFields:', updateFields);

  const campaign = await Campaign.findByIdAndUpdate(
    campaignId,
    updateFields,
    { returnDocument: 'after', runValidators: true }
  );
  if (!campaign) throw new ApiError(404, 'Campaign not found');
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

      const placeholders = extractPlaceholders(variant.body);
      const bodyParams = buildBodyParameters(recipient, placeholders, campaign.mapping);

      const components = [];

      // ✅ Use explicit includeHeaderImage flag
      if (campaign.includeHeaderImage && template.showQR !== false) {
        if (campaign.headerImageUrl) {
          components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: campaign.headerImageUrl } }],
          });
        } else if (recipient.qrUrl) {
          components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: recipient.qrUrl } }],
          });
        }
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
      const bodyParams = buildBodyParameters(recipient, placeholders, campaign.mapping);

      const components = [];

      if (campaign.includeHeaderImage && template.showQR !== false) {
        if (campaign.headerImageUrl) {
          components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: campaign.headerImageUrl } }],
          });
        } else if (recipient.qrUrl) {
          components.push({
            type: 'header',
            parameters: [{ type: 'image', image: { link: recipient.qrUrl } }],
          });
        }
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

// ─── Check‑in recipient ─────────────────────────────────────────────
const checkInRecipient = async (campaignId, qrData) => {
  let rawData;
  try {
    rawData = decrypt(qrData);
  } catch (err) {
    throw new ApiError(400, 'Invalid QR code: decryption failed');
  }

  const parts = rawData.split('|');
  const core = parts[0];
  const coreParts = core.split('_');
  if (coreParts.length < 2) {
    throw new ApiError(400, 'Invalid QR code data');
  }

  const [campaignIdFromQR, phone] = coreParts;

  if (campaignIdFromQR !== campaignId) {
    throw new ApiError(400, 'QR code does not belong to this event');
  }

  const campaign = await Campaign.findById(campaignId).populate('designId');
  if (!campaign) {
    throw new ApiError(404, 'Event not found');
  }

  const recipient = campaign.recipients.find(r => r.phone === phone);
  if (!recipient) {
    campaign.scanHistory.push({
      phone,
      name: 'Unknown',
      status: 'failed',
      message: 'Recipient not found for this event',
    });
    await campaign.save();
    throw new ApiError(404, 'Recipient not found for this event');
  }

  if (recipient.checkedIn) {
    campaign.scanHistory.push({
      phone: recipient.phone,
      name: recipient.name || recipient.phone,
      status: 'failed',
      message: 'Already checked in',
    });
    await campaign.save();
    throw new ApiError(400, 'This QR code has already been used for check‑in');
  }

  let qrDataFields = [];
  const design = campaign.designId;
  if (design && design.qrDataFields && design.qrDataFields.length > 0) {
    const extraParts = parts.slice(1);
    qrDataFields = design.qrDataFields.map((fieldKey, idx) => {
      const columnName = campaign.mapping?.[fieldKey] || fieldKey;
      return {
        label: columnName,
        value: extraParts[idx] !== undefined ? extraParts[idx] : '',
      };
    });
  }

  recipient.checkedIn = true;
  recipient.checkedInAt = new Date();
  campaign.scanHistory.push({
    phone: recipient.phone,
    name: recipient.name || recipient.phone,
    status: 'success',
    message: 'Checked in successfully',
  });
  await campaign.save();

  return {
    campaign: campaign.name,
    recipient: {
      name: recipient.name || recipient.phone,
      phone: recipient.phone,
      event: recipient.event || '',
      date: recipient.date || '',
      qrDataFields,
      ...recipient._doc,
    },
  };
};

// ─── Get scan history ───────────────────────────────────────────────
const getScanHistory = async (campaignId, filters = {}) => {
  const { search, page = 1, limit = 20 } = filters;
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  let history = campaign.scanHistory || [];

  if (search) {
    const s = search.toLowerCase();
    history = history.filter(h =>
      (h.name && h.name.toLowerCase().includes(s)) ||
      (h.phone && h.phone.toLowerCase().includes(s))
    );
  }

  history = history.sort((a, b) => b.timestamp - a.timestamp);
  const total = history.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  const data = history.slice(start, end);

  return {
    history: data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};

// ─── Exports ─────────────────────────────────────────────────────────
module.exports = {
  createCampaign,
  launchCampaign,
  getCampaignHistory,
  retryFailedRecipients,
  deleteCampaign,
  getCampaignById,
  checkInRecipient,
  getScanHistory,
  uploadHeaderImage,
  updateCampaignHeaderImage,
};