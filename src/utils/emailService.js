// Placeholder email service – use a real provider like SendGrid, nodemailer, etc.
const logger = require('./logger');

const sendEmail = async ({ to, subject, html }) => {
  // In production, integrate with your email provider
  logger.info(`Email sent to ${to} - Subject: ${subject}`);
  return true;
};

module.exports = { sendEmail };