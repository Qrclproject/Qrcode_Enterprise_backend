const Settings = require('./settings.model');
const ApiError = require('../../utils/apiError');

const DEFAULT_MESSAGE_DEFAULTS = {
  language: 'en',
  senderName: '',
  autoAttachQr: true,
  readReceipts: true,
  deliveryDelay: 0,
  retryAttempts: 3,
  autoAddCountryCode: true,
  defaultCountryCode: '234',
};

/**
 * Get settings for a user, creating defaults if none exist yet.
 * Also backfills missing messageDefaults fields for existing users.
 */
const getSettings = async (userId) => {
  let settings = await Settings.findOne({ userId });

  if (!settings) {
    settings = await Settings.create({ userId });
    return settings;
  }

  // Backfill: users created before the country-code feature existed will
  // have a `messageDefaults` object without `autoAddCountryCode` /
  // `defaultCountryCode`. Merge in the defaults without overwriting
  // anything the user has explicitly set.
  const md = settings.messageDefaults || {};
  let dirty = false;

  Object.entries(DEFAULT_MESSAGE_DEFAULTS).forEach(([key, value]) => {
    if (md[key] === undefined || md[key] === null) {
      md[key] = value;
      dirty = true;
    }
  });

  if (dirty) {
    settings.messageDefaults = md;
    settings.markModified('messageDefaults');
    await settings.save();
  }

  return settings;
};

const updateSettings = async (userId, data) => {
  // Deep-merge messageDefaults so callers can send partial updates
  // without wiping out the other fields.
  const existing = await Settings.findOne({ userId });

  const merged = {
    ...data,
    messageDefaults: {
      ...(existing?.messageDefaults?.toObject?.() || existing?.messageDefaults || {}),
      ...(data.messageDefaults || {}),
    },
  };

  const settings = await Settings.findOneAndUpdate({ userId }, merged, {
    new: true,
    upsert: true,
    runValidators: true,
  });

  return settings;
};

module.exports = { getSettings, updateSettings };
