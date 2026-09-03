const axios = require('axios');
const config = require('../../config');
const Campaign = require('../campaigns/campaign.model');
const WhatsAppMessage = require('../campaigns/message.model');
const minioService = require('../../services/minio.service');   // 👈 add import

// Helper to fetch media URL from WhatsApp Graph API
const getMediaUrl = async (mediaId, accessToken) => {
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v25.0';
  const url = `https://graph.facebook.com/${apiVersion}/${mediaId}`;
  try {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return data.url || '';
  } catch (err) {
    console.error(`Failed to fetch media URL for ${mediaId}:`, err.message);
    return '';
  }
};

// Download media from URL and upload to MinIO, return permanent URL
const downloadAndUploadMedia = async (mediaUrl, mediaType) => {
  try {
    const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    const extension = contentType.split('/')[1] || 'bin';
    const objectName = `whatsapp_media/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${extension}`;

    const minioUrl = await minioService.uploadBuffer(objectName, buffer, { 'Content-Type': contentType });
    return minioUrl;
  } catch (err) {
    console.error('Failed to download/upload media:', err.message);
    return mediaUrl; // fallback to original temporary URL
  }
};

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

        const campaigns = await Campaign.find({ 'recipients.phone': normalizedPhone });
        if (!campaigns || campaigns.length === 0) {
          console.log(`❌ No campaign found for phone ${normalizedPhone}`);
          continue;
        }

        // Robust extraction of message body
        let messageBody = '';
        if (msg.type === 'text' && msg.text) {
          messageBody = msg.text.body || '';
        } else if (msg.type === 'interactive' && msg.interactive) {
          if (msg.interactive.button_reply) {
            messageBody = msg.interactive.button_reply.title || msg.interactive.button_reply.payload || msg.interactive.button_reply.id || '';
          } else if (msg.interactive.list_reply) {
            messageBody = msg.interactive.list_reply.title || msg.interactive.list_reply.description || msg.interactive.list_reply.id || '';
          }
        } else if (msg.type === 'button' && msg.button) {
          messageBody = msg.button.payload || msg.button.text || '';
        }
        if (!messageBody) messageBody = '';

        console.log('Extracted messageBody:', messageBody);

        // Determine media type and retrieve media URL
        let mediaUrl = '';
        let mediaType = '';
        if (msg.image && msg.image.id) {
          mediaType = 'image';
          mediaUrl = await getMediaUrl(msg.image.id, config.whatsapp.accessToken);
        } else if (msg.document && msg.document.id) {
          mediaType = 'document';
          mediaUrl = await getMediaUrl(msg.document.id, config.whatsapp.accessToken);
        } else if (msg.audio && msg.audio.id) {
          mediaType = 'audio';
          mediaUrl = await getMediaUrl(msg.audio.id, config.whatsapp.accessToken);
        } else if (msg.video && msg.video.id) {
          mediaType = 'video';
          mediaUrl = await getMediaUrl(msg.video.id, config.whatsapp.accessToken);
        }

        // If media URL exists, download and store permanently in MinIO
        if (mediaUrl) {
          console.log('Original media URL:', mediaUrl);
          mediaUrl = await downloadAndUploadMedia(mediaUrl, mediaType);
          console.log('Permanent media URL:', mediaUrl);
        }

        const timestamp = msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : new Date();

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
            status: 'sent',
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
        const { id: messageId, recipient_id: phone, status: deliveryStatus, errors } = status;
        const normalizedPhone = phone.replace(/\D/g, '');
        console.log(`Normalized phone: ${normalizedPhone}, Delivery status: ${deliveryStatus}`);

        // Update WhatsAppMessage status if failed
        if (deliveryStatus === 'failed') {
          let failureReason = '';
          if (errors && errors.length > 0) {
            const err = errors[0];
            failureReason = err.error_data?.details || err.message || err.title || 'Unknown error';
          } else {
            failureReason = 'WhatsApp delivery failed';
          }

          console.log(`Failure reason: ${failureReason}`);

          const updatedMsg = await WhatsAppMessage.findOneAndUpdate(
            { whatsappMessageId: messageId },
            { status: 'failed', failureReason },
            { new: true }
          );
          if (updatedMsg) {
            console.log(`❌ WhatsAppMessage ${messageId} marked as failed with reason: ${failureReason}`);
          } else {
            console.log(`⚠️ No WhatsAppMessage found for ID ${messageId}`);
          }
        }

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