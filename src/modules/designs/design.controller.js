const asyncHandler = require('../../utils/asyncHandler');
const designService = require('./design.service');
const Design = require('./design.model');
const ApiError = require('../../utils/apiError');

const parseJsonField = (value) => {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return undefined; }
  }
  return value;
};

// ─── CREATE ────────────────────────────────────────────────────────
const create = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Image file is required' });
  }

  const { name, qrPosition, qrPadding } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Design name is required' });
  }

  let qrPos;
  try {
    qrPos = typeof qrPosition === 'string' ? JSON.parse(qrPosition) : qrPosition;
    if (
      typeof qrPos.x !== 'number' ||
      typeof qrPos.y !== 'number' ||
      typeof qrPos.width !== 'number' ||
      typeof qrPos.height !== 'number'
    ) {
      throw new Error('Invalid position values');
    }
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Invalid QR position data' });
  }

  let padding = 15;
  if (qrPadding !== undefined) {
    const num = Number(qrPadding);
    if (!isNaN(num) && num >= 0 && num <= 50) {
      padding = num;
    } else {
      return res.status(400).json({ success: false, message: 'qrPadding must be between 0 and 50' });
    }
  }

  const qrConfig = parseJsonField(req.body.qrConfig) || {};
  const textOverlays = parseJsonField(req.body.textOverlays) || [];
  const qrDataFields = parseJsonField(req.body.qrDataFields) || [];

  const design = await designService.createDesign(
    {
      userId: req.user._id,
      name: name.trim(),
      qrPosition: qrPos,
      qrPadding: padding,
      qrConfig,
      textOverlays,
      qrDataFields,
    },
    req.file.buffer
  );

  res.status(201).json({ success: true, data: design });
});

// ─── GET ALL ──────────────────────────────────────────────────────
const getAll = asyncHandler(async (req, res) => {
  const designs = await designService.getDesignsByUser(req.user._id);
  res.json({ success: true, data: designs });
});

// ─── UPDATE ──────────────────────────────────────────────────────
const updateDesign = asyncHandler(async (req, res) => {
  const { designId } = req.params;
  const { name, qrPosition, qrPadding } = req.body;

  const design = await Design.findOne({ _id: designId, userId: req.user._id });
  if (!design) throw new ApiError(404, 'Design not found');

  if (name !== undefined) design.name = name.trim();
  if (qrPosition) {
    let pos = qrPosition;
    if (typeof pos === 'string') {
      try { pos = JSON.parse(pos); } catch (e) { throw new ApiError(400, 'Invalid QR position format'); }
    }
    if (
      typeof pos.x !== 'number' ||
      typeof pos.y !== 'number' ||
      typeof pos.width !== 'number' ||
      typeof pos.height !== 'number'
    ) {
      throw new ApiError(400, 'Invalid QR position values');
    }
    design.qrPosition = pos;
  }
  if (qrPadding !== undefined) {
    const num = Number(qrPadding);
    if (isNaN(num) || num < 0 || num > 50) {
      throw new ApiError(400, 'qrPadding must be between 0 and 50');
    }
    design.qrPadding = num;
  }

  if (req.body.qrConfig !== undefined) {
    const config = parseJsonField(req.body.qrConfig);
    if (config) design.qrConfig = config;
  }
  if (req.body.textOverlays !== undefined) {
    const overlays = parseJsonField(req.body.textOverlays);
    if (overlays) design.textOverlays = overlays;
  }
  if (req.body.qrDataFields !== undefined) {
    const fields = parseJsonField(req.body.qrDataFields);
    if (fields) design.qrDataFields = fields;
  }

  await design.save();
  res.json({ success: true, data: design });
});

// ─── DELETE ──────────────────────────────────────────────────────
const deleteDesign = asyncHandler(async (req, res) => {
  const { designId } = req.params;
  const design = await Design.findOneAndDelete({ _id: designId, userId: req.user._id });
  if (!design) throw new ApiError(404, 'Design not found');
  res.json({ success: true, message: 'Design deleted' });
});

module.exports = { create, getAll, updateDesign, deleteDesign };