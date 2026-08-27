// src/modules/designs/design.service.js

const Design = require('./design.model');
const ApiError = require('../../utils/apiError');
const minioService = require('../../services/minio.service');

/**
 * Upload a design image buffer to MinIO.
 * @param {Buffer} buffer
 * @param {string} originalName
 * @returns {Promise<string>} - Public URL
 */
const uploadDesignImage = async (buffer, originalName) => {
  const timestamp = Date.now();
  const safeName = originalName.replace(/[^a-zA-Z0-9.]/g, '_');
  const objectName = `design_images/${timestamp}_${safeName}`;

  const ext = originalName.split('.').pop().toLowerCase();
  const contentTypeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  const url = await minioService.uploadBuffer(objectName, buffer, { 'Content-Type': contentType });
  return url;
};

/**
 * Delete a design image from MinIO by its object key.
 * @param {string} imageUrl - Full public URL of the image
 */
const deleteDesignImage = async (imageUrl) => {
  if (!imageUrl || !imageUrl.includes(minioService.config.publicBaseUrl)) return;

  const url = new URL(imageUrl);
  let objectName = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  if (objectName.startsWith(minioService.config.bucket + '/')) {
    objectName = objectName.substring(minioService.config.bucket.length + 1);
  }
  await minioService.deleteObject(objectName);
};

/**
 * Create a new design.
 * @param {object} data - Design data, must include userId.
 * @returns {Promise<object>}
 */
const createDesign = async (data) => {
  if (!data.userId) {
    throw new ApiError(400, 'userId is required');
  }
  const design = await Design.create(data);
  return design;
};

/**
 * Update an existing design (ensure ownership).
 * @param {string} designId
 * @param {object} updates
 * @param {string} userId
 * @returns {Promise<object>}
 */
const updateDesign = async (designId, updates, userId) => {
  const design = await Design.findOneAndUpdate(
    { _id: designId, userId },
    updates,
    { new: true, runValidators: true }
  );
  if (!design) throw new ApiError(404, 'Design not found or you do not have permission');
  return design;
};

/**
 * Get all designs for a user.
 * @param {string} userId
 * @returns {Promise<Array>}
 */
const getAllDesigns = async (userId) => {
  return Design.find({ userId }).sort({ createdAt: -1 });
};

/**
 * Get a single design by ID (ensure ownership).
 * @param {string} designId
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getDesignById = async (designId, userId) => {
  const design = await Design.findOne({ _id: designId, userId });
  if (!design) throw new ApiError(404, 'Design not found');
  return design;
};

/**
 * Delete a design and its associated image from MinIO.
 * @param {string} designId
 * @param {string} userId
 * @returns {Promise<object>}
 */
const deleteDesign = async (designId, userId) => {
  const design = await Design.findOne({ _id: designId, userId });
  if (!design) throw new ApiError(404, 'Design not found');

  if (design.imageUrl) {
    await deleteDesignImage(design.imageUrl);
  }

  await Design.findByIdAndDelete(designId);
  return { deleted: true };
};

module.exports = {
  uploadDesignImage,
  deleteDesignImage,
  createDesign,
  updateDesign,
  getAllDesigns,
  getDesignById,
  deleteDesign,
};