// ============================================================
//  lib/tracking.js
//  EMS  → TrackingMore API (thailand-post)
//  Flash → Flash Express API โดยตรง (trackingsvc.flashexpress.com)
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
//  📮 EMS — TrackingMore (thailand-post)
// ══════════════════════════════════════════════
async function trackEMS(trackingNumber) {
  const apiKey      = process.env.TM_API_KEY;
  const courierCode = 'thailand-post';

  // Create
  const createRes = await fetch(`${TM_BASE}/trackings/create`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Tracking-Api-Key': apiKey },
    body:    JSON.stringify({ tracking_number: trackingNumber, courier_code: courierCode }),
  });
  const createJson = await createRes.json();
  console.log('TM create:', JSON.stringify(createJson));
  if (createJson.code !== 200 && createJson.code !== 201 && createJson.code !== 4003) {
    throw new Error('สร้าง EMS tracking ไม่สำเร็จ: ' + (createJson.message || JSON.stringify(createJson)));
  }

  // Get
  const getRes  = await fetch(`${TM_BASE}/trackings/${courierCode}/${encodeURIComponent(trackingNumber)}`, {
    headers: { 'Tracking-Api-Key': apiKey },
  });
  const getJson = await getRes.json();
  console.log('TM get:', JSON.stringify(getJson));
  if (getJson.code !== 200) {
    throw new Error('ดึงข้อมูล EMS ไม่สำเร็จ: ' + (getJson.message || JSON.stringify(getJson)));
  }

  return parseTMResult(getJson.data, 'EMS');
}

function parseTMResult(data, carrier) {
  if (!data) return pendingResult(carrier);
  const latest    = data.latest_event || {};
  const trackinfo = data.origin_info?.trackinfo || data.destination_info?.trackinfo || [];
  return {
    status:      translateTag(data.tag, latest.description),
    location:    latest.location || '-',
    datetime:    latest.time     || '-',
    carrierName: 'EMS (ไปรษณีย์ไทย)',
    tag:         data.tag || 'Pending',
    events:      trackinfo.slice(0, 5).map(ev => ({
      status:   ev.StatusDescription || ev.Details || '-',
      location: ev.Details  || '-',
      datetime: ev.Date     || '-',
    })),
  };
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
    throw new Error(`Flash API ตอบ ${res.status}`);
  }

  const json = await res.json();
  console.log('Flash direct:', JSON.stringify(json).slice(0, 500));

  return parseFlashResult(json, trackingNumber);
}

function parseFlashResult(json, trackingNumber) {
  // Flash response shape (อาจแตกต่างตาม version):
  // { data: { cargo: { status, statusName, logs: [{detail, statusName, ctime}] } } }
  // หรือ { status, data: { status, description, history: [...] } }

  const cargo   = json?.data?.cargo || json?.data || json || {};
  const logs    = cargo.logs || cargo.history || cargo.traces || [];
  const latest  = logs[0] || {};

  const statusText = cargo.statusName || cargo.status_description
                  || cargo.description || cargo.status || 'ระหว่างการขนส่ง';

  return {
    status:      statusText,
    location:    latest.station || latest.location || latest.detail || '-',
    datetime:    latest.ctime   || latest.time     || latest.datetime || '-',
    carrierName: 'Flash Express',
    tag:         'InTransit',
    events:      logs.slice(0, 5).map(ev => ({
      status:   ev.statusName || ev.detail || ev.description || '-',
      location: ev.station    || ev.location || '-',
      datetime: ev.ctime      || ev.time     || ev.datetime  || '-',
    })),
  };
}

// ──────────────────────────────────────────────
//  🛠️ Helpers
// ──────────────────────────────────────────────
function pendingResult(carrier) {
  return {
    status:      'กำลังดึงข้อมูล กรุณารอสักครู่แล้วลองใหม่ค่ะ',
    location:    '-', datetime: '-',
    carrierName: carrier === 'EMS' ? 'EMS (ไปรษณีย์ไทย)' : 'Flash Express',
    tag: 'Pending', events: [],
  };
}

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
