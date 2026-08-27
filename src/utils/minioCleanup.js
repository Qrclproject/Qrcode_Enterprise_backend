const minioService = require('../services/minio.service');

/**
 * Delete multiple objects from MinIO.
 * @param {string[]} objectNames - Array of object keys (without bucket prefix)
 * @returns {Promise<object>}
 */
const deleteResources = async (objectNames) => {
  if (!Array.isArray(objectNames) || objectNames.length === 0) {
    return { deleted: 0, total: 0 };
  }

  let deleted = 0;
  for (const name of objectNames) {
    try {
      await minioService.deleteObject(name);
      deleted += 1;
    } catch (err) {
      console.error(`Failed to delete ${name}:`, err.message);
    }
  }
  return { deleted, total: objectNames.length };
};

module.exports = { deleteResources };