const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
     status: {
    type: String,
    enum: ['sent', 'failed', 'pending'],
    default: 'sent',
  },
  failureReason: {
  type: String,
  default: '',
},
    phone: {
      type: String,
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ['incoming', 'outgoing'],
      required: true,
    },
    body: {
      type: String,
      default: '',
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    whatsappMessageId: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WhatsAppMessage', messageSchema);