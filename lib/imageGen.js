// ============================================================
//  lib/imageGen.js — สร้าง JPG จาก HTML (เลขพัสดุเท่านั้น)
//  ใช้ htmlcsstoimage.com (HCTI)
// ============================================================

async function generateTrackingImage(carrier, trackingNumber) {
  const html = buildHTML(carrier, trackingNumber);

  const auth = Buffer.from(
    `${process.env.HCTI_USER_ID}:${process.env.HCTI_API_KEY}`
  ).toString('base64');

  const res = await fetch('https://hcti.io/v1/image', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:  'Basic ' + auth,
    },
    body: JSON.stringify({
      html,
      google_fonts:        'Sarabun:400,600,700',
      viewport_width:      520,
      viewport_height:     280,
      device_scale_factor: 2,
    }),
  });

  const json = await res.json();
  if (!json.url) throw new Error('HCTI ไม่ได้ URL: ' + JSON.stringify(json));
  return json.url;
}

function buildHTML(carrier, trackingNumber) {
  const isEMS        = carrier === 'EMS';
  const courierName  = isEMS ? 'EMS (ไปรษณีย์ไทย)' : 'Flash Express';
  const courierIcon  = isEMS ? '📮' : '⚡';
  // EMS = แดง, Flash = เหลือง
  const headerBg     = isEMS
    ? 'linear-gradient(135deg,#B71C1C 0%,#C62828 60%,#E53935 100%)'
    : 'linear-gradient(135deg,#F57F17 0%,#F9A825 60%,#FDD835 100%)';
  const badgeBg      = isEMS ? 'rgba(0,0,0,.20)' : 'rgba(0,0,0,.15)';
  const textColor    = isEMS ? '#fff' : '#3E2700';
  const subColor     = isEMS ? 'rgba(255,255,255,.70)' : 'rgba(62,39,0,.60)';
  const numColor     = isEMS ? '#B71C1C' : '#E65100';

  const now = new Date().toLocaleString('th-TH', {
    timeZone:  'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Sarabun',sans-serif;width:520px;background:#fff}

  .wrap{
    background:#fff;
    border-radius:16px;
    overflow:hidden;
    box-shadow:0 4px 20px rgba(0,0,0,.12);
  }

  /* Header */
  .header{
    background:${headerBg};
    padding:20px 24px 16px;
    display:flex;
    align-items:center;
    justify-content:space-between;
  }
  .shop-name{font-size:18px;font-weight:700;color:${textColor}}
  .shop-sub{font-size:11px;color:${subColor};margin-top:2px}
  .courier-badge{
    background:${badgeBg};
    color:${textColor};
    padding:5px 14px;
    border-radius:20px;
    font-size:13px;
    font-weight:700;
  }

  /* Tracking block */
  .body{padding:20px 24px 16px}
  .label{font-size:11px;color:#999;letter-spacing:.8px;text-transform:uppercase;margin-bottom:6px}
  .tracking-num{
    font-size:28px;
    font-weight:700;
    color:${numColor};
    letter-spacing:3px;
    word-break:break-all;
    line-height:1.2;
  }

  /* Footer */
  .footer{
    background:#F5F7FA;
    padding:10px 24px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    border-top:1px solid #E8EAF0;
  }
  .footer-note{font-size:12px;color:#666}
  .footer-time{font-size:11px;color:#AAA}
</style>
</head>
<body>
<div class="wrap">

  <div class="header">
    <div>
      <div class="shop-name">🏪 ซี.เค.แอร์คอนด์</div>
      <div class="shop-sub">WWW.CKAIRCOND.COM</div>
    </div>
    <div class="courier-badge">${courierIcon} ${courierName}</div>
  </div>

  <div class="body">
    <div class="label">หมายเลขพัสดุ</div>
    <div class="tracking-num">${esc(trackingNumber.toUpperCase())}</div>
  </div>

  <div class="footer">
    <div class="footer-note">📦 ขอบคุณที่ใช้บริการค่ะ 🙏</div>
    <div class="footer-time">${now}</div>
  </div>

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
