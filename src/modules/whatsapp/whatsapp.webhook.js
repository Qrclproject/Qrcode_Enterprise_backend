const config = require('../../config');
const Campaign = require('../campaigns/campaign.model');
const WhatsAppMessage = require('../campaigns/message.model');

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

  // 1. Process incoming messages
  if (messages && messages.length > 0) {
    for (const msg of messages) {
      try {
        const phone = msg.from; // includes '+' sign
        const normalizedPhone = phone.replace(/\D/g, ''); // remove non-digits

        // Find campaign containing this phone number
        const campaign = await Campaign.findOne({ 'recipients.phone': normalizedPhone });
        if (!campaign) continue;

        const recipient = campaign.recipients.find((r) => r.phone === normalizedPhone);
        if (!recipient) continue;

        // Extract message content
        const messageBody = msg.text?.body || '';
        const mediaUrl = msg.image?.link || msg.document?.link || msg.audio?.link || msg.video?.link || null;
        const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

        // Save incoming message
        await WhatsAppMessage.create({
          campaignId: campaign._id,
          recipientId: recipient._id,
          phone: normalizedPhone,
          direction: 'incoming',
          body: messageBody,
          mediaUrl,
          whatsappMessageId: msg.id,
          timestamp,
        });
      } catch (err) {
        console.error('Failed to store incoming WhatsApp message:', err.message);
      }
    }
  }

  // 2. Process message status updates (delivered, read, failed)
  if (statuses) {
    for (const status of statuses) {
      try {
        const { id: messageId, recipient_id: phone, status: deliveryStatus } = status;
        const normalizedPhone = phone.replace(/\D/g, '');
        const campaign = await Campaign.findOne({ 'recipients.phone': normalizedPhone, status: 'sending' });
        if (campaign) {
          const recipient = campaign.recipients.find((r) => r.phone === normalizedPhone);
          if (recipient && deliveryStatus === 'failed') {
            recipient.status = 'failed';
            recipient.failureReason = 'WhatsApp delivery failed';
            campaign.failed += 1;
            campaign.delivered -= 1; // adjust if previously counted
            await campaign.save();
          }
        }
      } catch (err) {
        console.error('Failed to process message status:', err.message);
      }
    }
  }

  res.sendStatus(200);
};

module.exports = { verifyWebhook, handleWebhookEvent };