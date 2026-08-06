const mongoose = require('mongoose');

const scanHistorySchema = new mongoose.Schema({
  phone: String,
  name: String,
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['success', 'failed'] },
  message: String, // error message if failed
  scannedBy: { type: String, default: 'system' }, // future: user ID
});

const recipientSchema = new mongoose.Schema(
  {
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
    checkedIn: { type: Boolean, default: false },
    checkedInAt: { type: Date },
  },
  { strict: false }
);

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
    mapping: { type: Object, default: {} },
    designId: { type: mongoose.Schema.Types.ObjectId, ref: 'Design' },
    qrGenerationStatus: {
      total: Number,
      completed: { type: Number, default: 0 },
      status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
      },
    },
    scanHistory: [scanHistorySchema], // 👈 new
  },
  { timestamps: true }
);

module.exports = mongoose.model('Campaign', campaignSchema);