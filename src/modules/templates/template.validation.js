const { z } = require('zod');

const variantSchema = z.object({
  label: z.string().optional(),
  body: z.string().min(1, 'Variant body is required'),
  active: z.boolean().optional(),
});

const createTemplateSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Template name is required'),
    category: z.enum(['delivery', 'reminder', 'thanks', 'custom']).optional(),
    showQR: z.boolean().optional(),
    variants: z.array(variantSchema).min(1, 'At least one variant is required'),
  }),
});

const updateTemplateSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    category: z.enum(['delivery', 'reminder', 'thanks', 'custom']).optional(),
    showQR: z.boolean().optional(),
    variants: z.array(variantSchema).optional(),
  }),
});

module.exports = { createTemplateSchema, updateTemplateSchema };