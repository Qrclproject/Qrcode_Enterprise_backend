const asyncHandler = require('../../utils/asyncHandler');
const analyticsService = require('./analytics.service');

const getDashboard = asyncHandler(async (req, res) => {
  const stats = await analyticsService.getDashboardStats();
  res.json({ success: true, data: stats });
});

const getMessagesOverTime = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const data = await analyticsService.getMessagesOverTime(days);
  res.json({ success: true, data });
});

const getTemplateUsage = asyncHandler(async (req, res) => {
  const data = await analyticsService.getTemplateUsage();
  res.json({ success: true, data });
});

module.exports = { getDashboard, getMessagesOverTime, getTemplateUsage };