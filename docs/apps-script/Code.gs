/**
 * 吳平種苗廠 育苗排程 — Google Sheets 同步後端（Google Apps Script）
 *
 * 部署步驟見 docs/google-apps-script.md
 * 執行環境：V8（預設）
 *
 * 試算表結構（自動建立）：
 *   crops / customers / locations / batches / events ：每列 [id, updatedAt, deleted, json, syncedAt]
 *   syncedAt = 伺服器收到的時間；拉取以 syncedAt 判斷，避免「先寫入、晚上傳」的資料被別台漏掉
 *   批次總表 / 作業紀錄 ：人類可讀的報表工作表，每次同步後重建
 */

const TOKEN = '請改成你們自己的密語'; // ← 與 App「設定 → 雲端同步 → 共用密語」相同
const TABLES = ['crops', 'customers', 'locations', 'batches', 'events'];

const STATUS_LABEL = { planned: '排程中', soaking: '浸種催芽', sown: '已播種', growing: '苗床管理', hardening: '健化中', ready: '可出貨', shipped: '已出貨', cancelled: '取消' };
const DELIVERY_LABEL = { pickup: '客戶自取', deliver: '本場送貨' };
const EVENT_LABEL = { soak: '浸種/催芽', sow: '播種', move: '移穴/移床', harden: '健化', ship: '出貨', water: '澆水', fertilize: '施肥', pest: '病蟲害', inspect: '巡視', loss: '損耗', note: '備註' };

function doGet() {
  return json_({ ok: true, service: 'nursery-tracker', time: new Date().toISOString() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (TOKEN && body.token !== TOKEN) return json_({ error: '密語（token）錯誤' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const push = body.push || {};
    const since = body.since || '';
    const pull = {};
    let changed = false;
    const now = new Date().toISOString();

    TABLES.forEach(function (t) {
      const sh = sheet_(ss, t);
      const rows = readAll_(sh); // id -> {row, updatedAt, json}
      (push[t] || []).forEach(function (r) {
        if (!r || !r.id) return;
        const ex = rows[r.id];
        const at = r.updatedAt || '';
        if (!ex || (ex.updatedAt || '') < at) {
          const vals = [r.id, at, r.deleted ? 1 : 0, JSON.stringify(r), now];
          if (ex) sh.getRange(ex.row, 1, 1, 5).setValues([vals]);
          else sh.appendRow(vals);
          rows[r.id] = { row: ex ? ex.row : sh.getLastRow(), updatedAt: at, json: vals[3], syncedAt: now };
          changed = true;
        }
      });
      pull[t] = [];
      Object.keys(rows).forEach(function (id) {
        const v = rows[id];
        if (!since || (v.syncedAt || v.updatedAt || '') > since) pull[t].push(JSON.parse(v.json));
      });
    });

    if (changed) rebuildReports_(ss);
    return json_({ ok: true, pull: pull, serverTime: now });
  } catch (err) {
    return json_({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- helpers ----------
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(['id', 'updatedAt', 'deleted', 'json', 'syncedAt']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll_(sh) {
  const out = {};
  const last = sh.getLastRow();
  if (last < 2) return out;
  const vals = sh.getRange(2, 1, last - 1, 5).getValues();
  vals.forEach(function (v, i) {
    if (v[0]) out[String(v[0])] = { row: i + 2, updatedAt: String(v[1] || ''), json: String(v[3] || '{}'), syncedAt: String(v[4] || '') };
  });
  return out;
}

function allRows_(ss, t) {
  const rows = readAll_(sheet_(ss, t));
  return Object.keys(rows).map(function (id) { return JSON.parse(rows[id].json); }).filter(function (r) { return !r.deleted; });
}

/** 重建人類可讀報表工作表 */
function rebuildReports_(ss) {
  const batches = allRows_(ss, 'batches').sort(function (a, b) { return (b.sowDate || '').localeCompare(a.sowDate || ''); });
  const bh = ['批次編號', '狀態', '作物', '品種', '穴盤規格', '盤數', '預計株數', '預估損耗率', '累計損耗盤數', '實際損耗率',
    '交貨對象', '金額', '床位', '接單日', '預計浸種日', '預計播種日', '預計健化日', '預計可出貨日', '目標交苗日',
    '實際播種日', '實際健化日', '實際出貨日', '出貨盤數', '備註', '更新時間'];
  const br = batches.map(function (b) {
    const lossRate = b.trayCount ? b.lossTrays / b.trayCount : 0;
    return [b.id, STATUS_LABEL[b.status] || b.status, b.cropName, b.variety, b.trayCells, b.trayCount, b.targetPlants,
      Math.round((b.expectedLossRate || 0) * 100) + '%', b.lossTrays || 0, (lossRate * 100).toFixed(1) + '%',
      (b.orders || []).map(function (o) { return o.customerName + ' ' + o.trays + '盤(' + (DELIVERY_LABEL[o.deliveryMethod] || '') + ')'; }).join('、'),
      (b.orders || []).reduce(function (s, o) { return s + (o.unitPrice ? (o.shippedTrays || o.trays) * o.unitPrice : 0); }, 0) || '',
      b.locationName, b.orderDate, b.soakDate || '', b.sowDate, b.hardenDate, b.readyDate, b.targetShipDate,
      b.actualSowDate || '', b.actualHardenDate || '', b.actualShipDate || '', b.shippedTrays || '', b.note || '', b.updatedAt];
  });
  writeReport_(ss, '批次總表', bh, br);

  const oh = ['批次編號', '作物', '品種', '客戶', '交貨方式', '預定盤數', '已出貨盤數', '出貨日', '單價/盤', '金額', '批次狀態'];
  const orr = [];
  batches.forEach(function (b) {
    (b.orders || []).forEach(function (o) {
      orr.push([b.id, b.cropName, b.variety, o.customerName, DELIVERY_LABEL[o.deliveryMethod] || '', o.trays, o.shippedTrays || 0, o.shippedDate || '',
        o.unitPrice || '', o.unitPrice ? (o.shippedTrays || o.trays) * o.unitPrice : '', STATUS_LABEL[b.status] || b.status]);
    });
  });
  writeReport_(ss, '出貨明細', oh, orr);

  const events = allRows_(ss, 'events').sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  const eh = ['日期', '批次編號', '類型', '數量(盤)', '客戶', '備註', '更新時間'];
  const er = events.map(function (e) { return [e.date, e.batchId, EVENT_LABEL[e.type] || e.type, e.qty || '', e.customerName || '', e.note || '', e.updatedAt]; });
  writeReport_(ss, '作業紀錄', eh, er);
}

function writeReport_(ss, name, headers, rows) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name, 0); }
  sh.clearContents();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
}
