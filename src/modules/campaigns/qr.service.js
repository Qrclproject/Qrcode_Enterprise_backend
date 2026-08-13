const QRCode = require('qrcode');
const cloudinary = require('cloudinary').v2;
const config = require('../../config');
const { overlayDesign } = require('./overlay.service');
const { encrypt } = require('../../utils/encryption');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

const uploadToCloudinary = (buffer, publicId) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'event_qrcodes',
        public_id: publicId,
        resource_type: 'image',
        format: 'png',
        overwrite: true,
      },
      (error, result) => (error ? reject(error) : resolve(result.secure_url))
    );
    stream.end(buffer);
  });

const generateRecipientQR = async (recipient, campaignId, design = null, mapping = {}) => {
  // ─── Build core QR data ──────────────────────────────────────
  let rawData = `${campaignId}_${recipient.phone}_${Date.now()}`;

  // ─── Append custom fields if defined in design ──────────────
  if (design && design.qrDataFields && design.qrDataFields.length > 0) {
    const extraParts = design.qrDataFields.map(field => {
      const columnName = mapping[field]; // field is placeholder like "1"
      return columnName ? (recipient[columnName] || '') : '';
    });
    rawData += '|' + extraParts.join('|');
  }

  const encryptedData = encrypt(rawData);

  // ─── Generate final image ────────────────────────────────────
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

    // ✅ Pass the FULL qrConfig including all shapes and colours
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
  return uploadToCloudinary(finalBuffer, publicId);
};

module.exports = { generateRecipientQR };