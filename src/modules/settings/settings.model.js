const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
    apiCredentials: {
      phoneNumberId: String,
      accessToken: String,
      webhookToken: String,
    },
    businessProfile: {
      displayName: String,
      description: String,
      logoUrl: String,
    },
    messageDefaults: {
      language: { type: String, default: 'en' },
      senderName: String,
      autoAttachQr: { type: Boolean, default: true },
      readReceipts: { type: Boolean, default: true },
      deliveryDelay: { type: Number, default: 0 },
      retryAttempts: { type: Number, default: 3 },
    },
    notificationPrefs: {
      campaignCompleted: { type: Boolean, default: true },
      deliveryFailures: { type: Boolean, default: true },
      weeklySummary: { type: Boolean, default: false },
      email: String,
    },
    // ─── Passcode for settings protection ──────────────────────
    passcode: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);