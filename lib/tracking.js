// ============================================================
//  lib/tracking.js — TrackingMore API v4
//  สมัครฟรีที่ https://www.trackingmore.com (100 tracking/month)
// ============================================================

const TM_BASE = 'https://api.trackingmore.com/v4';

const TM_CARRIER = {
  EMS:   'thailand-post',
  FLASH: 'flash-express-th',
};

const CARRIER_NAME = {
  EMS:   'EMS (ไปรษณีย์ไทย)',
  FLASH: 'Flash Express',
};

// ──────────────────────────────────────────────
//  🔍 Main: Create → Get
// ──────────────────────────────────────────────
async function trackWithTrackingMore(trackingNumber, carrier) {
  const apiKey      = process.env.TM_API_KEY;
  const courierCode = TM_CARRIER[carrier] || 'thailand-post';

  // Step 1: Create (register)
  await createTracking(apiKey, trackingNumber, courierCode);

  // Step 2: Get info
  return getTracking(apiKey, trackingNumber, courierCode, carrier);
}

// ──────────────────────────────────────────────
//  📋 Step 1: POST /trackings/create
// ──────────────────────────────────────────────
async function createTracking(apiKey, trackingNumber, courierCode) {
  const res  = await fetch(`${TM_BASE}/trackings/create`, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'Tracking-Api-Key': apiKey,
    },
    body: JSON.stringify({ tracking_number: trackingNumber, courier_code: courierCode }),
  });

  const json = await res.json();
  console.log('TM create:', JSON.stringify(json));

  // 4003 = already exists → OK
  if (json.code !== 200 && json.code !== 201 && json.code !== 4003) {
    throw new Error('สร้าง tracking ไม่สำเร็จ: ' + (json.message || JSON.stringify(json)));
  }
}

// ──────────────────────────────────────────────
//  📡 Step 2: GET /trackings/{courier}/{number}
// ──────────────────────────────────────────────
async function getTracking(apiKey, trackingNumber, courierCode, carrier) {
  const url = `${TM_BASE}/trackings/${courierCode}/${encodeURIComponent(trackingNumber)}`;
  const res  = await fetch(url, {
    headers: { 'Tracking-Api-Key': apiKey },
  });

  const json = await res.json();
  console.log('TM get:', JSON.stringify(json));

  if (json.code !== 200) {
    throw new Error('ดึงข้อมูลไม่สำเร็จ: ' + (json.message || JSON.stringify(json)));
  }

  return parseResult(json.data, carrier);
}

// ──────────────────────────────────────────────
//  🗂️ Parse TrackingMore response
// ──────────────────────────────────────────────
function parseResult(data, carrier) {
  if (!data) {
    return {
      status:      'กำลังดึงข้อมูล กรุณารอสักครู่แล้วลองใหม่ค่ะ',
      location:    '-',
      datetime:    '-',
      carrierName: CARRIER_NAME[carrier] || carrier,
      tag:         'Pending',
      events:      [],
    };
  }

  const latest    = data.latest_event || {};
  const trackinfo = data.origin_info?.trackinfo || data.destination_info?.trackinfo || [];

  return {
    status:      translateTag(data.tag, latest.description),
    location:    latest.location || '-',
    datetime:    latest.time     || '-',
    carrierName: CARRIER_NAME[carrier] || carrier,
    tag:         data.tag || 'Pending',
    events:      trackinfo.slice(0, 5).map(ev => ({
      status:   ev.StatusDescription || ev.Details || '-',
      location: ev.Details || '-',
      datetime: ev.Date    || '-',
    })),
  };
}

// ──────────────────────────────────────────────
//  🏷️ Tag → ข้อความไทย
// ──────────────────────────────────────────────
function translateTag(tag, fallback) {
  const map = {
    Pending:            '⏳ รอการอัปเดตข้อมูล',
    InfoReceived:       '📋 บันทึกข้อมูลพัสดุแล้ว',
    InTransit:          '🚚 อยู่ระหว่างการขนส่ง',
    OutForDelivery:     '🛵 กำลังนำส่ง',
    AttemptFail:        '⚠️ จัดส่งไม่สำเร็จ',
    Delivered:          '✅ จัดส่งสำเร็จแล้ว',
    AvailableForPickup: '📦 พร้อมให้รับที่สาขา',
    Exception:          '❌ เกิดปัญหาระหว่างขนส่ง',
    Expired:            '🕐 หมดอายุการติดตาม',
  };
  return map[tag] || fallback || tag || 'ไม่พบข้อมูล';
}

module.exports = { trackWithTrackingMore };
