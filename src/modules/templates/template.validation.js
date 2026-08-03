const { z } = require('zod');

const variantSchema = z.object({
  label: z.string().optional(),
  body: z.string().min(1, 'Variant body is required'),
  active: z.boolean().optional(),
});

const createTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Template name is required'),
    whatsappTemplateName: z.string().min(1, 'WhatsApp template name is required'),
    category: z.enum(['delivery', 'reminder', 'thanks', 'custom', 'marketing']).optional(),
    showQR: z.boolean().optional(),
    variants: z.array(variantSchema).min(1, 'At least one variant is required'),
    // ─── CTA fields ──────────────────────────────────────────
    buttonType: z.enum(['none', 'phone_number', 'url']).optional(),
    buttonText: z.string().optional(),
    buttonValue: z.string().optional(),
  }),
});

const updateTemplateSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    whatsappTemplateName: z.string().optional(),
    category: z.enum(['delivery', 'reminder', 'thanks', 'custom', 'marketing']).optional(),
    showQR: z.boolean().optional(),
    variants: z.array(variantSchema).optional(),
    buttonType: z.enum(['none', 'phone_number', 'url']).optional(),
    buttonText: z.string().optional(),
    buttonValue: z.string().optional(),
  }),
});

module.exports = { createTemplateSchema, updateTemplateSchema };