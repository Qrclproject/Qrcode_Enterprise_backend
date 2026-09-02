const config = require('../../config');
const Campaign = require('../campaigns/campaign.model');
const WhatsAppMessage = require('../campaigns/message.model');

// GET: verify webhook
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('\n===== 🌐 WEBHOOK VERIFY REQUEST =====');
  console.log('Mode:', mode);
  console.log('Token:', token);
  console.log('Challenge:', challenge);
  console.log('=====================================\n');

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// POST: handle incoming events
const handleWebhookEvent = async (req, res) => {
  console.log('\n===== 🌐 WEBHOOK EVENT RECEIVED =====');
  console.log('Full payload:', JSON.stringify(req.body, null, 2));
  console.log('=====================================\n');

  const { entry } = req.body;
  if (!entry || entry.length === 0) {
    console.log('❌ No entry found in payload');
    return res.sendStatus(400);
  }

  const changes = entry[0]?.changes?.[0]?.value;
  if (!changes) {
    console.log('❌ No changes found');
    return res.sendStatus(200);
  }

  const { messages, statuses } = changes;
  console.log(`📨 Messages: ${messages?.length || 0}, Statuses: ${statuses?.length || 0}`);

  // 1. Process incoming messages
  if (messages && messages.length > 0) {
    for (const msg of messages) {
      try {
        console.log('\n--- Processing Incoming Message ---');
        console.log('Raw message:', JSON.stringify(msg, null, 2));

        const phone = msg.from; // includes '+' sign
        const normalizedPhone = phone.replace(/\D/g, ''); // remove non-digits
        console.log(`📱 Normalized phone: ${normalizedPhone}`);

        // Find campaign containing this phone number
        const campaign = await Campaign.findOne({ 'recipients.phone': normalizedPhone });
        if (!campaign) {
          console.log(`❌ No campaign found for phone ${normalizedPhone}`);
          continue;
        }

        const recipient = campaign.recipients.find((r) => r.phone === normalizedPhone);
        if (!recipient) {
          console.log(`❌ No recipient found for phone ${normalizedPhone} in campaign ${campaign._id}`);
          continue;
        }

        console.log(`✅ Found recipient: ${recipient.name || recipient.phone} in campaign ${campaign.name}`);

        // Extract message content
        const messageBody = msg.text?.body || '';
        const mediaUrl = msg.image?.link || msg.document?.link || msg.audio?.link || msg.video?.link || null;
        const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

        console.log('Content:', { messageBody, mediaUrl, timestamp });

        // Save incoming message
        const savedMessage = await WhatsAppMessage.create({
          campaignId: campaign._id,
          recipientId: recipient._id,
          phone: normalizedPhone,
          direction: 'incoming',
          body: messageBody,
          mediaUrl,
          whatsappMessageId: msg.id,
          timestamp,
        });

        console.log(`💾 Message saved with ID: ${savedMessage._id}`);
      } catch (err) {
        console.error('❌ Failed to store incoming WhatsApp message:', err.message);
        console.error(err.stack);
      }
    }
  }

  // 2. Process message status updates (delivered, read, failed)
  if (statuses && statuses.length > 0) {
    console.log('\n--- Processing Status Updates ---');
    for (const status of statuses) {
      try {
        console.log('Status:', JSON.stringify(status, null, 2));
        const { id: messageId, recipient_id: phone, status: deliveryStatus } = status;
        const normalizedPhone = phone.replace(/\D/g, '');
        console.log(`Normalized phone: ${normalizedPhone}, Delivery status: ${deliveryStatus}`);

        const campaign = await Campaign.findOne({ 'recipients.phone': normalizedPhone, status: 'sending' });
        if (campaign) {
          const recipient = campaign.recipients.find((r) => r.phone === normalizedPhone);
          if (recipient && deliveryStatus === 'failed') {
            console.log(`❌ Marking recipient ${recipient.phone} as failed`);
            recipient.status = 'failed';
            recipient.failureReason = 'WhatsApp delivery failed';
            campaign.failed += 1;
            campaign.delivered -= 1; // adjust if previously counted
            await campaign.save();
          }
        } else {
          console.log(`No campaign in 'sending' status for phone ${normalizedPhone}`);
        }
      } catch (err) {
        console.error('❌ Failed to process message status:', err.message);
      }
    }
  }

  console.log('\n===== ✅ Webhook processing completed =====\n');
  res.sendStatus(200);
};

module.exports = { verifyWebhook, handleWebhookEvent };