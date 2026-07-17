const cloudinary = require('cloudinary').v2;
const config = require('../config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

/**
 * Delete multiple images from Cloudinary
 * @param {string[]} publicIds – array of public IDs (without extension)
 * @returns {Promise<object>} – Cloudinary response
 */
const deleteResources = (publicIds) => {
  return new Promise((resolve, reject) => {
    cloudinary.api.delete_resources(publicIds, { resource_type: 'image' }, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
  });
};

module.exports = { deleteResources };