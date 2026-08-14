const cloudinary = require('cloudinary').v2;
const config = require('../../config');
const ApiError = require('../../utils/apiError');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

const FOLDERS = ['event_qrcodes', 'campaign_headers'];

// List all images in the specified folders
const listImages = async () => {
  const allResources = [];

  for (const folder of FOLDERS) {
    try {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: folder,
        max_results: 500, // adjust if you have more
      });
      allResources.push(
        ...result.resources.map(r => ({
          public_id: r.public_id,
          url: r.secure_url,
          folder: r.folder,
          created_at: r.created_at,
        }))
      );
    } catch (err) {
      console.error(`Failed to list folder ${folder}:`, err.message);
    }
  }

  return allResources;
};

// Delete multiple images by public IDs
const deleteImages = async (publicIds) => {
  if (!Array.isArray(publicIds) || publicIds.length === 0) {
    throw new ApiError(400, 'No image IDs provided');
  }

  // Cloudinary delete_resources can handle up to 100 IDs per call
  const batchSize = 100;
  const results = [];

  for (let i = 0; i < publicIds.length; i += batchSize) {
    const batch = publicIds.slice(i, i + batchSize);
    try {
      const res = await cloudinary.api.delete_resources(batch, { resource_type: 'image' });
      results.push(res);
    } catch (err) {
      console.error(`Failed to delete batch ${i}:`, err.message);
      throw new ApiError(500, `Failed to delete some images: ${err.message}`);
    }
  }

  return results;
};

module.exports = { listImages, deleteImages };