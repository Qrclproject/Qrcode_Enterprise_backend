const QRCode = require('qrcode');
const cloudinary = require('cloudinary').v2;
const config = require('../../config');
const { overlayQROntoDesign } = require('./overlay.service');
const { encrypt } = require('../../utils/encryption');

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

const generateRecipientQR = async (recipient, campaignId, design = null) => {
  try {
    console.log(`🔄 Generating QR for recipient ${recipient._id} (${recipient.phone})`);
    
    const rawData = `${campaignId}_${recipient.phone}_${Date.now()}`;
    const encryptedData = encrypt(rawData);
    const qrBuffer = await generateQRBuffer(encryptedData);

    let finalBuffer = qrBuffer;
    if (design) {
      const paddingFraction = design.qrPadding != null ? design.qrPadding / 100 : 0.15;
      console.log(`   Using design: ${design.name}, padding: ${paddingFraction}`);
      finalBuffer = await overlayQROntoDesign(
        design.imageUrl,
        design.qrPosition,
        qrBuffer,
        paddingFraction
      );
    }

    const publicId = `campaign_${campaignId}/recipient_${recipient._id}`;
    const url = await uploadToCloudinary(finalBuffer, publicId);
    console.log(`✅ QR generated for ${recipient.phone}: ${url}`);
    return url;
  } catch (err) {
    console.error(`❌ QR generation failed for ${recipient.phone}:`, err.message);
    throw err; // rethrow so caller can handle
  }
};

module.exports = { generateRecipientQR };