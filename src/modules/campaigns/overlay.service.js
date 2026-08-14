const sharp = require('sharp');
const axios = require('axios');
const { renderStyledQR } = require('../../utils/styledQr');

// ─── Download helper ──────────────────────────────────────────────
const downloadImage = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,   // 👈 increased
  });
  return Buffer.from(response.data);
};

// ─── Render text as an SVG buffer with full styling + word wrap ──
const renderTextToSvg = (text, style, width, height) => {
  const fontSize = style.fontSize || 16;
  const color = style.color || '#000000';
  const fontWeight = style.bold ? 'bold' : 'normal';
  const fontStyle = style.italic ? 'italic' : 'normal';
  const textDecoration = style.underline ? 'underline' : 'none';
  const textAlign = style.alignment || 'left';
  const fontFamily = style.fontFamily || 'Arial';
  const textTransform = style.textTransform || 'none';
  const lineHeight = (style.lineHeight || 1.4) * fontSize;

  // Apply text transform
  let displayText = text;
  if (textTransform === 'uppercase') displayText = text.toUpperCase();
  else if (textTransform === 'lowercase') displayText = text.toLowerCase();
  else if (textTransform === 'capitalize') {
    displayText = text.replace(/\b\w/g, char => char.toUpperCase());
  }

  // ─── Word wrap (heuristic) ────────────────────────────────────
  const avgCharWidth = fontSize * 0.6;
  const maxCharsPerLine = Math.max(1, Math.floor(width / avgCharWidth));

  const wrapText = (input) => {
    const paragraphs = input.split('\n');
    const lines = [];

    paragraphs.forEach(paragraph => {
      if (paragraph.length === 0) {
        lines.push('');
        return;
      }
      const words = paragraph.split(' ');
      let currentLine = '';

      words.forEach(word => {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length <= maxCharsPerLine) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          if (word.length > maxCharsPerLine) {
            let remaining = word;
            while (remaining.length > maxCharsPerLine) {
              lines.push(remaining.slice(0, maxCharsPerLine));
              remaining = remaining.slice(maxCharsPerLine);
            }
            currentLine = remaining;
          } else {
            currentLine = word;
          }
        }
      });
      if (currentLine) lines.push(currentLine);
    });

    return lines;
  };

  const lines = wrapText(displayText);

  // ─── Build SVG ────────────────────────────────────────────────
  const anchorMap = { left: 'start', center: 'middle', right: 'end' };
  const anchor = anchorMap[textAlign] || 'start';
  const xPos = textAlign === 'center' ? width / 2 : textAlign === 'right' ? width : 0;

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .text { font-family: '${fontFamily}', sans-serif; font-size: ${fontSize}px; fill: ${color}; font-weight: ${fontWeight}; font-style: ${fontStyle}; text-decoration: ${textDecoration}; }
    </style>`;

  lines.forEach((line, i) => {
    // ✅ Start at the top of the box (y = 0), matching the frontend
    const y = i * lineHeight;
    svg += `<text class="text" x="${xPos}" y="${y}" text-anchor="${anchor}" dominant-baseline="hanging">${line}</text>`;
  });

  svg += `</svg>`;
  return Buffer.from(svg);
};
// ─── Generate styled QR as PNG buffer (using SVG intermediate) ──
const generateQrBuffer = async (data, config) => {
  const svg = await renderStyledQR(data, config);
  return sharp(Buffer.from(svg)).png().toBuffer();
};

// ─── Main overlay function ────────────────────────────────────────
const overlayDesign = async ({
  templateUrl,
  qrPosition,
  qrData,
  qrConfig = {},
  textOverlays = [],
  padding = 0.15,
}) => {
  // Download template
  const template = await downloadImage(templateUrl);

  const pos = {
    x: Math.round(qrPosition.x),
    y: Math.round(qrPosition.y),
    width: Math.round(qrPosition.width),
    height: Math.round(qrPosition.height),
  };

  // ─── 1. Generate QR (now with full styling) ────────────────────
  const qrBuffer = await generateQrBuffer(qrData, qrConfig);

  const targetWidth = pos.width;
  const targetHeight = pos.height;
  const paddingFraction = padding;
  const innerWidth = Math.round(targetWidth * (1 - paddingFraction * 2));
  const innerHeight = Math.round(targetHeight * (1 - paddingFraction * 2));
  const offsetX = Math.round((targetWidth - innerWidth) / 2);
  const offsetY = Math.round((targetHeight - innerHeight) / 2);

  const qrResized = await sharp(qrBuffer)
    .resize(innerWidth, innerHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

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

  const qrWithBg = await sharp(whiteBg)
    .composite([{ input: qrResized, top: offsetY, left: offsetX }])
    .png()
    .toBuffer();

  // ─── 2. Generate text overlays ──────────────────────────────────
  const overlayBuffers = [{ input: qrWithBg, top: pos.y, left: pos.x }];

  for (const overlay of textOverlays) {
    const text = overlay.text || '';
    const style = overlay.style || {};
    const overlayPos = overlay.position || { x: 0, y: 0, width: 100, height: 20 };
    const svgBuffer = renderTextToSvg(text, style, overlayPos.width, overlayPos.height);
    overlayBuffers.push({ input: svgBuffer, top: overlayPos.y, left: overlayPos.x });
  }

  // ─── 3. Composite all onto template ────────────────────────────
  const result = await sharp(template)
    .composite(overlayBuffers)
    .png()
    .toBuffer();

  return result;
};

module.exports = { overlayDesign };