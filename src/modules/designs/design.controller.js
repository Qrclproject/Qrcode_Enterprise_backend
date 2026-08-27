const asyncHandler = require('../../utils/asyncHandler');
const designService = require('./design.service');
const ApiError = require('../../utils/apiError');

/**
 * Safely parse a JSON field. If the value is already an object, return it.
 * If it's a string, try to parse it. If undefined/null, return undefined.
 */
const safeJsonParse = (value, fallback = undefined) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'object') return value; // already an object
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      throw new ApiError(400, 'Invalid JSON format in request');
    }
  }
  return fallback;
};

/**
 * Create a new design (with image upload).
 */
const createDesign = asyncHandler(async (req, res) => {
  const { name } = req.body;

  if (!req.file) {
    throw new ApiError(400, 'Design image is required');
  }

  // Upload image to MinIO
  const imageUrl = await designService.uploadDesignImage(req.file.buffer, req.file.originalname);

  // Parse JSON fields safely
  const qrPosition = safeJsonParse(req.body.qrPosition, { x: 50, y: 50, width: 150, height: 150 });
  const qrPadding = req.body.qrPadding !== undefined ? Number(req.body.qrPadding) : 15;
  const qrConfig = safeJsonParse(req.body.qrConfig, undefined);
  const textOverlays = safeJsonParse(req.body.textOverlays, []);
  const qrDataFields = safeJsonParse(req.body.qrDataFields, []);

  const designData = {
    userId: req.user._id,
    name: name || 'Untitled Design',
    imageUrl,
    qrPosition,
    qrPadding,
    qrConfig,
    textOverlays,
    qrDataFields,
  };

  const design = await designService.createDesign(designData);
  res.status(201).json({ success: true, data: design });
});

/**
 * Update an existing design (with optional image replacement).
 */
const updateDesign = asyncHandler(async (req, res) => {
  const { designId } = req.params;
  const updates = {};

  const { name } = req.body;

  if (name) updates.name = name;

  // Safely parse and add optional fields if present
  if (req.body.qrPosition !== undefined) {
    updates.qrPosition = safeJsonParse(req.body.qrPosition);
  }
  if (req.body.qrPadding !== undefined) {
    updates.qrPadding = Number(req.body.qrPadding);
  }
  if (req.body.qrConfig !== undefined) {
    updates.qrConfig = safeJsonParse(req.body.qrConfig);
  }
  if (req.body.textOverlays !== undefined) {
    updates.textOverlays = safeJsonParse(req.body.textOverlays);
  }
  if (req.body.qrDataFields !== undefined) {
    updates.qrDataFields = safeJsonParse(req.body.qrDataFields);
  }

  // If a new image is uploaded, replace the old one
  if (req.file) {
    // Optionally delete old image
    const existingDesign = await designService.getDesignById(designId, req.user._id);
    if (existingDesign.imageUrl) {
      await designService.deleteDesignImage(existingDesign.imageUrl);
    }
    updates.imageUrl = await designService.uploadDesignImage(req.file.buffer, req.file.originalname);
  }

  // Pass userId for ownership check
  const design = await designService.updateDesign(designId, updates, req.user._id);
  res.json({ success: true, data: design });
});

/**
 * Get all designs for the current user.
 */
const getDesigns = asyncHandler(async (req, res) => {
  const designs = await designService.getAllDesigns(req.user._id);
  res.json({ success: true, data: designs });
});

/**
 * Get a single design by ID (ensure ownership).
 */
const getDesign = asyncHandler(async (req, res) => {
  const design = await designService.getDesignById(req.params.designId, req.user._id);
  res.json({ success: true, data: design });
});

/**
 * Delete a design (ensure ownership).
 */
const deleteDesign = asyncHandler(async (req, res) => {
  const result = await designService.deleteDesign(req.params.designId, req.user._id);
  res.json({ success: true, message: 'Design deleted', data: result });
});

module.exports = {
  createDesign,
  updateDesign,
  getDesigns,
  getDesign,
  deleteDesign,
};