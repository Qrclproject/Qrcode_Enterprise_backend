const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  label: String,
  body: String,
  active: { type: Boolean, default: true },
});

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    whatsappTemplateName: {
      type: String,
      required: true,
      trim: true,
    },
    quickReplies: {
  type: [String],
  default: [],
},
    category: {
      type: String,
      enum: ['delivery', 'reminder', 'thanks', 'custom', 'marketing'],
      default: 'delivery',
    },
    showQR: { type: Boolean, default: true },
    usageCount: { type: Number, default: 0 },
    variants: [variantSchema],
    // ─── CTA Button ──────────────────────────────────────────
    buttonType: {
      type: String,
      enum: ['none', 'phone_number', 'url'],
      default: 'none',
    },
    buttonText: { type: String, default: '' },
    buttonValue: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Template', templateSchema);