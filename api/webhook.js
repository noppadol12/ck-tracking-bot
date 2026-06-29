// ============================================================
//  api/webhook.js — LINE Webhook Entry Point
//  ไลน์บอทแจ้งเลขพัสดุ — ร้าน ซี.เค.แอร์คอนด์
// ============================================================

const { trackWithTrackingMore } = require('../lib/tracking');
const { generateTrackingImage }  = require('../lib/imageGen');

// ── In-memory state (Vercel serverless ใช้ได้สำหรับ low-traffic)
// ถ้าต้องการ persistent ให้เปลี่ยนเป็น Redis หรือ KV Store
const userState = {};

// ──────────────────────────────────────────────
//  🚀 Vercel Serverless Function Entry Point
// ──────────────────────────────────────────────
module.exports = async (req, res) => {
  // LINE Verify ส่ง GET มาตรวจสอบ
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ตอบ 200 ทันที ก่อน process (LINE timeout 30s)
  res.status(200).json({ status: 'ok' });

  try {
    const events = req.body?.events || [];
    for (const event of events) {
      if (event.type === 'message' && event.message?.type === 'text') {
        await handleTextMessage(event);
      } else if (event.type === 'postback') {
        await handlePostback(event);
      }
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
};

// ──────────────────────────────────────────────
//  📨 Handle Text Message
// ──────────────────────────────────────────────
async function handleTextMessage(event) {
  const userId     = event.source.userId;
  const replyToken = event.replyToken;
  const text       = (event.message.text || '').trim();
  const state      = userState[userId] || 'IDLE';

  // Reset
  if (['เริ่มใหม่', 'เมนู', 'menu', 'start'].includes(text.toLowerCase())) {
    delete userState[userId];
    return sendQuickReplyCourier(replyToken);
  }

  // รอเลขพัสดุ
  if (state.startsWith('WAIT_TRACKING_')) {
    const carrier = state.replace('WAIT_TRACKING_', '');
    delete userState[userId];
    return processTracking(replyToken, userId, carrier, text);
  }

  // Default
  return sendQuickReplyCourier(replyToken);
}

// ──────────────────────────────────────────────
//  🔘 Handle Postback (Quick Reply button)
// ──────────────────────────────────────────────
async function handlePostback(event) {
  const userId     = event.source.userId;
  const replyToken = event.replyToken;
  const params     = Object.fromEntries(new URLSearchParams(event.postback.data));
  const carrier    = (params.carrier || 'EMS').toUpperCase();

  userState[userId] = 'WAIT_TRACKING_' + carrier;
  return askTrackingNumber(replyToken, carrier);
}

// ──────────────────────────────────────────────
//  💬 Quick Reply — เลือกขนส่ง
// ──────────────────────────────────────────────
async function sendQuickReplyCourier(replyToken) {
  return replyToLine(replyToken, [{
    type: 'text',
    text: '🚚 สวัสดีค่ะ! ร้าน ซี.เค.แอร์คอนด์\nกรุณาเลือกบริษัทขนส่งของคุณค่ะ',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type:        'postback',
            label:       '📮 EMS',
            data:        'carrier=EMS',
            displayText: 'EMS (ไปรษณีย์ไทย)',
          },
        },
        {
          type: 'action',
          action: {
            type:        'postback',
            label:       '⚡ Flash',
            data:        'carrier=FLASH',
            displayText: 'Flash Express',
          },
        },
      ],
    },
  }]);
}

// ──────────────────────────────────────────────
//  💬 ถามเลขพัสดุ
// ──────────────────────────────────────────────
async function askTrackingNumber(replyToken, carrier) {
  const label = carrier === 'EMS' ? '📮 EMS (ไปรษณีย์ไทย)' : '⚡ Flash Express';
  return replyToLine(replyToken, [{
    type: 'text',
    text: `✅ เลือก ${label} แล้วค่ะ\n\nกรุณาพิมพ์เลขพัสดุของคุณค่ะ`,
  }]);
}

// ──────────────────────────────────────────────
//  🔍 ตรวจสอบพัสดุ → สร้างรูป → ส่ง
// ──────────────────────────────────────────────
async function processTracking(replyToken, userId, carrier, trackingNumber) {
  // แจ้งว่ากำลังตรวจสอบ
  await replyToLine(replyToken, [{
    type: 'text',
    text: '🔍 กำลังตรวจสอบพัสดุ กรุณารอสักครู่ค่ะ...',
  }]);

  let data;
  try {
    data = await trackWithTrackingMore(trackingNumber, carrier);
  } catch (err) {
    console.error('Tracking error:', err.message);
    return pushToLine(userId, [{
      type: 'text',
      text: `❌ ไม่สามารถตรวจสอบพัสดุได้ค่ะ\n(${err.message})\n\nกรุณาลองใหม่ หรือพิมพ์ "เริ่มใหม่"`,
    }]);
  }

  let imageUrl;
  try {
    imageUrl = await generateTrackingImage(carrier, trackingNumber, data);
  } catch (err) {
    console.error('Image error:', err.message);
    // Fallback เป็น text message
    return pushToLine(userId, [buildTextFallback(carrier, trackingNumber, data)]);
  }

  return pushToLine(userId, [
    {
      type: 'image',
      originalContentUrl: imageUrl,
      previewImageUrl:    imageUrl,
    },
    {
      type: 'text',
      text: 'พิมพ์ "เริ่มใหม่" เพื่อตรวจสอบพัสดุชิ้นอื่นค่ะ 😊',
      quickReply: {
        items: [{
          type: 'action',
          action: { type: 'message', label: '🔄 เริ่มใหม่', text: 'เริ่มใหม่' },
        }],
      },
    },
  ]);
}

// ──────────────────────────────────────────────
//  📡 LINE API — Reply & Push
// ──────────────────────────────────────────────
async function replyToLine(replyToken, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) console.error('LINE reply error:', await res.text());
}

async function pushToLine(userId, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      Authorization:   'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN,
    },
    body: JSON.stringify({ to: userId, messages }),
  });
  if (!res.ok) console.error('LINE push error:', await res.text());
}

// ──────────────────────────────────────────────
//  🛠️ Text Fallback (กรณีสร้างรูปไม่ได้)
// ──────────────────────────────────────────────
function buildTextFallback(carrier, trackingNumber, data) {
  return {
    type: 'text',
    text: [
      `📦 ผลการตรวจสอบพัสดุ`,
      `──────────────────`,
      `🏷️ เลขพัสดุ: ${trackingNumber}`,
      `🚚 ขนส่ง: ${data.carrierName}`,
      `📋 สถานะ: ${data.status}`,
      data.location !== '-' ? `📍 สถานที่: ${data.location}` : null,
      data.datetime !== '-' ? `⏰ เวลา: ${data.datetime}`   : null,
      `──────────────────`,
      `🏪 ร้าน ซี.เค.แอร์คอนด์`,
    ].filter(Boolean).join('\n'),
  };
}
