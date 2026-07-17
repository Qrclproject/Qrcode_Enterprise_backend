const { z } = require('zod');

const createCampaignSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    templateId: z.string().optional(),
    templateKey: z.string().optional(),
    recipients: z.array(z.object({
      phone: z.string(),
      name: z.string().optional(),
      event: z.string().optional(),
      date: z.string().optional(),
      qrUrl: z.string().optional(),
    })).optional(),
    batchSize: z.number().int().min(1).optional(),
    waitValue: z.number().int().min(1).optional(),
    waitUnit: z.enum(['seconds', 'minutes', 'hours', 'days']).optional(),
    scheduleTime: z.string().datetime().optional(),
    activeVariants: z.array(z.number()).optional(),
    variants: z.array(z.string()).optional(),
    mapping: z.object({
      phone: z.string().optional(),
      name: z.string().optional(),
      event: z.string().optional(),
      qr: z.string().optional(),
      date: z.string().optional(),
    }).optional(),
  }),
});

const launchCampaignSchema = z.object({
  body: z.object({
    campaignId: z.string().min(1, 'Campaign ID is required'),
  }),
});

const retryFailedSchema = z.object({
  params: z.object({
    campaignId: z.string().min(1, 'Campaign ID is required'),
  }),
});

module.exports = { createCampaignSchema, launchCampaignSchema, retryFailedSchema };