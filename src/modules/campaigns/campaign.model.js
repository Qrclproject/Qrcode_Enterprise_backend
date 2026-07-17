const mongoose = require('mongoose');

const recipientSchema = new mongoose.Schema({
  phone: String,
  name: String,
  event: String,
  date: String,
  qrUrl: String,
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending',
  },
  failureReason: String,
});

const campaignSchema = new mongoose.Schema(
  {
    name: String,
    templateId: String,
    templateName: String,
    templateKey: String,
    recipients: [recipientSchema],
    batchSize: { type: Number, default: 10 },
    waitValue: { type: Number, default: 5 },
    waitUnit: {
      type: String,
      enum: ['seconds', 'minutes', 'hours', 'days'],
      default: 'minutes',
    },
    scheduleTime: Date,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'completed', 'failed'],
      default: 'draft',
    },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    activeVariants: [Number],
    variants: [String],
    mapping: {
      phone: String,
      name: String,
      event: String,
      qr: String,
      date: String,
    },
    qrGenerationStatus: {
      total: Number,
      completed: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Campaign', campaignSchema);