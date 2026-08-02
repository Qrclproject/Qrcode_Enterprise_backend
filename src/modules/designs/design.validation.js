const { z } = require('zod');

// For create, we only validate name – qrPosition and padding are handled manually in controller
const createDesignSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
  }),
});

// For update, accept string or object for qrPosition, and string or number for qrPadding
const updateDesignSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    qrPosition: z.union([
      z.object({
        x: z.number().int().min(0),
        y: z.number().int().min(0),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
      z.string(),
    ]).optional(),
    qrPadding: z.union([z.number().min(0).max(50), z.string().transform(Number)]).optional(),
  }),
});

module.exports = { createDesignSchema, updateDesignSchema };