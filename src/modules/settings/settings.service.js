const Settings = require('./settings.model');
const ApiError = require('../../utils/apiError');

const getSettings = async (userId) => {
  let settings = await Settings.findOne({ userId });
  if (!settings) {
    // Create default settings for the user
    settings = await Settings.create({ userId });
  }
  return settings;
};

const updateSettings = async (userId, data) => {
  const settings = await Settings.findOneAndUpdate({ userId }, data, {
    new: true,
    upsert: true,
    runValidators: true,
  });
  return settings;
};

module.exports = { getSettings, updateSettings };