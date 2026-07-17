const cron = require('node-cron');
const Campaign = require('../modules/campaigns/campaign.model');
const campaignService = require('../modules/campaigns/campaign.service');
const logger = require('./logger');

const initScheduler = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const campaigns = await Campaign.find({
        status: 'scheduled',
        scheduleTime: { $lte: now },
      });

      for (const campaign of campaigns) {
        logger.info(`Starting scheduled campaign: ${campaign._id}`);
        campaignService.launchCampaign(campaign._id).catch((err) =>
          logger.error(`Failed to launch scheduled campaign ${campaign._id}: ${err.message}`)
        );
      }
    } catch (err) {
      logger.error(`Scheduler error: ${err.message}`);
    }
  });

  logger.info('Scheduler initialized – checking for scheduled campaigns every minute');
};

module.exports = { initScheduler };