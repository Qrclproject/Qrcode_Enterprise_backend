const Campaign = require('../campaigns/campaign.model');

const getDashboardStats = async () => {
  const totalCampaigns = await Campaign.countDocuments();
  const delivered = await Campaign.countDocuments({ status: 'delivered' });
  const scheduled = await Campaign.countDocuments({ status: 'scheduled' });
  const failed = await Campaign.countDocuments({ status: 'failed' });

  // Aggregation for total messages sent, delivered, failed across all campaigns
  const pipeline = [
    { $unwind: '$recipients' },
    {
      $group: {
        _id: null,
        totalSent: { $sum: 1 },
        totalDelivered: { $sum: { $cond: [{ $eq: ['$recipients.status', 'sent'] }, 1, 0] } },
        totalFailed: { $sum: { $cond: [{ $eq: ['$recipients.status', 'failed'] }, 1, 0] } },
      },
    },
  ];
  const aggregate = await Campaign.aggregate(pipeline);
  const stats = aggregate[0] || { totalSent: 0, totalDelivered: 0, totalFailed: 0 };

  // Average send time (mock for now – could calculate from createdAt / updatedAt)
  const avgSendTime = 1.2; // placeholder

  return {
    totalCampaigns,
    delivered,
    scheduled,
    failed,
    totalSent: stats.totalSent,
    totalDelivered: stats.totalDelivered,
    totalFailed: stats.totalFailed,
    avgSendTime,
  };
};

const getMessagesOverTime = async (days = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const pipeline = [
    { $match: { createdAt: { $gte: startDate } } },
    { $unwind: '$recipients' },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];
  return Campaign.aggregate(pipeline);
};

const getTemplateUsage = async () => {
  const pipeline = [
    { $group: { _id: '$templateKey', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ];
  return Campaign.aggregate(pipeline);
};

module.exports = { getDashboardStats, getMessagesOverTime, getTemplateUsage };