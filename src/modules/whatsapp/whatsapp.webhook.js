const config = require('../../config');
const Campaign = require('../campaigns/campaign.model');

// GET: verify webhook
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// POST: handle incoming events
const handleWebhookEvent = async (req, res) => {
  const { entry } = req.body;
  if (!entry) return res.sendStatus(400);

  const changes = entry[0]?.changes?.[0]?.value;
  if (!changes) return res.sendStatus(200);

  const { messages, statuses } = changes;

  // Process message status updates (delivered, read, failed)
  if (statuses) {
    for (const status of statuses) {
      const { id: messageId, recipient_id: phone, status: deliveryStatus } = status;
      // Update campaign recipient status based on phone
      const campaign = await Campaign.findOne({ 'recipients.phone': phone, status: 'sending' });
      if (campaign) {
        const recipient = campaign.recipients.find((r) => r.phone === phone);
        if (recipient && deliveryStatus === 'failed') {
          recipient.status = 'failed';
          recipient.failureReason = 'WhatsApp delivery failed';
          campaign.failed += 1;
          campaign.delivered -= 1; // adjust if previously counted
          await campaign.save();
        }
      }
    }
  }

  res.sendStatus(200);
};

module.exports = { verifyWebhook, handleWebhookEvent };