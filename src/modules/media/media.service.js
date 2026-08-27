// src/modules/media/media.service.js

const ApiError = require('../../utils/apiError');
const minioService = require('../../services/minio.service');  // new import

// Prefixes (folders) to list – adjust as needed
const PREFIXES = ['event_qrcodes', 'campaign_headers'];

/**
 * List all images in the configured prefixes.
 * @returns {Promise<Array>} - Array of image metadata
 */
const listImages = async () => {
  const allResources = [];

  for (const prefix of PREFIXES) {
    try {
      const objects = await minioService.listObjects(prefix);
      allResources.push(
        ...objects.map(obj => ({
          public_id: obj.name,               // MinIO object key
          url: `${minioService.config.publicBaseUrl}/${obj.name}`,
          folder: prefix,
          created_at: obj.lastModified,
        }))
      );
    } catch (err) {
      console.error(`Failed to list prefix ${prefix}:`, err.message);
    }
  }

  return allResources;
};

/**
 * Delete multiple objects by their keys.
 * @param {string[]} publicIds - Array of object keys
 * @returns {Promise<object>}
 */
const deleteImages = async (publicIds) => {
  if (!Array.isArray(publicIds) || publicIds.length === 0) {
    throw new ApiError(400, 'No image IDs provided');
  }

  for (const objectName of publicIds) {
    try {
      await minioService.deleteObject(objectName);
    } catch (err) {
      console.error(`Failed to delete ${objectName}:`, err.message);
      throw new ApiError(500, `Failed to delete some images: ${err.message}`);
    }
  }

  return { deleted: publicIds.length };
};

module.exports = { listImages, deleteImages };