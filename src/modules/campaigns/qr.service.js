// src/modules/campaigns/qr.service.js

const QRCode = require('qrcode');
const { overlayDesign } = require('./overlay.service');
const { encrypt } = require('../../utils/encryption');
const minioService = require('../../services/minio.service');  // new import

/**
 * Upload a buffer to MinIO and return its public URL.
 * @param {Buffer} buffer
 * @param {string} publicId - Unique identifier (without extension)
 * @returns {Promise<string>}
 */
const uploadToMinio = async (buffer, publicId) => {
  // Structure: event_qrcodes/campaign_<id>/recipient_<id>.png
  const objectName = `event_qrcodes/${publicId}.png`;
  const url = await minioService.uploadBuffer(objectName, buffer, { 'Content-Type': 'image/png' });
  return url;
};

/**
 * Generate a QR code image for a recipient, optionally overlaying a design.
 * @param {object} recipient
 * @param {string} campaignId
 * @param {object|null} design
 * @param {object} mapping
 * @returns {Promise<string>} - Public URL of the generated QR code
 */
const generateRecipientQR = async (recipient, campaignId, design = null, mapping = {}) => {
  // Build core QR data
  let rawData = `${campaignId}_${recipient.phone}_${Date.now()}`;

  // Append custom fields if defined in design
  if (design && design.qrDataFields && design.qrDataFields.length > 0) {
    const extraParts = design.qrDataFields.map(field => {
      const columnName = mapping[field];
      return columnName ? (recipient[columnName] || '') : '';
    });
    rawData += '|' + extraParts.join('|');
  }

  const encryptedData = encrypt(rawData);

  // Generate final image
  let finalBuffer;
  if (design) {
    // Build text overlays with recipient data
    const textOverlays = (design.textOverlays || []).map(overlay => {
      const placeholder = overlay.placeholder || '';
      let text = '';
      const columnName = mapping[placeholder] || mapping[String(placeholder)];
      if (columnName && recipient[columnName] !== undefined) {
        text = recipient[columnName] || '';
      } else {
        text = `{{${placeholder}}}`;
      }
      return {
        text,
        position: overlay.position,
        style: overlay.style || {},
      };
    });

    // Pass the full qrConfig including all shapes and colours
    const qrConfig = {
      lightColor: design.qrConfig?.lightColor || '#ffffff',
      finderOuterColor: design.qrConfig?.finderOuterColor || '#000000',
      finderOuterShape: design.qrConfig?.finderOuterShape || 'square',
      finderInnerColor: design.qrConfig?.finderInnerColor || '#000000',
      finderInnerShape: design.qrConfig?.finderInnerShape || 'square',
      dataColor: design.qrConfig?.dataColor || '#000000',
      dataShape: design.qrConfig?.dataShape || 'square',
    };

    const paddingFraction = design.qrPadding != null ? design.qrPadding / 100 : 0.15;

    finalBuffer = await overlayDesign({
      templateUrl: design.imageUrl,
      qrPosition: design.qrPosition,
      qrData: encryptedData,
      qrConfig,
      textOverlays,
      padding: paddingFraction,
    });
  } else {
    // Fallback: plain QR without design
    const qrBuffer = await QRCode.toBuffer(encryptedData, { width: 500, margin: 2 });
    finalBuffer = qrBuffer;
  }

  const publicId = `campaign_${campaignId}/recipient_${recipient._id}`;
  return uploadToMinio(finalBuffer, publicId);
};

module.exports = { generateRecipientQR };