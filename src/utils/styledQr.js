// utils/styledQr.js
const QRCode = require('qrcode');

// ─── Helpers to generate SVG shapes ──────────────────────────────
const shapeToSvg = (type, x, y, width, height, color) => {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const size = Math.min(width, height);
  const half = size / 2;

  switch (type) {
    case 'circle':
      return `<circle cx="${cx}" cy="${cy}" r="${half}" fill="${color}" />`;

    case 'rounded': {
      const r = size * 0.2;
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="${color}" />`;
    }

    case 'diamond':
      return `<polygon points="${cx},${y} ${x + width},${cy} ${cx},${y + height} ${x},${cy}" fill="${color}" />`;

    case 'star': {
      const spikes = 5;
      const outerRadius = half;
      const innerRadius = half * 0.45;
      let points = '';
      let rot = Math.PI / 2 * 3;
      const step = Math.PI / spikes;
      for (let i = 0; i < spikes; i++) {
        const bx = cx + Math.cos(rot) * outerRadius;
        const by = cy + Math.sin(rot) * outerRadius;
        points += `${bx},${by} `;
        rot += step;
        const bx2 = cx + Math.cos(rot) * innerRadius;
        const by2 = cy + Math.sin(rot) * innerRadius;
        points += `${bx2},${by2} `;
        rot += step;
      }
      return `<polygon points="${points.trim()}" fill="${color}" />`;
    }

    case 'triangle': {
      const topX = cx;
      const topY = y + 2;
      const bottomLeftX = x + 2;
      const bottomLeftY = y + height - 2;
      const bottomRightX = x + width - 2;
      const bottomRightY = y + height - 2;
      return `<polygon points="${topX},${topY} ${bottomRightX},${bottomRightY} ${bottomLeftX},${bottomLeftY}" fill="${color}" />`;
    }

    case 'square':
    default:
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" />`;
  }
};

// ─── Determine finder pattern membership ─────────────────────────
const getFinderPart = (row, col, size) => {
  const isTopLeft = row < 7 && col < 7;
  const isTopRight = row < 7 && col >= size - 7;
  const isBottomLeft = row >= size - 7 && col < 7;

  if (!isTopLeft && !isTopRight && !isBottomLeft) return null;

  const inInner = (r, c, cornerR, cornerC) =>
    r >= cornerR + 2 && r <= cornerR + 4 && c >= cornerC + 2 && c <= cornerC + 4;

  if (isTopLeft && inInner(row, col, 0, 0)) return 'inner';
  if (isTopRight && inInner(row, col, 0, size - 7)) return 'inner';
  if (isBottomLeft && inInner(row, col, size - 7, 0)) return 'inner';

  return 'outer';
};

// ─── Render a styled QR code as an SVG string ───────────────────
const renderStyledQR = async (text, options) => {
  const {
    lightColor = '#ffffff',
    finderOuterColor = '#000000',
    finderOuterShape = 'square',
    finderInnerColor = '#000000',
    finderInnerShape = 'square',
    dataColor = '#000000',
    dataShape = 'square',
  } = options;

  // Generate QR matrix
  const qrData = await QRCode.create(text, { errorCorrectionLevel: 'M' });
  const modules = qrData.modules;
  const moduleCount = modules.size;

  const canvasSize = 500;
  const moduleSize = canvasSize / moduleCount;

  let svg = `<svg width="${canvasSize}" height="${canvasSize}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${lightColor}" />`;

  // ─── 1. Draw finder patterns (three corners) ──────────────────
  const drawFinder = (cornerRow, cornerCol) => {
    const x = cornerCol * moduleSize;
    const y = cornerRow * moduleSize;
    const outerSize = 7 * moduleSize;
    const holeSize = 5 * moduleSize;
    const dotSize = 3 * moduleSize;
    const cx = x + outerSize / 2;
    const cy = y + outerSize / 2;

    // Outer shape
    svg += shapeToSvg(finderOuterShape, x, y, outerSize, outerSize, finderOuterColor);

    // Hole (drawn in light color to create the ring)
    const holeX = x + (outerSize - holeSize) / 2;
    const holeY = y + (outerSize - holeSize) / 2;
    svg += shapeToSvg(finderOuterShape, holeX, holeY, holeSize, holeSize, lightColor);

    // Inner dot
    const dotX = x + (outerSize - dotSize) / 2;
    const dotY = y + (outerSize - dotSize) / 2;
    svg += shapeToSvg(finderInnerShape, dotX, dotY, dotSize, dotSize, finderInnerColor);
  };

  drawFinder(0, 0);
  drawFinder(0, moduleCount - 7);
  drawFinder(moduleCount - 7, 0);

  // ─── 2. Draw data modules (skip finder areas) ────────────────
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (modules.get(row, col)) {
        const part = getFinderPart(row, col, moduleCount);
        if (part === null) {
          const x = col * moduleSize;
          const y = row * moduleSize;
          svg += shapeToSvg(dataShape, x, y, moduleSize, moduleSize, dataColor);
        }
      }
    }
  }

  svg += '</svg>';
  return svg;
};

module.exports = { renderStyledQR };