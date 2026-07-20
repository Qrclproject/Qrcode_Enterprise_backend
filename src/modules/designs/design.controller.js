const asyncHandler = require('../../utils/asyncHandler');
const designService = require('./design.service');
const Design = require('./design.model');            // ← missing import
const ApiError = require('../../utils/apiError');    // ← missing import

// POST /api/designs
const create = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Image file is required' });
  }

  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Design name is required' });
  }

  let qrPosition;
  try {
    qrPosition = JSON.parse(req.body.qrPosition);
    if (
      typeof qrPosition.x !== 'number' ||
      typeof qrPosition.y !== 'number' ||
      typeof qrPosition.width !== 'number' ||
      typeof qrPosition.height !== 'number'
    ) {
      throw new Error('Invalid position values');
    }
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Invalid QR position data' });
  }

  const design = await designService.createDesign(
    {
      userId: req.user.userId,
      name: name.trim(),
      qrPosition,
    },
    req.file.buffer
  );

  res.status(201).json({ success: true, data: design });
});

// GET /api/designs
const getAll = asyncHandler(async (req, res) => {
  const designs = await designService.getDesignsByUser(req.user.userId);
  res.json({ success: true, data: designs });
});

// PUT /api/designs/:designId
const updateDesign = asyncHandler(async (req, res) => {
  const { designId } = req.params;
  const { name, qrPosition } = req.body;

  const design = await Design.findById(designId);
  if (!design) throw new ApiError(404, 'Design not found');

  if (name) design.name = name;
  if (qrPosition) design.qrPosition = qrPosition;

  await design.save();
  res.json({ success: true, data: design });
});

// DELETE /api/designs/:designId
const deleteDesign = asyncHandler(async (req, res) => {
  const { designId } = req.params;
  const design = await Design.findByIdAndDelete(designId);
  if (!design) throw new ApiError(404, 'Design not found');
  res.json({ success: true, message: 'Design deleted' });
});

module.exports = { create, getAll, updateDesign, deleteDesign };