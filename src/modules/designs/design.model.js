const mongoose = require('mongoose');

const designSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    imageUrl: { type: String, required: true },
    qrPosition: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
      width: { type: Number, required: true },
      height: { type: Number, required: true },
    },
    qrPadding: { type: Number, default: 15 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Design', designSchema);