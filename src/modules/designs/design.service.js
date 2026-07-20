const Design = require('./design.model');
const cloudinary = require('cloudinary').v2;
const config = require('../../config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

/**
 * Upload a buffer to Cloudinary and return the secure URL.
 */
const uploadTemplateImage = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'design_templates',
        resource_type: 'image',
        format: 'png',
      },
      (error, result) => (error ? reject(error) : resolve(result.secure_url))
    );
    stream.end(buffer);
  });
};

/**
 * Create a new design (template image + QR position).
 * @param {Object} data – { userId, name, qrPosition }
 * @param {Buffer} fileBuffer – image file buffer
 */
const createDesign = async (data, fileBuffer) => {
  // 1. Upload the client's template image to Cloudinary
  const imageUrl = await uploadTemplateImage(fileBuffer);

  // 2. Save the design record
  const design = await Design.create({
    userId: data.userId,
    name: data.name,
    imageUrl,
    qrPosition: data.qrPosition,
  });

  return design;
};

/**
 * Get all designs for a user.
 */
const getDesignsByUser = (userId) => {
  return Design.find({ userId }).sort({ createdAt: -1 });
};

module.exports = { createDesign, getDesignsByUser };