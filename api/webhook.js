// ============================================================
//  api/webhook.js — LINE Webhook Entry Point
//  ไลน์บอทแจ้งเลขพัสดุ — ร้าน ซี.เค.แอร์คอนด์
// ============================================================

const { parseBillPDF, formatParcels } = require('../lib/pdfParser');

// In-memory state
const userState = {};

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ status: 'ok' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const events = req.body?.events || [];
    await Promise.all(events.map(event => {
      if (event.type === 'message') {
        if (event.message?.type === 'text') return handleTextMessage(event);
        if (event.message?.type === 'file') return handleFileMessage(event);
      } else if (event.type === 'postback') {
        return handlePostback(event);
      }
    }));
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
  return res.status(200).json({ status: 'ok' });
};

// ──────────────────────────────────────────────
//  📎 Handle File Message (PDF บิลค่าส่ง)
// ──────────────────────────────────────────────
async function handleFileMessage(event) {
  const replyToken = event.replyToken;
  const messageId  = event.message.id;
  const fileName   = event.message.fileName || '';

  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return replyToLine(replyToken, [{
      type: 'text',
      text: '❌ รองรับเฉพาะไฟล์ PDF ค่ะ',
    }]);
  }

  await replyToLine(replyToken, [{
    type: 'text',
    text: '⏳ กำลังอ่านข้อมูลพัสดุจากบิล กรุณารอสักครู่ค่ะ...',
  }]);

  try {
    const buffer   = await downloadLineFile(messageId);
    const result   = await parseBillPDF(buffer);
    const messages = formatParcels(result);

    for (const text of messages) {
      await pushToLine(event.source.userId, [{ type: 'text', text }]);
    }
  } catch (err) {
    console.error('PDF error:', err.message);
    await pushToLine(event.source.userId, [{
      type: 'text',
      text: `❌ อ่านไฟล์ไม่ได้ค่ะ (${err.message})`,
    }]);
  }
}

// ──────────────────────────────────────────────
//  ⬇️ ดาวน์โหลดไฟล์จาก LINE Content API
// ──────────────────────────────────────────────
async function downloadLineFile(messageId) {
  const res = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    { headers: { Authorization: 'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN } }
  );
  if (!res.ok) throw new Error(`ดาวน์โหลดไฟล์ไม่ได้: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ──────────────────────────────────────────────
//  📨 Handle Text Message
// ──────────────────────────────────────────────
async function handleTextMessage(event) {
  const userId     = event.source.userId;
  const replyToken = event.replyToken;
  const text       = (event.message.text || '').trim();
  const state      = userState[userId] || 'IDLE';

  if (['เริ่มใหม่', 'เมนู', 'menu', 'start'].includes(text.toLowerCase())) {
    delete userState[userId];
    return sendWelcome(replyToken);
  }

  if (state.startsWith('WAIT_TRACKING_')) {
    const carrier = state.replace('WAIT_TRACKING_', '');
    delete userState[userId];
    return replyTrackingNumber(replyToken, carrier, text);
  }

  return sendWelcome(replyToken);
}

// ──────────────────────────────────────────────
//  🔘 Handle Postback
// ──────────────────────────────────────────────
async function handlePostback(event) {
  const userId     = event.source.userId;
  const replyToken = event.replyToken;
  const params     = Object.fromEntries(new URLSearchParams(event.postback.data));
  const carrier    = (params.carrier || 'EMS').toUpperCase();

  userState[userId] = 'WAIT_TRACKING_' + carrier;
  return replyToLine(replyToken, [{
    type: 'text',
    text: `✅ เลือก ${carrier === 'EMS' ? '📮 EMS (ไปรษณีย์ไทย)' : '⚡ Flash Express'} แล้วค่ะ\n\nกรุณาพิมพ์เลขพัสดุค่ะ`,
  }]);
}

// ──────────────────────────────────────────────
//  💬 Welcome + Quick Reply
// ──────────────────────────────────────────────
async function sendWelcome(replyToken) {
  return replyToLine(replyToken, [{
    type: 'text',
    text: '🚚 สวัสดีค่ะ! ร้าน ซี.เค.แอร์คอนด์\n\n📎 ส่งไฟล์ PDF บิลค่าส่ง → แสดงเลขพัสดุทั้งหมด\n📦 หรือเลือกขนส่งด้านล่างเพื่อพิมพ์เลขเดี่ยว',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '📮 EMS',   data: 'carrier=EMS',   displayText: 'EMS' } },
        { type: 'action', action: { type: 'postback', label: '⚡ Flash', data: 'carrier=FLASH', displayText: 'Flash Express' } },
      ],
    },
  }]);
}

// ──────────────────────────────────────────────
//  📦 ตอบเลขพัสดุเป็นข้อความ (ไม่มีรูป)
// ──────────────────────────────────────────────
async function replyTrackingNumber(replyToken, carrier, trackingNumber) {
  const carrierName = carrier === 'EMS' ? 'EMS (ไปรษณีย์ไทย)' : 'Flash Express';
  return replyToLine(replyToken, [
    {
      type: 'text',
      text: [
        `📦 เลขพัสดุ`,
        `──────────────────────`,
        `🚚 ${carrierName}`,
        `──────────────────────`,
        `🏪 ร้าน ซี.เค.แอร์คอนด์`,
      ].join('\n'),
    },
    {
      type: 'text',
      text: trackingNumber.toUpperCase(),
      quickReply: {
        items: [{ type: 'action', action: { type: 'message', label: '🔄 เริ่มใหม่', text: 'เริ่มใหม่' } }],
      },
    },
  ]);
}

// ──────────────────────────────────────────────
//  📡 LINE Reply API
// ──────────────────────────────────────────────
async function replyToLine(replyToken, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!res.ok) console.error('LINE reply error:', await res.text());
}

// ──────────────────────────────────────────────
//  📡 LINE Push API
// ──────────────────────────────────────────────
async function pushToLine(userId, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN },
    body: JSON.stringify({ to: userId, messages }),
  });
  if (!res.ok) console.error('LINE push error:', await res.text());
}
