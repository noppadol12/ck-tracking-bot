// ============================================================
//  api/webhook.js — LINE Webhook Entry Point
//  ไลน์บอทแจ้งเลขพัสดุ — ร้าน ซี.เค.แอร์คอนด์
// ============================================================

const { generateTrackingImage } = require('../lib/imageGen');

// In-memory state
const userState = {};

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ status: 'ok' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const events = req.body?.events || [];
    await Promise.all(events.map(event => {
      if (event.type === 'message' && event.message?.type === 'text') return handleTextMessage(event);
      else if (event.type === 'postback') return handlePostback(event);
    }));
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
  return res.status(200).json({ status: 'ok' });
};

async function handleTextMessage(event) {
  const userId     = event.source.userId;
  const replyToken = event.replyToken;
  const text       = (event.message.text || '').trim();
  const state      = userState[userId] || 'IDLE';

  if (['เริ่มใหม่', 'เมนู', 'menu', 'start'].includes(text.toLowerCase())) {
    delete userState[userId];
    return sendQuickReplyCourier(replyToken);
  }

  if (state.startsWith('WAIT_TRACKING_')) {
    const carrier = state.replace('WAIT_TRACKING_', '');
    delete userState[userId];
    return processTracking(replyToken, carrier, text);
  }

  return sendQuickReplyCourier(replyToken);
}

async function handlePostback(event) {
  const userId     = event.source.userId;
  const replyToken = event.replyToken;
  const params     = Object.fromEntries(new URLSearchParams(event.postback.data));
  const carrier    = (params.carrier || 'EMS').toUpperCase();

  userState[userId] = 'WAIT_TRACKING_' + carrier;
  return askTrackingNumber(replyToken, carrier);
}

async function sendQuickReplyCourier(replyToken) {
  return replyToLine(replyToken, [{
    type: 'text',
    text: '🚚 สวัสดีค่ะ! ร้าน ซี.เค.แอร์คอนด์\nกรุณาเลือกบริษัทขนส่งของคุณค่ะ',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '📮 EMS',   data: 'carrier=EMS',   displayText: 'EMS (ไปรษณีย์ไทย)' } },
        { type: 'action', action: { type: 'postback', label: '⚡ Flash', data: 'carrier=FLASH', displayText: 'Flash Express' } },
      ],
    },
  }]);
}

async function askTrackingNumber(replyToken, carrier) {
  const label = carrier === 'EMS' ? '📮 EMS (ไปรษณีย์ไทย)' : '⚡ Flash Express';
  return replyToLine(replyToken, [{ type: 'text', text: `✅ เลือก ${label} แล้วค่ะ\n\nกรุณาพิมพ์เลขพัสดุของคุณค่ะ` }]);
}

async function processTracking(replyToken, carrier, trackingNumber) {
  let imageUrl;
  try {
    imageUrl = await generateTrackingImage(carrier, trackingNumber);
  } catch (err) {
    console.error('Image error:', err.message);
    const carrierName = carrier === 'EMS' ? 'EMS (ไปรษณีย์ไทย)' : 'Flash Express';
    return replyToLine(replyToken, [{
      type: 'text',
      text: `📦 เลขพัสดุ: ${trackingNumber}\n🚚 ขนส่ง: ${carrierName}\n\n🏪 ร้าน ซี.เค.แอร์คอนด์`,
    }]);
  }

  return replyToLine(replyToken, [
    { type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl },
    {
      type: 'text',
      text: 'พิมพ์ "เริ่มใหม่" เพื่อส่งเลขพัสดุชิ้นอื่นค่ะ 😊',
      quickReply: { items: [{ type: 'action', action: { type: 'message', label: '🔄 เริ่มใหม่', text: 'เริ่มใหม่' } }] },
    },
  ]);
}

async function replyToLine(replyToken, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN },
    body: JSON.stringify({ replyToken, messages }),
  });
  const text = await res.text();
  if (!res.ok) console.error('LINE reply error:', text);
  else console.log('LINE reply ok');
}
