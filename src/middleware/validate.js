const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    if (error.errors) {
      const messages = error.errors.map((e) => e.message).join(', ');
      return res.status(400).json({
        success: false,
        message: messages,
      });
    }
    next(error);
  }
};

module.exports = validate;