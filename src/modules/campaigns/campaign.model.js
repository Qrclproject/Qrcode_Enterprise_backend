const mongoose = require('mongoose');

// ─── Recipient schema – now flexible to hold any spreadsheet columns ───
const recipientSchema = new mongoose.Schema(
  {
    phone: String,            // required – the recipient's phone number
    name: String,             // legacy field – can be removed, but kept for compatibility
    event: String,            // legacy – kept for backward compatibility
    date: String,             // legacy – kept for backward compatibility
    qrUrl: String,            // generated QR code URL
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    failureReason: String,
    // Any additional columns from the spreadsheet will be stored here
    // because we set strict: false below
  },
  { strict: false } // 🔑 Allow any extra fields (time, venue, dressCode, etc.)
);

// ─── Campaign schema ──────────────────────────────────────────────────
const campaignSchema = new mongoose.Schema(
  {
    name: String,
    templateId: String,        // reference to the Template _id
    templateName: String,      // legacy, can be derived
    templateKey: String,       // legacy fallback
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
    activeVariants: [Number],   // indices of active variants in the template
    variants: [String],         // legacy – kept for reference

    // ✅ Dynamic mapping – can contain:
    //   phone: "Phone Number"
    //   qr: "QR Code Image URL"
    //   "1": "Attendee Name"
    //   "2": "Event Name"
    //   "3": "Date"
    //   "4": "Time"
    //   ... up to any number
    mapping: {
      type: Object,
      default: {},
    },

    designId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Design',
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