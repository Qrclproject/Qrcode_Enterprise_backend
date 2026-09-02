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

        const phone = msg.from;
        const normalizedPhone = phone.replace(/\D/g, '');
        console.log(`📱 Normalized phone: ${normalizedPhone}`);

        // 🔍 Find ALL campaigns that contain this phone number
        const campaigns = await Campaign.find({ 'recipients.phone': normalizedPhone });
        if (!campaigns || campaigns.length === 0) {
          console.log(`❌ No campaign found for phone ${normalizedPhone}`);
          continue;
        }

        // --- Robust extraction of message body ---
        let messageBody = '';

        // 1. Text message
        if (msg.type === 'text' && msg.text) {
          messageBody = msg.text.body || '';
        }
        // 2. Interactive message (quick reply / list reply)
        else if (msg.type === 'interactive' && msg.interactive) {
          // Quick reply button
          if (msg.interactive.button_reply) {
            messageBody =
              msg.interactive.button_reply.title ||
              msg.interactive.button_reply.payload ||
              msg.interactive.button_reply.id ||
              '';
          }
          // List reply
          else if (msg.interactive.list_reply) {
            messageBody =
              msg.interactive.list_reply.title ||
              msg.interactive.list_reply.description ||
              msg.interactive.list_reply.id ||
              '';
          }
        }
        // 3. Button message (some older API versions)
        else if (msg.type === 'button' && msg.button) {
          messageBody = msg.button.payload || msg.button.text || '';
        }
        // 4. Fallback: try to find any text or payload
        if (!messageBody) {
          messageBody = msg.text?.body || msg.payload || msg.title || '';
        }

        console.log('Extracted messageBody:', messageBody);

        const mediaUrl = msg.image?.link || msg.document?.link || msg.audio?.link || msg.video?.link || null;
        const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

        // Save incoming message in each campaign that contains this recipient
        for (const campaign of campaigns) {
          const recipient = campaign.recipients.find((r) => r.phone === normalizedPhone);
          if (!recipient) continue;

          console.log(`✅ Saving to campaign: ${campaign.name} (ID: ${campaign._id})`);

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
        }
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

        // Find all campaigns with this recipient and status 'sending'
        const campaigns = await Campaign.find({ 'recipients.phone': normalizedPhone, status: 'sending' });
        for (const campaign of campaigns) {
          const recipient = campaign.recipients.find((r) => r.phone === normalizedPhone);
          if (recipient && deliveryStatus === 'failed') {
            console.log(`❌ Marking recipient ${recipient.phone} as failed in campaign ${campaign._id}`);
            recipient.status = 'failed';
            recipient.failureReason = 'WhatsApp delivery failed';
            campaign.failed += 1;
            campaign.delivered -= 1;
            await campaign.save();
          }
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