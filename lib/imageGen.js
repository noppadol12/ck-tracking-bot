// ============================================================
//  lib/imageGen.js — สร้าง JPG จาก HTML
//  ใช้ htmlcsstoimage.com (HCTI)
//  สมัครฟรีที่ https://htmlcsstoimage.com (50 images/month)
// ============================================================

// ──────────────────────────────────────────────
//  🖼️ สร้าง JPG และ return URL
// ──────────────────────────────────────────────
async function generateTrackingImage(carrier, trackingNumber, data) {
  const html = buildHTML(carrier, trackingNumber, data);

  const auth = Buffer.from(
    `${process.env.HCTI_USER_ID}:${process.env.HCTI_API_KEY}`
  ).toString('base64');

  const res  = await fetch('https://hcti.io/v1/image', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  'Basic ' + auth,
    },
    body: JSON.stringify({
      html,
      google_fonts:        'Sarabun:400,600,700',
      viewport_width:      600,
      viewport_height:     800,
      device_scale_factor: 2,
    }),
  });

  const json = await res.json();
  if (!json.url) throw new Error('HCTI ไม่ได้ URL: ' + JSON.stringify(json));
  return json.url;
}

// ──────────────────────────────────────────────
//  🎨 HTML Template — ดีไซน์ ซี.เค.แอร์คอนด์
// ──────────────────────────────────────────────
function buildHTML(carrier, trackingNumber, data) {
  const isEMS       = carrier === 'EMS';
  const courierName = data.carrierName || (isEMS ? 'EMS (ไปรษณีย์ไทย)' : 'Flash Express');
  const courierIcon = isEMS ? '📮' : '⚡';
  const accent      = isEMS ? '#D32F2F' : '#F57C00';
  const isDelivered = (data.tag || '').toLowerCase().includes('delivered');
  const statusColor = isDelivered ? '#2E7D32' : '#1565C0';
  const statusBg    = isDelivered ? '#E8F5E9'  : '#E3F2FD';

  const eventsHTML = (data.events || []).length > 0
    ? data.events.map((ev, i) => `
        <div class="event ${i === 0 ? 'first' : ''}">
          <div class="dot ${i === 0 ? 'dot-active' : ''}"></div>
          ${i < data.events.length - 1 ? '<div class="line"></div>' : ''}
          <div class="ev-body">
            <div class="ev-status">${esc(ev.status)}</div>
            <div class="ev-meta">
              ${ev.location !== '-' ? `<span>📍 ${esc(ev.location)}</span>` : ''}
              ${ev.datetime !== '-' ? `<span>🕐 ${esc(ev.datetime)}</span>` : ''}
            </div>
          </div>
        </div>`).join('')
    : '<div class="no-ev">ยังไม่มีข้อมูลการเคลื่อนไหว</div>';

  const now = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Sarabun',sans-serif;background:#F0F2F5;width:600px}

  .header{
    background:linear-gradient(135deg,#0D1B6E,#1A3A8F,#2756C5);
    padding:28px 28px 22px;position:relative;overflow:hidden
  }
  .header::before{content:'';position:absolute;top:-60px;right:-40px;
    width:200px;height:200px;background:rgba(255,255,255,.06);border-radius:50%}
  .header::after{content:'';position:absolute;bottom:-80px;left:30%;
    width:160px;height:160px;background:rgba(255,255,255,.04);border-radius:50%}
  .shop{font-size:24px;font-weight:700;color:#fff;position:relative}
  .shop-en{font-size:12px;color:rgba(255,255,255,.65);margin-top:2px;position:relative}
  .header-label{font-size:11px;color:rgba(255,255,255,.7);
    text-transform:uppercase;letter-spacing:1.2px;margin-top:16px;position:relative}
  .badge{display:inline-flex;align-items:center;gap:6px;
    background:${accent};color:#fff;padding:5px 14px;
    border-radius:20px;font-size:13px;font-weight:700;margin-top:6px;position:relative}

  .body{padding:18px 20px}

  .card{background:#fff;border-radius:14px;padding:18px 20px;
    box-shadow:0 2px 10px rgba(0,0,0,.07);margin-bottom:14px}

  .tracking-card{border-left:5px solid ${accent}}
  .card-label{font-size:11px;color:#999;text-transform:uppercase;
    letter-spacing:.8px;margin-bottom:6px}
  .tracking-num{font-size:24px;font-weight:700;color:#0D1B6E;
    letter-spacing:2.5px;word-break:break-all}

  .status-card{background:${statusBg};border:1.5px solid ${statusColor}33}
  .status-text{font-size:19px;font-weight:700;color:${statusColor}}
  .status-meta{display:flex;gap:16px;margin-top:8px;flex-wrap:wrap}
  .status-meta span{font-size:13px;color:#555}

  .timeline-card{}
  .tl-title{font-size:13px;font-weight:700;color:#333;
    padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid #F0F0F0}
  .event{display:flex;gap:12px;position:relative;padding-bottom:14px}
  .event:last-child{padding-bottom:0}
  .dot{width:13px;height:13px;border-radius:50%;background:#CCC;
    border:2px solid #fff;box-shadow:0 0 0 2px #CCC;
    flex-shrink:0;margin-top:5px;z-index:1}
  .dot-active{background:${accent};box-shadow:0 0 0 2px ${accent}}
  .line{position:absolute;left:6px;top:18px;bottom:0;width:2px;background:#EEE}
  .ev-body{flex:1}
  .ev-status{font-size:14px;font-weight:600;color:#333}
  .first .ev-status{color:${accent}}
  .ev-meta{display:flex;gap:12px;margin-top:3px;flex-wrap:wrap}
  .ev-meta span{font-size:12px;color:#999}
  .no-ev{font-size:13px;color:#BBB;text-align:center;padding:10px 0}

  .footer{background:#E8EAF0;padding:12px 24px;
    display:flex;justify-content:space-between;align-items:center}
  .footer-shop{font-size:12px;font-weight:600;color:#444}
  .footer-time{font-size:11px;color:#888}
</style>
</head>
<body>

<div class="header">
  <div class="shop">🏪 ซี.เค.แอร์คอนด์</div>
  <div class="shop-en">CK Air Conditioner</div>
  <div class="header-label">ติดตามพัสดุ / Parcel Tracking</div>
  <div class="badge">${courierIcon} ${esc(courierName)}</div>
</div>

<div class="body">

  <div class="card tracking-card">
    <div class="card-label">หมายเลขพัสดุ</div>
    <div class="tracking-num">${esc(trackingNumber.toUpperCase())}</div>
  </div>

  <div class="card status-card">
    <div class="card-label">สถานะล่าสุด</div>
    <div class="status-text">${esc(data.status)}</div>
    <div class="status-meta">
      ${data.location !== '-' ? `<span>📍 ${esc(data.location)}</span>` : ''}
      ${data.datetime !== '-' ? `<span>⏰ ${esc(data.datetime)}</span>` : ''}
    </div>
  </div>

  ${(data.events || []).length > 0 ? `
  <div class="card timeline-card">
    <div class="tl-title">📋 ประวัติการเคลื่อนไหว</div>
    ${eventsHTML}
  </div>` : ''}

</div>

<div class="footer">
  <div class="footer-shop">🏪 ร้าน ซี.เค.แอร์คอนด์ | ขอบคุณที่ไว้วางใจค่ะ 🙏</div>
  <div class="footer-time">${now}</div>
</div>

</body>
</html>`;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = { generateTrackingImage };
