const asyncHandler = require('../../utils/asyncHandler');
const settingsService = require('./settings.service');

const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings(req.user.userId);
  res.json({ success: true, data: settings });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.user.userId, req.body);
  res.json({ success: true, data: settings });
});

module.exports = { getSettings, updateSettings };