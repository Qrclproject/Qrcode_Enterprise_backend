const QRCode = require('qrcode');
const cloudinary = require('cloudinary').v2;
const config = require('../../config');
const { overlayQROntoDesign } = require('./overlay.service');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

const generateQRBuffer = (data) =>
  QRCode.toBuffer(data, {
    width: 500,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
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

/**
 * Generate final QR image (plain or overlaid on a design).
 * @param {Object} recipient
 * @param {string} campaignId
 * @param {Object|null} design – { imageUrl, qrPosition, qrPadding } or null
 * @returns {Promise<string>} – Cloudinary URL
 */
const generateRecipientQR = async (recipient, campaignId, design = null) => {
  const data = `${campaignId}_${recipient.phone}_${Date.now()}`;
  const qrBuffer = await generateQRBuffer(data);

  let finalBuffer = qrBuffer;
  if (design) {
    // Convert qrPadding percentage (0-50) to a fraction (0-0.5) for the overlay
    const paddingFraction = design.qrPadding != null ? design.qrPadding / 100 : 0.15;
    finalBuffer = await overlayQROntoDesign(
      design.imageUrl,
      design.qrPosition,
      qrBuffer,
      paddingFraction
    );
  }

  const publicId = `campaign_${campaignId}/recipient_${recipient._id}`;
  return uploadToCloudinary(finalBuffer, publicId);
};

module.exports = { generateRecipientQR };