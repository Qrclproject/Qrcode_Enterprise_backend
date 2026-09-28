// src/utils/fontMapper.js
//
// The design editor lets users pick from a set of Windows/Office-style
// fonts (Arial, Times New Roman, Georgia, etc.). Linux containers do not
// ship those exact families, but Liberation and DejaVu are shape- and
// metric-compatible drop-ins that our nixpacks.toml installs.
//
// This module translates the user's requested family name into a family
// that actually exists on the deployment host, so librsvg can resolve
// glyphs instead of drawing .notdef (the empty-box character).

const FONT_MAP = {
  // ── Sans family → Liberation Sans (metrically equivalent to Arial) ──
  'Arial':           'Liberation Sans',
  'Helvetica':       'Liberation Sans',
  'Verdana':         'DejaVu Sans',
  'Tahoma':          'DejaVu Sans',
  'Trebuchet MS':    'DejaVu Sans',
  'Impact':          'DejaVu Sans Condensed',
  'Comic Sans MS':   'DejaVu Sans',

  // ── Serif family → Liberation Serif (metrically = Times New Roman) ──
  'Times New Roman': 'Liberation Serif',
  'Georgia':         'Liberation Serif',

  // ── Monospace family → Liberation Mono (metrically = Courier New) ──
  'Courier New':     'Liberation Mono',
};

const DEFAULT_FONT = 'DejaVu Sans';

/**
 * Resolve a design-editor font name to a family that exists on the
 * deployment host. Always returns something usable.
 *
 * @param {string} requested - Font family from the design (e.g. "Times New Roman")
 * @returns {string} - A font family name guaranteed to be installed
 */
const mapFont = (requested) => {
  if (!requested) return DEFAULT_FONT;
  const key = String(requested).trim();
  return FONT_MAP[key] || DEFAULT_FONT;
};

module.exports = { mapFont, FONT_MAP, DEFAULT_FONT };
