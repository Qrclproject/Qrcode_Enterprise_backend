// src/modules/campaigns/overlay.service.js
const sharp = require('sharp');
const axios = require('axios');
const { renderStyledQR } = require('../../utils/styledQr');

// ─── Download helper ──────────────────────────────────────────────
const downloadImage = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
  });
  return Buffer.from(response.data);
};

// ─── XML escaping so SVG stays valid even with &, <, >, " in data ─
const escapeXml = (str) =>
  String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// ─── Render text as an SVG buffer with full styling + word wrap ──
const renderTextToSvg = (text, style, width, height) => {
  const fontSize       = style.fontSize || 16;
  const color          = style.color || '#000000';
  const fontWeight     = style.bold ? 'bold' : 'normal';
  const fontStyle      = style.italic ? 'italic' : 'normal';
  const textDecoration = style.underline ? 'underline' : 'none';
  const textAlign      = style.alignment || 'left';
  const fontFamily     = style.fontFamily || 'Arial';
  const textTransform  = style.textTransform || 'none';
  const lineHeight     = (style.lineHeight || 1.4) * fontSize;

  // Apply text transform
  let displayText = text ?? '';
  if (textTransform === 'uppercase') displayText = displayText.toUpperCase();
  else if (textTransform === 'lowercase') displayText = displayText.toLowerCase();
  else if (textTransform === 'capitalize') {
    displayText = displayText.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  // ─── Word wrap (heuristic based on average character width) ───
  const avgCharWidth = fontSize * 0.6;
  const maxCharsPerLine = Math.max(1, Math.floor(width / avgCharWidth));

  const wrapText = (input) => {
    const paragraphs = input.split('\n');
    const lines = [];

    paragraphs.forEach((paragraph) => {
      if (paragraph.length === 0) {
        lines.push('');
        return;
      }
      const words = paragraph.split(' ');
      let currentLine = '';

      words.forEach((word) => {
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
  // Using INLINE attributes only (no <style> block, no class selectors)
  // because Sharp/librsvg has limited CSS support.
  const anchorMap = { left: 'start', center: 'middle', right: 'end' };
  const anchor = anchorMap[textAlign] || 'start';
  const xPos =
    textAlign === 'center' ? width / 2 :
    textAlign === 'right'  ? width :
    0;

  const safeFontFamily = escapeXml(fontFamily);

  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;

  lines.forEach((line, i) => {
    // Offset by fontSize so default baseline puts the TOP of the text
    // at y = i * lineHeight (avoids reliance on dominant-baseline which
    // librsvg doesn't reliably honour).
    const y = i * lineHeight + fontSize;
    svg +=
      `<text ` +
        `x="${xPos}" ` +
        `y="${y}" ` +
        `text-anchor="${anchor}" ` +
        `font-family="${safeFontFamily}, sans-serif" ` +
        `font-size="${fontSize}px" ` +
        `font-weight="${fontWeight}" ` +
        `font-style="${fontStyle}" ` +
        `text-decoration="${textDecoration}" ` +
        `fill="${color}"` +
      `>${escapeXml(line)}</text>`;
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

  // ─── 1. Generate QR (with full styling) ────────────────────────
  const qrBuffer = await generateQrBuffer(qrData, qrConfig);

  const targetWidth = pos.width;
  const targetHeight = pos.height;
  const paddingFraction = padding;
  const innerWidth = Math.round(targetWidth * (1 - paddingFraction * 2));
  const innerHeight = Math.round(targetHeight * (1 - paddingFraction * 2));
  const offsetX = Math.round((targetWidth - innerWidth) / 2);
  const offsetY = Math.round((targetHeight - innerHeight) / 2);

  const qrResized = await sharp(qrBuffer)
    .resize(innerWidth, innerHeight, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
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

  // ─── 2. Generate text overlays ─────────────────────────────────
  const overlayBuffers = [{ input: qrWithBg, top: pos.y, left: pos.x }];

  for (const overlay of textOverlays) {
    const text = overlay.text || '';
    const style = overlay.style || {};
    const overlayPos = overlay.position || { x: 0, y: 0, width: 100, height: 20 };

    // Skip empty overlays entirely — drawing an empty SVG is wasted work
    // and occasionally trips up librsvg.
    if (!text.trim()) continue;

    const svgBuffer = renderTextToSvg(
      text,
      style,
      overlayPos.width,
      overlayPos.height
    );

    overlayBuffers.push({
      input: svgBuffer,
      top: Math.round(overlayPos.y),
      left: Math.round(overlayPos.x),
    });
  }

  // ─── 3. Composite all onto template ────────────────────────────
  const result = await sharp(template)
    .composite(overlayBuffers)
    .png()
    .toBuffer();

  return result;
};

module.exports = { overlayDesign, renderTextToSvg };
