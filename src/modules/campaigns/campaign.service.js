// src/modules/campaigns/campaign.service.js

const Campaign = require('./campaign.model');
const Template = require('../templates/template.model');
const Design = require('../designs/design.model');
const qrService = require('./qr.service');
const { sendTemplateMessage } = require('../whatsapp/whatsapp.service');
const ApiError = require('../../utils/apiError');
const mongoose = require('mongoose');
const { decrypt } = require('../../utils/encryption');
const minioService = require('../../services/minio.service');
const { deleteResources } = require('../../utils/minioCleanup');
const WhatsAppMessage = require('./message.model');

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

// Normalize phone: remove non-digits, remove leading '0', ensure country code 234, no '+'
const normalizePhone = (phone) => {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '234' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('234')) {
    cleaned = '234' + cleaned;
  }
  return cleaned;
};

// ─── Helper to add quick reply buttons if template has them ─────
const addQuickReplyButtons = (components, template) => {
  if (template.quickReplies && template.quickReplies.length > 0) {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: 0,
      parameters: template.quickReplies.map((reply) => ({
        type: 'text',
        text: reply,
      })),
    });
  }
};

// ─── Create campaign ─────────────────────────────────────────────────
const createCampaign = async (data) => {
  const campaign = await Campaign.create(data);
  return campaign;
};

// ─── Upload header image to MinIO ─────────────────────────────────
const uploadHeaderImage = async (fileBuffer, originalName) => {
  const timestamp = Date.now();
  const safeName = originalName.replace(/[^a-zA-Z0-9.]/g, '_');
  const objectName = `campaign_headers/${timestamp}_${safeName}`;

  const ext = originalName.split('.').pop().toLowerCase();
  const contentTypeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  const url = await minioService.uploadBuffer(objectName, fileBuffer, { 'Content-Type': contentType });
  return url;
};

// ─── Update campaign header image / includeHeaderImage flag ───
const updateCampaignHeaderImage = async (campaignId, updates) => {
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

  const campaign = await Campaign.findByIdAndUpdate(
    campaignId,
    updateFields,
    { returnDocument: 'after', runValidators: true }
  );
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  return campaign;
};

// ─── Rename a campaign (ensure ownership) ─────────────────────────
const renameCampaign = async (campaignId, newName, userId) => {
  if (!newName || !newName.trim()) {
    throw new ApiError(400, 'Campaign name cannot be empty');
  }
  const campaign = await Campaign.findOneAndUpdate(
    { _id: campaignId, userId },
    { name: newName.trim() },
    { new: true, runValidators: true }
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

      // Add quick reply buttons if template has them
      addQuickReplyButtons(components, template);

      const response = await sendTemplateMessage(recipient.phone, templateName, components, campaign.userId);

      await WhatsAppMessage.create({
        campaignId: campaign._id,
        recipientId: recipient._id,
        phone: recipient.phone,
        direction: 'outgoing',
        body: 'Template message sent',
        whatsappMessageId: response.messages?.[0]?.id,
        timestamp: new Date(),
      });

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

      // Add quick reply buttons
      addQuickReplyButtons(components, template);

      const response = await sendTemplateMessage(recipient.phone, templateName, components, campaign.userId);

      await WhatsAppMessage.create({
        campaignId: campaign._id,
        recipientId: recipient._id,
        phone: recipient.phone,
        direction: 'outgoing',
        body: 'Template message sent',
        whatsappMessageId: response.messages?.[0]?.id,
        timestamp: new Date(),
      });

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

// ─── Delete campaign (uses MinIO) ─────────────────────────────────
const deleteCampaign = async (campaignId) => {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new ApiError(404, 'Campaign not found');

  const objectNames = [];
  for (const recipient of campaign.recipients) {
    if (recipient.qrUrl && recipient.qrUrl.includes(minioService.config.publicBaseUrl)) {
      const url = new URL(recipient.qrUrl);
      const pathname = url.pathname;
      let objectName = pathname.startsWith('/') ? pathname.slice(1) : pathname;
      if (objectName.startsWith(minioService.config.bucket + '/')) {
        objectName = objectName.substring(minioService.config.bucket.length + 1);
      }
      objectNames.push(objectName);
    }
  }

  if (objectNames.length > 0) {
    await deleteResources(objectNames);
  }

  await Campaign.findByIdAndDelete(campaignId);
  return { deleted: true, imagesRemoved: objectNames.length };
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

  const campaign = await Campaign.findById(campaignId).populate('designId');
  if (!campaign) {
    throw new ApiError(404, 'Event not found');
  }

  const recipient = campaign.recipients.find(r => r.phone === phone);
  if (!recipient) {
    throw new ApiError(404, 'Recipient not found for this event');
  }
  if (recipient.checkedIn) {
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

  const updatedCampaign = await Campaign.findOneAndUpdate(
    {
      _id: campaignId,
      'recipients._id': recipient._id,
      'recipients.checkedIn': true,
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

  // Add quick reply buttons
  addQuickReplyButtons(components, template);

  const response = await sendTemplateMessage(phone, templateName, components, campaign.userId);

  if (existingRecipient) {
    await WhatsAppMessage.create({
      campaignId: campaign._id,
      recipientId: existingRecipient._id,
      phone: existingRecipient.phone,
      direction: 'outgoing',
      body: 'Manual template message sent',
      whatsappMessageId: response.messages?.[0]?.id,
      timestamp: new Date(),
    });
  }

  return { success: true, phone, templateName };
};

// ─── Add recipients to existing campaign (ATOMIC) ──────────────────
const addRecipientsToCampaign = async (campaignId, newRecipients, { generateQr = false, sendNow = false } = {}) => {
  const normalizedRecipients = newRecipients.map(r => ({
    ...r,
    phone: normalizePhone(r.phone || ''),
    status: 'pending',
    checkedIn: false,
    checkedInAt: null,
  }));

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

  const added = updatedCampaign.recipients.slice(-normalizedRecipients.length);
  const recipientIds = added.map(r => r._id);

  processNewRecipients(campaignId, recipientIds, { generateQr, sendNow });

  return updatedCampaign;
};

// ─── Background processing of new recipients ──────────────────────
const processNewRecipients = async (campaignId, recipientIds, { generateQr, sendNow }) => {
  if (generateQr) {
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

    const campaign = await Campaign.findById(campaignId).select('designId mapping');
    const design = campaign.designId ? await Design.findById(campaign.designId) : null;
    const mapping = campaign.mapping || {};

    for (const id of recipientIds) {
      const recipientDoc = await Campaign.findOne(
        { _id: campaignId, 'recipients._id': id },
        { 'recipients.$': 1 }
      );
      if (!recipientDoc || !recipientDoc.recipients || recipientDoc.recipients.length === 0) continue;
      const recipient = recipientDoc.recipients[0];

      try {
        const qrUrl = await qrService.generateRecipientQR(recipient, campaignId, design, mapping);
        await Campaign.findOneAndUpdate(
          { _id: campaignId, 'recipients._id': id },
          { $set: { 'recipients.$.qrUrl': qrUrl } }
        );
      } catch (err) {
        console.error(`QR generation failed for ${recipient.phone}:`, err.message);
      }
      await Campaign.findOneAndUpdate(
        { _id: campaignId },
        { $inc: { 'addRecipientsStatus.completed': 1 } }
      );
    }
  }

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

// ─── Delete scan history entry (requires passcode) ────────────────
const deleteScanHistoryEntry = async (campaignId, scanId) => {
  const campaign = await Campaign.findByIdAndUpdate(
    campaignId,
    { $pull: { scanHistory: { _id: scanId } } },
    { new: true }
  );
  if (!campaign) throw new ApiError(404, 'Campaign not found');
  return campaign;
};

// ─── Send template messages to specific recipients ────────────────
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

      // Add quick reply buttons
      addQuickReplyButtons(components, template);

      const response = await sendTemplateMessage(recipient.phone, template.whatsappTemplateName || 'event_qr_delivery', components, campaign.userId);

      await WhatsAppMessage.create({
        campaignId: campaign._id,
        recipientId: recipient._id,
        phone: recipient.phone,
        direction: 'outgoing',
        body: 'Template message sent',
        whatsappMessageId: response.messages?.[0]?.id,
        timestamp: new Date(),
      });

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
  renameCampaign,
  deleteScanHistoryEntry,
};