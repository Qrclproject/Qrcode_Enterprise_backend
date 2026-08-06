const crypto = require('crypto');

// Derive a fixed 32‑byte key using SHA‑256 from the environment variable
const KEY = crypto.createHash('sha256')
  .update(process.env.QR_ENCRYPTION_KEY || 'default-key-32-bytes!!!change-me!!!')
  .digest(); // 32 bytes

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Encrypt plaintext with AES‑256‑CBC.
 * @param {string} text - Plain text.
 * @returns {string} - iv:encryptedBase64
 */
const encrypt = (text) => {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return `${iv.toString('base64')}:${encrypted}`;
};

/**
 * Decrypt an encrypted string.
 * @param {string} encryptedData - Format "iv:encryptedBase64".
 * @returns {string} - Decrypted plaintext.
 * @throws {Error} If decryption fails.
 */
const decrypt = (encryptedData) => {
  const parts = encryptedData.split(':');
  if (parts.length !== 2) throw new Error('Invalid encrypted data format');
  const iv = Buffer.from(parts[0], 'base64');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports = { encrypt, decrypt };