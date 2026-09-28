// src/utils/phone.js
//
// Phone-number normalization for the WhatsApp Cloud API.
// The API only accepts digits (no '+', no spaces, no dashes), with the
// country calling code included and NO leading zero.

const COUNTRY_CODES = {
  NG: '234', GH: '233', KE: '254', ZA: '27',  EG: '20',
  TZ: '255', UG: '256', RW: '250', ET: '251', CI: '225',
  SN: '221', CM: '237', US: '1',   GB: '44',  FR: '33',
  DE: '49',  IT: '39',  ES: '34',  NL: '31',  AE: '971',
  SA: '966', IN: '91',  CN: '86',  JP: '81',  BR: '55',
  AU: '61',
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

const ALL_COUNTRY_CODES = [...new Set([
  ...Object.values(COUNTRY_CODES),
  ...COUNTRY_OPTIONS.map((o) => o.code),
])].sort((a, b) => b.length - a.length);

/**
 * Normalize a phone number for WhatsApp delivery.
 *
 * @param {string} phone - Raw phone as submitted by the user
 * @param {object} [options]
 * @param {boolean} [options.enabled=true]
 *   true  → full normalization (add country code, replace leading 0)
 *   false → strip separators only, leave the number as the user typed it
 * @param {string}  [options.countryCode='234']
 *   E.164 country calling code (no '+') to use for local numbers
 * @returns {string} Digits-only phone number
 */
const normalizePhone = (phone, options = {}) => {
  const { enabled = true, countryCode = '234' } = options;

  if (phone === null || phone === undefined || phone === '') return '';

  // Digits-only is required by the WhatsApp API regardless of the flag.
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';

  // Toggle OFF — leave the submitted number untouched (minus separators).
  if (!enabled) return digits;

  // Already has the target country code
  if (digits.startsWith(countryCode)) return digits;

  // Local format with a leading 0 → replace with country code
  if (digits.startsWith('0')) return countryCode + digits.slice(1);

  // Starts with a different known country code and is long enough to be
  // a valid foreign number → leave it alone
  const hasForeignPrefix = ALL_COUNTRY_CODES.some(
    (cc) => cc !== countryCode && digits.startsWith(cc)
  );
  if (hasForeignPrefix && digits.length >= 11) return digits;

  // Fallback: assume it's a local number missing its country code
  return countryCode + digits;
};

module.exports = {
  normalizePhone,
  COUNTRY_CODES,
  COUNTRY_OPTIONS,
  ALL_COUNTRY_CODES,
};
