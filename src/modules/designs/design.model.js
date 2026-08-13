const mongoose = require('mongoose');

const textOverlaySchema = new mongoose.Schema({
  placeholder: { type: String, required: true },
  position: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  style: {
    fontSize: { type: Number, default: 16 },
    color: { type: String, default: '#000000' },
    bold: { type: Boolean, default: false },
    italic: { type: Boolean, default: false },
    underline: { type: Boolean, default: false },
    alignment: { type: String, enum: ['left', 'center', 'right', 'justify'], default: 'left' },
    fontFamily: { type: String, default: 'Arial' },
    textTransform: { type: String, enum: ['none', 'uppercase', 'lowercase', 'capitalize'], default: 'none' },
    lineHeight: { type: Number, default: 1.4 },
  },
});

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
    qrConfig: {
      lightColor: { type: String, default: '#ffffff' },
      finderOuterColor: { type: String, default: '#000000' },
      finderOuterShape: { type: String, enum: ['square', 'rounded', 'circle', 'diamond', 'star', 'triangle'], default: 'square' },
      finderInnerColor: { type: String, default: '#000000' },
      finderInnerShape: { type: String, enum: ['square', 'rounded', 'circle', 'diamond', 'star', 'triangle'], default: 'square' },
      dataColor: { type: String, default: '#000000' },
      dataShape: { type: String, enum: ['square', 'rounded', 'circle', 'diamond', 'star', 'triangle'], default: 'square' },
    },
    textOverlays: [textOverlaySchema],
    // ─── NEW: custom fields to include in QR data ───
    qrDataFields: [{ type: String }], // e.g., ["1", "2", "name"]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Design', designSchema);