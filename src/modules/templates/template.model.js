const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  label: String,
  body: String,
  active: { type: Boolean, default: true },
});

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ['delivery', 'reminder', 'thanks', 'custom'],
      default: 'delivery',
    },
    showQR: { type: Boolean, default: true },
    usageCount: { type: Number, default: 0 },
    variants: [variantSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Template', templateSchema);