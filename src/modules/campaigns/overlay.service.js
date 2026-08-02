const sharp = require('sharp');
const axios = require('axios');

const downloadImage = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  return Buffer.from(response.data);
};

/**
 * Overlay a QR code onto a design image with a white background and padding.
 * @param {string} templateUrl - URL of the design template image.
 * @param {Object} qrPosition - { x, y, width, height } in pixels (natural dimensions).
 * @param {Buffer|string} qrCode - Buffer or URL of the QR code image.
 * @param {number} paddingFraction - Fraction of the target area to use as padding on each side (e.g., 0.15 = 15%).
 *                                  Should be between 0 and 0.5. Default 0.15 (15%) matches the default in the design model.
 * @returns {Promise<Buffer>} - Composite image buffer.
 */
const overlayQROntoDesign = async (templateUrl, qrPosition, qrCode, paddingFraction = 0.15) => {
  // Ensure integers for sharp
  const pos = {
    x: Math.round(qrPosition.x),
    y: Math.round(qrPosition.y),
    width: Math.round(qrPosition.width),
    height: Math.round(qrPosition.height),
  };

  // Download template and QR concurrently
  const [template, qr] = await Promise.all([
    downloadImage(templateUrl).catch((err) => {
      console.error('Failed to download design template:', err.message);
      throw err;
    }),
    typeof qrCode === 'string' ? downloadImage(qrCode) : Promise.resolve(qrCode),
  ]);

  const targetWidth = pos.width;
  const targetHeight = pos.height;

  // ─── 1. Resize QR to fit inside the target area with padding ───
  const innerWidth = Math.round(targetWidth * (1 - paddingFraction * 2));
  const innerHeight = Math.round(targetHeight * (1 - paddingFraction * 2));
  const offsetX = Math.round((targetWidth - innerWidth) / 2);
  const offsetY = Math.round((targetHeight - innerHeight) / 2);

  const qrResized = await sharp(qr)
    .resize(innerWidth, innerHeight, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();

  // ─── 2. Create a white background canvas of the target size ───
  const whiteBg = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  // ─── 3. Composite the resized QR onto the white background ───
  const qrWithBg = await sharp(whiteBg)
    .composite([{ input: qrResized, top: offsetY, left: offsetX }])
    .png()
    .toBuffer();

  // ─── 4. Overlay the QR (with background) onto the template ───
  const composite = await sharp(template)
    .composite([{ input: qrWithBg, top: pos.y, left: pos.x }])
    .png()
    .toBuffer();

  return composite;
};

module.exports = { overlayQROntoDesign };