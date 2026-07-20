const { z } = require('zod');

const createDesignSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
    qrPosition: z.object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  }),
});

module.exports = { createDesignSchema };