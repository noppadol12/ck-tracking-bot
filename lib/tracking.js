// ============================================================
//  lib/tracking.js
//  EMS  → TrackingMore API (thailand-post)
//  Flash → Flash Express API โดยตรง
// ============================================================

const TM_BASE = 'https://api.trackingmore.com/v4';

// ──────────────────────────────────────────────
//  🔍 Main dispatcher
// ──────────────────────────────────────────────
async function trackWithTrackingMore(trackingNumber, carrier) {
  if (carrier === 'FLASH') {
    return trackFlashDirect(trackingNumber);
  }
  return trackEMS(trackingNumber);
}

// ══════════════════════════════════════════════
//  📮 EMS — TrackingMore
//  Response format: { meta: { code }, data: { ... } }
// ══════════════════════════════════════════════
async function trackEMS(trackingNumber) {
  const apiKey      = process.env.TM_API_KEY;
  const courierCode = 'thailand-post';
  const headers     = { 'Content-Type': 'application/json', 'Tracking-Api-Key': apiKey };

  // Step 1: Create tracking
  const createRes  = await fetch(`${TM_BASE}/trackings/create`, {
    method: 'POST', headers,
    body: JSON.stringify({ tracking_number: trackingNumber, courier_code: courierCode }),
  });
  const createJson = await createRes.json();
  console.log('TM create:', JSON.stringify(createJson).slice(0, 300));

  // TrackingMore มี 2 format: สำเร็จใช้ meta.code, error ใช้ code ตรงๆ
  const createCode = createJson?.meta?.code || createJson?.code;
  // 200/201 = created, 4003/4101 = already exists → ทั้งหมด OK
  const okCodes = [200, 201, 4003, 4101];
  if (!okCodes.includes(createCode)) {
    throw new Error('สร้าง EMS tracking ไม่สำเร็จ: ' + JSON.stringify(createJson?.meta || createJson));
  }

  // ใช้ create data ก็ต่อเมื่อมีข้อมูลจริง (มี trackinfo หรือ delivery_status)
  // กรณี 4101 = already exists จะคืนแค่ {id, tracking_number, courier_code} → ต้องไป GET แทน
  if (createJson?.data?.trackinfo || createJson?.data?.delivery_status || createJson?.data?.tag) {
    return parseTMResult(createJson.data);
  }

  // Step 2: Get tracking info
  const getRes  = await fetch(`${TM_BASE}/trackings/${courierCode}/${encodeURIComponent(trackingNumber)}`, {
    headers: { 'Tracking-Api-Key': apiKey },
  });
  const getJson = await getRes.json();
  console.log('TM get:', JSON.stringify(getJson).slice(0, 300));

  const getCode = getJson?.meta?.code || getJson?.code;
  if (getCode !== 200) {
    throw new Error('ดึงข้อมูล EMS ไม่สำเร็จ: ' + JSON.stringify(getJson?.meta || getJson));
  }

  return parseTMResult(getJson.data);
}

// ──────────────────────────────────────────────
//  🗂️ Parse TrackingMore data object
//  data: {
//    delivery_status, latest_event (string),
//    trackinfo: [{ checkpoint_date, tracking_detail, location }]
//  }
// ──────────────────────────────────────────────
function parseTMResult(data) {
  if (!data) {
    return { status: 'กำลังดึงข้อมูล กรุณารอสักครู่แล้วลองใหม่ค่ะ', location: '-', datetime: '-', carrierName: 'EMS (ไปรษณีย์ไทย)', tag: 'Pending', events: [] };
  }

  console.log('parseTMResult keys:', Object.keys(data));
  console.log('parseTMResult delivery_status:', data.delivery_status, 'tag:', data.tag, 'latest_event:', data.latest_event);

  // trackinfo — อาจอยู่ที่ data.trackinfo หรือ data.origin_info.trackinfo
  const trackinfo = data.trackinfo || data.origin_info?.trackinfo || [];
  const latest    = trackinfo[0] || {};

  // delivery_status (v4 new) หรือ tag (v4 old / some endpoints)
  const deliveryStatus = data.delivery_status || data.tag || '';
  // latest_event อาจเป็น string หรือ object
  const latestEventText = typeof data.latest_event === 'string'
    ? data.latest_event
    : (data.latest_event?.description || data.latest_event_detail || '');

  const statusTH = translateDeliveryStatus(deliveryStatus, latestEventText);

  return {
    status:      statusTH,
    location:    latest.location || '-',
    datetime:    latest.checkpoint_date || latest.Date || '-',
    carrierName: 'EMS (ไปรษณีย์ไทย)',
    tag:         deliveryStatus || 'Pending',
    events:      trackinfo.slice(0, 5).map(ev => ({
      status:   ev.tracking_detail || ev.checkpoint_delivery_status || ev.StatusDescription || '-',
      location: ev.location || ev.location_translate || '-',
      datetime: ev.checkpoint_date || ev.Date || '-',
    })),
  };
}

function translateDeliveryStatus(status, latestEvent) {
  const map = {
    pending:         '⏳ รอการอัปเดตข้อมูล',
    inforeceived:    '📋 บันทึกข้อมูลพัสดุแล้ว',
    intransit:       '🚚 อยู่ระหว่างการขนส่ง',
    pickup:          '🛵 กำลังนำส่ง',
    attemptfail:     '⚠️ จัดส่งไม่สำเร็จ',
    delivered:       '✅ จัดส่งสำเร็จแล้ว',
    availableforpickup: '📦 พร้อมให้รับที่สาขา',
    exception:       '❌ เกิดปัญหาระหว่างขนส่ง',
    expired:         '🕐 หมดอายุการติดตาม',
    notfound:        '🔍 ไม่พบข้อมูลพัสดุ',
  };
  const key = (status || '').toLowerCase().replace(/_/g, '');
  return map[key] || latestEvent || status || 'ไม่พบข้อมูล';
}

// ══════════════════════════════════════════════
//  ⚡ Flash Express — Direct API
//  GET https://trackingsvc.flashexpress.com/query/cargo?se=TRACKING_NUMBER
// ══════════════════════════════════════════════
async function trackFlashDirect(trackingNumber) {
  const url = `https://trackingsvc.flashexpress.com/query/cargo?se=${encodeURIComponent(trackingNumber)}`;

  const res = await fetch(url, {
    headers: {
      'Accept':     'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; CKBot/1.0)',
    },
  });

  if (!res.ok) {
    throw new Error(`Flash API ตอบ HTTP ${res.status}`);
  }

  const json = await res.json();
  console.log('Flash:', JSON.stringify(json).slice(0, 500));

  return parseFlashResult(json);
}

function parseFlashResult(json) {
  const cargo  = json?.data?.cargo || json?.data || json || {};
  const logs   = cargo.logs || cargo.history || cargo.traces || [];
  const latest = logs[0] || {};

  return {
    status:      cargo.statusName || cargo.status_description || cargo.description || 'ระหว่างการขนส่ง',
    location:    latest.station   || latest.location || latest.detail || '-',
    datetime:    latest.ctime     || latest.time     || latest.datetime || '-',
    carrierName: 'Flash Express',
    tag:         'InTransit',
    events:      logs.slice(0, 5).map(ev => ({
      status:   ev.statusName || ev.detail || ev.description || '-',
      location: ev.station    || ev.location || '-',
      datetime: ev.ctime      || ev.time     || ev.datetime  || '-',
    })),
  };
}

module.exports = { trackWithTrackingMore };
