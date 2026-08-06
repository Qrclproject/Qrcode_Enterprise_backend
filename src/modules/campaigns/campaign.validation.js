const { z } = require('zod');

// ─── Recipient schema ──────────────────────────────────────────────────
const recipientSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  name: z.string().optional(),
  event: z.string().optional(),
  date: z.string().optional(),
  qrUrl: z.string().optional(),
});

// ─── Create campaign schema ──────────────────────────────────────────
const createCampaignSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    templateId: z.string().optional(),
    templateKey: z.string().optional(),
    recipients: z.array(recipientSchema).optional(),
    batchSize: z.number().int().min(1).max(500).optional(),
    waitValue: z.number().int().min(1).max(999).optional(),
    waitUnit: z.enum(['seconds', 'minutes', 'hours', 'days']).optional(),
    scheduleTime: z.string().datetime({ offset: true }).optional(),
    activeVariants: z.array(z.number().int()).optional(),
    variants: z.array(z.string()).optional(),
    // Dynamic mapping – can contain 'phone', 'qr', and any placeholder keys (1,2,3,...)
    mapping: z.object({
      phone: z.string().optional(),
      qr: z.string().optional(),
    }).catchall(z.string()).optional(),
    designId: z.string().optional(),
  }),
});

// ─── Launch campaign schema ──────────────────────────────────────────
const launchCampaignSchema = z.object({
  body: z.object({
    campaignId: z.string().min(1, 'Campaign ID is required'),
  }),
});

// ─── Retry failed recipients schema ──────────────────────────────────
const retryFailedSchema = z.object({
  params: z.object({
    campaignId: z.string().min(1, 'Campaign ID is required'),
  }),
});

// ─── Exports ──────────────────────────────────────────────────────────
module.exports = {
  createCampaignSchema,
  launchCampaignSchema,
  retryFailedSchema,
};