const Campaign = require('./campaign.model');
const Template = require('../templates/template.model');
const Design = require('../designs/design.model');
const qrService = require('./qr.service');
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

const normalizePhone = (phone) => {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '234' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
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
// (Remains the same – uses load-save but less concurrent; could be refactored later)
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
// (Could also be improved with atomic updates, but kept simple)
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
// (Uses atomic delete, fine)
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

// ─── Check‑in recipient (FULLY ATOMIC) ─────────────────────────────
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

  // Fetch campaign for design/mapping (read‑only)
  const campaign = await Campaign.findById(campaignId).populate('designId');
  if (!campaign) {
    throw new ApiError(404, 'Event not found');
  }

  // Check if recipient exists and is not already checked in
  const recipient = campaign.recipients.find(r => r.phone === phone);
  if (!recipient) {
    // Do NOT attempt to save a failure log here – just throw
    throw new ApiError(404, 'Recipient not found for this event');
  }
  if (recipient.checkedIn) {
    throw new ApiError(400, 'This QR code has already been used for check‑in');
  }

  // Build extra QR data fields (read‑only)
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

  // Atomic update: find the campaign with the specific recipient not yet checked in
  const updatedCampaign = await Campaign.findOneAndUpdate(
    {
      _id: campaignId,
      'recipients.phone': phone,
      'recipients.checkedIn': false,
    },
    {
      $set: {
        'recipients.$.checkedIn': true,
        'recipients.$.checkedInAt': new Date(),
      },
      $push: {
        scanHistory: {
          phone: recipient.phone,
          name: recipient.name || recipient.phone,
          status: 'success',
          message: 'Checked in successfully',
          qrDataFields,
        },
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!updatedCampaign) {
    // Could be that the recipient was already checked in (race) or not found
    throw new ApiError(400, 'Recipient not found or already checked in');
  }

  const updatedRecipient = updatedCampaign.recipients.find(r => r.phone === phone);
  return {
    campaign: updatedCampaign.name,
    recipient: {
      name: updatedRecipient.name || updatedRecipient.phone,
      phone: updatedRecipient.phone,
      event: updatedRecipient.event || '',
      date: updatedRecipient.date || '',
      qrDataFields,
      ...updatedRecipient._doc,
    },
  };
};

// ─── Reset check‑in status for a recipient (ATOMIC) ──────────────
const resetRecipientCheckIn = async (campaignId, recipientIdentifier) => {
  // First, find the recipient to know its id and phone
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  let recipient = campaign.recipients.id(recipientIdentifier);
  if (!recipient) {
    recipient = campaign.recipients.find(r => r.phone === recipientIdentifier);
  }
  if (!recipient) {
    throw new ApiError(404, 'Recipient not found');
  }
  if (!recipient.checkedIn) {
    throw new ApiError(400, 'Recipient is not checked in');
  }

  // Perform atomic update
  const updatedCampaign = await Campaign.findOneAndUpdate(
    {
      _id: campaignId,
      'recipients._id': recipient._id,
      'recipients.checkedIn': true, // ensure we only reset if currently checked in
    },
    {
      $set: {
        'recipients.$.checkedIn': false,
        'recipients.$.checkedInAt': null,
      },
      $push: {
        scanHistory: {
          phone: recipient.phone,
          name: recipient.name || recipient.phone,
          status: 'success',
          message: 'Check‑in reset by admin/staff',
          timestamp: new Date(),
        },
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!updatedCampaign) {
    throw new ApiError(400, 'Recipient not found or not currently checked in');
  }

  const updatedRecipient = updatedCampaign.recipients.id(recipient._id);
  return {
    campaign: updatedCampaign.name,
    recipient: {
      phone: updatedRecipient.phone,
      name: updatedRecipient.name || updatedRecipient.phone,
      checkedIn: updatedRecipient.checkedIn,
    },
  };
};

// ─── Get scan history ───────────────────────────────────────────────
// (Read‑only, no concurrency issues)
const getScanHistory = async (campaignId, filters = {}) => {
  const { search, page = 1, limit = 20 } = filters;
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  let history = campaign.scanHistory || [];

  if (search) {
    const s = search.toLowerCase();
    history = history.filter(h => {
      if ((h.name && h.name.toLowerCase().includes(s)) || (h.phone && h.phone.toLowerCase().includes(s))) {
        return true;
      }
      if (h.qrDataFields && h.qrDataFields.length > 0) {
        return h.qrDataFields.some(field =>
          (field.label && field.label.toLowerCase().includes(s)) ||
          (field.value && String(field.value).toLowerCase().includes(s))
        );
      }
      return false;
    });
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

// ─── Send a manual message to a specific phone number ───────────
// (Uses load-save but infrequent, kept as-is)
const sendManualMessage = async (campaignId, phone, customVariables = {}) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  const template = await Template.findById(campaign.templateId);
  if (!template) throw new ApiError(404, 'Template not found');
  const templateName = template.whatsappTemplateName || 'event_qr_delivery';

  const activeIndices = campaign.activeVariants || [0];
  const variantIndex = activeIndices[0];
  const variant = template.variants[variantIndex];
  if (!variant) throw new ApiError(400, 'No active variant found');

  const placeholders = extractPlaceholders(variant.body);

  const recipientData = { ...customVariables };
  const existingRecipient = campaign.recipients.find(r => r.phone === phone);
  if (existingRecipient) {
    Object.assign(recipientData, existingRecipient.toObject());
  }

  const bodyParams = buildBodyParameters(recipientData, placeholders, campaign.mapping);

  const components = [];

  if (campaign.includeHeaderImage && template.showQR !== false) {
    if (campaign.headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: campaign.headerImageUrl } }],
      });
    } else if (existingRecipient?.qrUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: existingRecipient.qrUrl } }],
      });
    }
  }

  components.push({
    type: 'body',
    parameters: bodyParams,
  });

  await sendTemplateMessage(phone, templateName, components, campaign.userId);

  return { success: true, phone, templateName };
};



// ─── Add recipients to existing campaign (ATOMIC) ──────────────────
const addRecipientsToCampaign = async (campaignId, newRecipients, { generateQr = false, sendNow = false } = {}) => {
  // Normalize phone numbers
  const normalizedRecipients = newRecipients.map(r => ({
    ...r,
    phone: normalizePhone(r.phone || ''),
    status: 'pending',
    checkedIn: false,
    checkedInAt: null,
  }));

  // Atomic push of new recipients
  const updatedCampaign = await Campaign.findOneAndUpdate(
    { _id: campaignId },
    {
      $push: {
        recipients: { $each: normalizedRecipients },
      },
      $set: {
        addRecipientsStatus: {
          total: normalizedRecipients.length,
          completed: 0,
          status: 'processing',
          phase: generateQr ? 'qr' : (sendNow ? 'sending' : 'none'),
        },
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!updatedCampaign) throw new ApiError(404, 'Campaign not found');

  // Get IDs of newly added recipients (the last N items)
  const added = updatedCampaign.recipients.slice(-normalizedRecipients.length);
  const recipientIds = added.map(r => r._id);

  // Start background processing (do not await)
const processNewRecipients = async (campaignId, recipientIds, { generateQr, sendNow }) => {
  // Phase 1: QR generation (if requested)
  if (generateQr) {
    // Update status atomically
    await Campaign.findOneAndUpdate(
      { _id: campaignId },
      {
        $set: {
          'addRecipientsStatus.phase': 'qr',
          'addRecipientsStatus.total': recipientIds.length,
          'addRecipientsStatus.completed': 0,
          'addRecipientsStatus.status': 'processing',
        },
      }
    );

    // Fetch campaign to get designId and mapping (read‑only)
    const campaign = await Campaign.findById(campaignId).select('designId mapping');
    const design = campaign.designId ? await Design.findById(campaign.designId) : null;
    const mapping = campaign.mapping || {};

    for (const id of recipientIds) {
      // Fetch the recipient separately to get its data for QR generation
      const recipientDoc = await Campaign.findOne(
        { _id: campaignId, 'recipients._id': id },
        { 'recipients.$': 1 }
      );
      if (!recipientDoc || !recipientDoc.recipients || recipientDoc.recipients.length === 0) continue;
      const recipient = recipientDoc.recipients[0];

      try {
        const qrUrl = await qrService.generateRecipientQR(recipient, campaignId, design, mapping);
        // Atomically update the recipient's qrUrl
        await Campaign.findOneAndUpdate(
          { _id: campaignId, 'recipients._id': id },
          { $set: { 'recipients.$.qrUrl': qrUrl } }
        );
      } catch (err) {
        console.error(`QR generation failed for ${recipient.phone}:`, err.message);
      }
      // Increment completed count atomically
      await Campaign.findOneAndUpdate(
        { _id: campaignId },
        { $inc: { 'addRecipientsStatus.completed': 1 } }
      );
    }
  }

  // Phase 2: Sending (if requested) – unchanged
  if (sendNow) {
    await Campaign.findOneAndUpdate(
      { _id: campaignId },
      {
        $set: {
          'addRecipientsStatus.phase': 'sending',
          'addRecipientsStatus.total': recipientIds.length,
          'addRecipientsStatus.completed': 0,
          'addRecipientsStatus.status': 'processing',
        },
      }
    );
    await sendCampaignToRecipients(campaignId, recipientIds);
  }

  // Final status – atomic
  await Campaign.findOneAndUpdate(
    { _id: campaignId },
    {
      $set: {
        'addRecipientsStatus.status': 'completed',
        'addRecipientsStatus.phase': 'none',
      },
    }
  );
};
  return updatedCampaign;
};

// ─── Send template messages to specific recipients ────────────────
// (Could be optimized, but kept as-is; note that it uses load-save)
const sendCampaignToRecipients = async (campaignId, recipientIds) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  const template = await Template.findById(campaign.templateId);
  if (!template) throw new ApiError(404, 'Template not found');

  const activeIndices = campaign.activeVariants || [0];

  for (const id of recipientIds) {
    const recipient = campaign.recipients.id(id);
    if (!recipient) continue;

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

      await sendTemplateMessage(recipient.phone, template.whatsappTemplateName || 'event_qr_delivery', components, campaign.userId);

      recipient.status = 'sent';
      campaign.delivered += 1;
    } catch (err) {
      recipient.status = 'failed';
      recipient.failureReason = err.message || 'Unknown error';
      campaign.failed += 1;
    }
  }

  campaign.status = 'completed';
  await campaign.save();
  return campaign;
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
  resetRecipientCheckIn,
  sendManualMessage,
  addRecipientsToCampaign,
  sendCampaignToRecipients,
};
