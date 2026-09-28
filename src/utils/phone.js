// src/utils/phone.js
//
// Centralized phone normalization for the WhatsApp Cloud API.
//
// The API accepts digits only — no '+', no spaces, no dashes — with the
// country calling code included and NO leading zero.
//
// The `enabled` flag lets the user turn country-code injection OFF.
// When OFF, only non-digit characters are stripped; nothing else is added.

const COUNTRY_CODES = {
  NG: '234', GH: '233', KE: '254', ZA: '27',  EG: '20',
  TZ: '255', UG: '256', RW: '250', ET: '251', CI: '225',
  SN: '221', CM: '237', US: '1',   GB: '44',  FR: '33',
  DE: '49',  IT: '39',  ES: '34',  NL: '31',  AE: '971',
  SA: '966', IN: '91',  CN: '86',  JP: '81',  BR: '55',
  AU: '61',  CA: '1',
};

const COUNTRY_OPTIONS = [
  { code: '234', label: 'Nigeria (+234)' },
  { code: '233', label: 'Ghana (+233)' },
  { code: '254', label: 'Kenya (+254)' },
  { code: '27',  label: 'South Africa (+27)' },
  { code: '20',  label: 'Egypt (+20)' },
  { code: '255', label: 'Tanzania (+255)' },
  { code: '256', label: 'Uganda (+256)' },
  { code: '250', label: 'Rwanda (+250)' },
  { code: '251', label: 'Ethiopia (+251)' },
  { code: '225', label: "Côte d'Ivoire (+225)" },
  { code: '221', label: 'Senegal (+221)' },
  { code: '237', label: 'Cameroon (+237)' },
  { code: '1',   label: 'USA / Canada (+1)' },
  { code: '44',  label: 'United Kingdom (+44)' },
  { code: '33',  label: 'France (+33)' },
  { code: '49',  label: 'Germany (+49)' },
  { code: '39',  label: 'Italy (+39)' },
  { code: '34',  label: 'Spain (+34)' },
  { code: '31',  label: 'Netherlands (+31)' },
  { code: '971', label: 'UAE (+971)' },
  { code: '966', label: 'Saudi Arabia (+966)' },
  { code: '91',  label: 'India (+91)' },
  { code: '86',  label: 'China (+86)' },
  { code: '81',  label: 'Japan (+81)' },
  { code: '55',  label: 'Brazil (+55)' },
  { code: '61',  label: 'Australia (+61)' },
];

// Longer prefixes first so "234" matches before "23" etc.
const ALL_COUNTRY_CODES = [...new Set([
  ...Object.values(COUNTRY_CODES),
  ...COUNTRY_OPTIONS.map((o) => o.code),
])].sort((a, b) => b.length - a.length);

/**
 * Normalize a phone number for WhatsApp delivery.
 *
 * @param {string} phone
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]  false → strip non-digits only
 * @param {string}  [options.countryCode='234']  E.164 code without '+'
 * @returns {string} Digits-only phone number
 */
const normalizePhone = (phone, options = {}) => {
  const { enabled = true, countryCode = '234' } = options;

  if (phone === null || phone === undefined || phone === '') return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';

  // ── Toggle OFF: only strip separators, add nothing ────────────
  if (!enabled) return digits;

  // ── Toggle ON ────────────────────────────────────────────────
  // 1) Already has the target country code
  if (digits.startsWith(countryCode)) return digits;

  // 2) Local format with a leading 0 → replace with country code
  if (digits.startsWith('0')) return countryCode + digits.slice(1);

  // 3) Starts with a *different* known country code and is long enough
  //    to be a valid foreign number → leave it alone
  const matchesForeign = ALL_COUNTRY_CODES.some(
    (cc) => cc !== countryCode && digits.startsWith(cc)
  );
  if (matchesForeign && digits.length >= 11) return digits;

  // 4) Fallback: assume local number missing its country code
  return countryCode + digits;
};

/**
 * Debug helper — returns a trace of what happened.
 * Used by the /api/campaigns/debug/normalize-phone endpoint.
 */
const debugNormalizePhone = (phone, options = {}) => {
  const { enabled = true, countryCode = '234' } = options;
  const digits = String(phone ?? '').replace(/\D/g, '');
  const matchesForeign = ALL_COUNTRY_CODES.find(
    (cc) => cc !== countryCode && digits.startsWith(cc)
  );
  const output = normalizePhone(phone, options);

  let reason = '';
  if (!digits) reason = 'empty';
  else if (!enabled) reason = 'toggle OFF — stripped non-digits only';
  else if (digits.startsWith(countryCode)) reason = `already starts with ${countryCode}`;
  else if (digits.startsWith('0')) reason = `replaced leading 0 with ${countryCode}`;
  else if (matchesForeign && digits.length >= 11)
    reason = `foreign prefix '${matchesForeign}' detected — left as-is`;
  else reason = `prepended ${countryCode}`;

  return { input: phone, options: { enabled, countryCode }, digits, output, reason };
};

module.exports = {
  normalizePhone,
  debugNormalizePhone,
  COUNTRY_CODES,
  COUNTRY_OPTIONS,
  ALL_COUNTRY_CODES,
};
