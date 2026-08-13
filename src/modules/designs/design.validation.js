const { z } = require('zod');

const shapeEnum = z.enum(['square', 'rounded', 'circle', 'diamond', 'star', 'triangle']);

const textStyleSchema = z.object({
  fontSize: z.number().optional(),
  color: z.string().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  alignment: z.enum(['left', 'center', 'right', 'justify']).optional(),
  fontFamily: z.string().optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase', 'capitalize']).optional(),
  lineHeight: z.number().optional(),
}).optional();

const textOverlaySchema = z.object({
  placeholder: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  style: textStyleSchema,
});

const createDesignSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required'),
  }),
});

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
    qrConfig: z.object({
      lightColor: z.string().optional(),
      finderOuterColor: z.string().optional(),
      finderOuterShape: shapeEnum.optional(),
      finderInnerColor: z.string().optional(),
      finderInnerShape: shapeEnum.optional(),
      dataColor: z.string().optional(),
      dataShape: shapeEnum.optional(),
    }).optional(),
    textOverlays: z.union([
      z.array(textOverlaySchema),
      z.string(),
    ]).optional(),
    qrDataFields: z.array(z.string()).optional(),
  }),
});

module.exports = { createDesignSchema, updateDesignSchema };