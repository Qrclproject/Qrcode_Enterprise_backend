const { z } = require('zod');

const validate = (schema) => (req, res, next) => {
  try {
    // If schema expects a body, parse only req.body
    // If schema expects full request (like with query/params), parse req
    // We'll check if schema has a 'body' key in its shape
    if (schema.shape && schema.shape.body) {
      // Schema expects { body: ... } – parse req.body
      schema.parse({ body: req.body });
    } else {
      // Schema expects full request object
      schema.parse(req);
    }
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.errors,
      });
    }
    next(error);
  }
};

module.exports = validate;