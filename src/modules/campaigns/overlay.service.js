const sharp = require('sharp');
const axios = require('axios');

const downloadImage = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,            // 30 seconds
  });
  return Buffer.from(response.data);
};

const overlayQROntoDesign = async (templateUrl, qrPosition, qrCode) => {
  // Ensure integers for sharp
  const pos = {
    x: Math.round(qrPosition.x),
    y: Math.round(qrPosition.y),
    width: Math.round(qrPosition.width),
    height: Math.round(qrPosition.height),
  };

  const [template, qr] = await Promise.all([
    downloadImage(templateUrl).catch((err) => {
      console.error('Failed to download design template:', err.message);
      throw err;   // re‑throw so we skip this recipient
    }),
    typeof qrCode === 'string' ? downloadImage(qrCode) : Promise.resolve(qrCode),
  ]);

  const qrResized = await sharp(qr)
    .resize(pos.width, pos.height)
    .toBuffer();

  const composite = await sharp(template)
    .composite([{ input: qrResized, top: pos.y, left: pos.x }])
    .png()
    .toBuffer();

  return composite;
};

module.exports = { overlayQROntoDesign };