// ============================================================
//  api/webhook.js — LINE Webhook Entry Point
//  ไลน์บอทแจ้งเลขพัสดุ — ร้าน ซี.เค.แอร์คอนด์
// ============================================================

const { generateTrackingImage } = require('../lib/imageGen');
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

  // รองรับเฉพาะ PDF
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return replyToLine(replyToken, [{
      type: 'text',
      text: '❌ รองรับเฉพาะไฟล์ PDF ค่ะ\nกรุณาส่งบิลค่าส่ง (.pdf) เข้ามาค่ะ',
    }]);
  }

  // แจ้งว่ากำลังประมวลผล
  await replyToLine(replyToken, [{
    type: 'text',
    text: '⏳ กำลังอ่านข้อมูลพัสดุจากบิล กรุณารอสักครู่ค่ะ...',
  }]);

  try {
    // ดาวน์โหลดไฟล์จาก LINE
    const buffer = await downloadLineFile(messageId);

    // Parse PDF → ได้ array ของข้อความแยกตามผู้รับ
    const result   = await parseBillPDF(buffer);
    const messages = formatParcels(result);  // คืน string[]

    if (messages.length === 0 || (messages.length === 1 && messages[0].startsWith('❌'))) {
      await pushToLine(event.source.userId, [{ type: 'text', text: messages[0] }]);
      return;
    }

    // Push ทีละรายการ แยกข้อความแต่ละผู้รับ
    for (const text of messages) {
      await pushToLine(event.source.userId, [{ type: 'text', text }]);
    }
  } catch (err) {
    console.error('PDF error:', err.message);
    await pushToLine(event.source.userId, [{
      type: 'text',
      text: `❌ อ่านไฟล์ไม่ได้ค่ะ (${err.message})\nกรุณาลองส่งไฟล์ใหม่ค่ะ`,
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
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
    return sendQuickReplyCourier(replyToken);
  }

  if (state.startsWith('WAIT_TRACKING_')) {
    const carrier = state.replace('WAIT_TRACKING_', '');
    delete userState[userId];
    return processTracking(replyToken, carrier, text);
  }

  return sendQuickReplyCourier(replyToken);
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
  return askTrackingNumber(replyToken, carrier);
}

// ──────────────────────────────────────────────
//  💬 Quick Reply — เลือกขนส่ง
// ──────────────────────────────────────────────
async function sendQuickReplyCourier(replyToken) {
  return replyToLine(replyToken, [{
    type: 'text',
    text: '🚚 สวัสดีค่ะ! ร้าน ซี.เค.แอร์คอนด์\n\nส่งอะไรมาได้เลยค่ะ:\n📎 ส่งไฟล์ PDF บิลค่าส่ง → แสดงเลขพัสดุทั้งหมด\n📦 หรือเลือกขนส่งด้านล่างเพื่อแจ้งเลขเดี่ยว',
    quickReply: {
      items: [
        { type: 'action', action: { type: 'postback', label: '📮 EMS',   data: 'carrier=EMS',   displayText: 'EMS (ไปรษณีย์ไทย)' } },
        { type: 'action', action: { type: 'postback', label: '⚡ Flash', data: 'carrier=FLASH', displayText: 'Flash Express' } },
      ],
    },
  }]);
}

// ──────────────────────────────────────────────
//  💬 ถามเลขพัสดุ
// ──────────────────────────────────────────────
async function askTrackingNumber(replyToken, carrier) {
  const label = carrier === 'EMS' ? '📮 EMS (ไปรษณีย์ไทย)' : '⚡ Flash Express';
  return replyToLine(replyToken, [{ type: 'text', text: `✅ เลือก ${label} แล้วค่ะ\n\nกรุณาพิมพ์เลขพัสดุของคุณค่ะ` }]);
}

// ──────────────────────────────────────────────
//  🔍 สร้างรูปภาพเลขพัสดุ → ส่งลูกค้า
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
//  📡 LINE Reply API
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
//  📡 LINE Push API (ใช้หลัง reply token หมดอายุ)
// ──────────────────────────────────────────────
async function pushToLine(userId, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.LINE_CHANNEL_ACCESS_TOKEN },
    body: JSON.stringify({ to: userId, messages }),
  });
  const text = await res.text();
  if (!res.ok) console.error('LINE push error:', text);
  else console.log('LINE push ok');
}
