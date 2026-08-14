const asyncHandler = require('../../utils/asyncHandler');
const mediaService = require('./media.service');
const ApiError = require('../../utils/apiError');

const list = asyncHandler(async (req, res) => {
  const images = await mediaService.listImages();
  res.json({ success: true, data: images });
});

const remove = asyncHandler(async (req, res) => {
  const { publicIds } = req.body;
  if (!Array.isArray(publicIds) || publicIds.length === 0) {
    throw new ApiError(400, 'No image IDs provided');
  }
  const result = await mediaService.deleteImages(publicIds);
  res.json({ success: true, data: result });
});

module.exports = { list, remove };