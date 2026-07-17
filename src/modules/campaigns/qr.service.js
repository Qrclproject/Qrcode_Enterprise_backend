const QRCode = require('qrcode');
const cloudinary = require('cloudinary').v2;
const config = require('../../config');

// Configure Cloudinary once
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

/**
 * Generate QR code buffer from a string
 * @param {string} data – unique identifier for the attendee
 * @returns {Promise<Buffer>}
 */
const generateQRBuffer = (data) => {
  return QRCode.toBuffer(data, {
    width: 500,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  });
};

/**
 * Upload buffer to Cloudinary and get secure URL
 * @param {Buffer} buffer – image buffer
 * @param {string} publicId – unique public ID (e.g., campaignId_recipientId)
 * @returns {Promise<string>} – secure HTTPS URL
 */
const uploadToCloudinary = (buffer, publicId) => {
  return new Promise((resolve, reject) => {
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
};

/**
 * Generate and upload a QR code for a single recipient
 * @param {object} recipient – recipient subdocument (with phone, name, event, etc.)
 * @param {string} campaignId – campaign ID for unique naming
 * @returns {Promise<string>} – permanent QR image URL
 */
const generateRecipientQR = async (recipient, campaignId) => {
  const data = `${campaignId}_${recipient.phone}_${Date.now()}`;
  const buffer = await generateQRBuffer(data);
  const publicId = `campaign_${campaignId}/recipient_${recipient._id}`;
  const url = await uploadToCloudinary(buffer, publicId);
  return url;
};

module.exports = { generateRecipientQR };