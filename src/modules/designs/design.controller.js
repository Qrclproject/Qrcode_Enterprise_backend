const asyncHandler = require('../../utils/asyncHandler');
const designService = require('./design.service');

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
    // qrPosition comes as a JSON string from FormData
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

module.exports = { create, getAll };