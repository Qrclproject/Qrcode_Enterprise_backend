const Design = require('./design.model');
const cloudinary = require('cloudinary').v2;
const config = require('../../config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

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

const createDesign = async (data, fileBuffer) => {
  const imageUrl = await uploadTemplateImage(fileBuffer);
  const design = await Design.create({
    userId: data.userId,
    name: data.name,
    imageUrl,
    qrPosition: data.qrPosition,
    qrPadding: data.qrPadding !== undefined ? data.qrPadding : 15,
  });
  return design;
};

const getDesignsByUser = (userId) => {
  return Design.find({ userId }).sort({ createdAt: -1 });
};

module.exports = { createDesign, getDesignsByUser };