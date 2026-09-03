const axios = require('axios');
const config = require('../../config');
const Campaign = require('../campaigns/campaign.model');
const WhatsAppMessage = require('../campaigns/message.model');
const minioService = require('../../services/minio.service');

// Helper: retrieve media URL from WhatsApp Graph API
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

// Helper: download media and upload to MinIO (permanent URL)
const downloadAndUploadMedia = async (mediaUrl) => {
  // Step 1: Download from WhatsApp
  let buffer;
  let contentType;
  try {
    console.log(`Downloading media from: ${mediaUrl}`);
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
    });
    buffer = Buffer.from(response.data, 'binary');
    contentType = response.headers['content-type'] || 'application/octet-stream';
    console.log('✅ Media downloaded successfully, content type:', contentType);
  } catch (downloadErr) {
    console.error('❌ Failed to download media:', downloadErr.message);
    // If 401, retry with Authorization header
    if (downloadErr.response?.status === 401) {
      console.log('Retrying download with Authorization header...');
      try {
        const retryResponse = await axios.get(mediaUrl, {
          responseType: 'arraybuffer',
          headers: {
            Authorization: `Bearer ${config.whatsapp.accessToken}`,
          },
        });
        buffer = Buffer.from(retryResponse.data, 'binary');
        contentType = retryResponse.headers['content-type'] || 'application/octet-stream';
        console.log('✅ Media downloaded with auth header');
      } catch (retryErr) {
        console.error('❌ Retry failed:', retryErr.message);
        return mediaUrl; // fallback to temporary URL
      }
    } else {
      return mediaUrl; // fallback
    }
  }

  // Step 2: Upload to MinIO
  try {
    const extension = contentType.split('/')[1] || 'bin';
    const objectName = `whatsapp_media/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.${extension}`;
    console.log(`Uploading to MinIO as: ${objectName}`);
    const minioUrl = await minioService.uploadBuffer(objectName, buffer, { 'Content-Type': contentType });
    console.log('✅ Uploaded to MinIO:', minioUrl);
    return minioUrl;
  } catch (uploadErr) {
    console.error('❌ Failed to upload to MinIO:', uploadErr.message);
    return mediaUrl; // fallback
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

        // Extract message body
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

        // Determine media type and retrieve temporary URL
        let mediaUrl = '';
        if (msg.image && msg.image.id) {
          mediaUrl = await getMediaUrl(msg.image.id, config.whatsapp.accessToken);
        } else if (msg.document && msg.document.id) {
          mediaUrl = await getMediaUrl(msg.document.id, config.whatsapp.accessToken);
        } else if (msg.audio && msg.audio.id) {
          mediaUrl = await getMediaUrl(msg.audio.id, config.whatsapp.accessToken);
        } else if (msg.video && msg.video.id) {
          mediaUrl = await getMediaUrl(msg.video.id, config.whatsapp.accessToken);
        }

        // If media URL exists, attempt to store permanently in MinIO
        if (mediaUrl) {
          console.log('Original media URL:', mediaUrl);
          mediaUrl = await downloadAndUploadMedia(mediaUrl);
          console.log('Stored media URL:', mediaUrl);
        } else {
          console.log('No media URL found for this message');
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