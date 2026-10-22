/* =============================================================================
 * TUG//LAB — export.js
 * CSV builders, a dependency-free store-only ZIP writer (CRC-32), local history
 * (localStorage) + raw-frame store (IndexedDB), Google Sheets POST + outbox.
 * ========================================================================== */
(function (global) {
  'use strict';

  const CFG = global.CONFIG;
  const SCHEMA = global.SCHEMA;
  const U = global.Util;

  /* ---- CSV --------------------------------------------------------------- */
  function csvCell(v) {
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;           // formula-injection guard
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function rowsToCsv(cols, rows) {
    const head = cols.join(',');
    const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')).join('\n');
    return head + '\n' + body + '\n';
  }
  function summaryToCsv(summary) {
    const cols = SCHEMA.keysOf('Sessions');
    return rowsToCsv(cols, [summary]);
  }
  function tableToCsv(tableName, rows) {
    const cols = SCHEMA.keysOf(tableName);
    return rowsToCsv(cols, rows || []);
  }
  // Raw 120-col frames CSV (7 values × 17 markers + t_ms)
  function rawFramesCsv(frames) {
    const markers = SCHEMA.markers.map((m) => m.key);
    const cols = ['t_ms'];
    markers.forEach((k) => ['x', 'y', 'z', 'vis', 'wx', 'wy', 'wz'].forEach((a) => cols.push(k + '_' + a)));
    const lines = [cols.join(',')];
    (frames || []).forEach((fr) => {
      const row = [fr.tMs];
      SCHEMA.markers.forEach((m) => {
        const img = fr.image ? fr.image[m.mpIndex] : null;
        const wl = fr.world ? fr.world[m.mpIndex] : null;
        row.push(img ? U.round(img.x, 5) : '', img ? U.round(img.y, 5) : '', img ? U.round(img.z, 5) : '', img ? U.round(img.visibility, 3) : '',
          wl ? U.round(wl.x, 5) : '', wl ? U.round(wl.y, 5) : '', wl ? U.round(wl.z, 5) : '');
      });
      lines.push(row.join(','));
    });
    return lines.join('\n') + '\n';
  }

  /* ---- CRC-32 + store-only ZIP ------------------------------------------ */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function strBytes(s) { return new TextEncoder().encode(s); }

  // Build a store-only (no compression) ZIP from [{name, bytes}].
  function makeZip(files) {
    const chunks = [];
    const central = [];
    let offset = 0;
    const enc = (n) => strBytes(n);
    const u16 = (v) => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF]);
    const u32 = (v) => new Uint8Array([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF]);

    files.forEach((f) => {
      const nameB = enc(f.name);
      const data = f.bytes;
      const crc = crc32(data);
      // local file header
      const lfh = concat([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0), nameB,
      ]);
      chunks.push(lfh, data);
      // central directory header
      const cdh = concat([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0),
        u32(offset), nameB,
      ]);
      central.push(cdh);
      offset += lfh.length + data.length;
    });
    const centralBytes = concat(central);
    const eocd = concat([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBytes.length), u32(offset), u16(0),
    ]);
    return new Blob([concat(chunks), centralBytes, eocd], { type: 'application/zip' });

    function concat(arrs) {
      let len = 0; arrs.forEach((a) => len += a.length);
      const out = new Uint8Array(len); let o = 0;
      arrs.forEach((a) => { out.set(a, o); o += a.length; });
      return out;
    }
  }

  /* ---- download / share -------------------------------------------------- */
  function download(blob, filename) {
    if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename)] })) {
      navigator.share({ files: [new File([blob], filename)], title: filename }).catch(() => fallbackDownload(blob, filename));
      return;
    }
    fallbackDownload(blob, filename);
  }
  function fallbackDownload(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function baseName(summary) {
    const pid = (summary.participant_id || 'P').replace(/[^\w-]/g, '');
    const sid = (summary.session_id || '').slice(0, 8);
    return `TUG_${pid}_${U.nowStamp()}_${sid}`;
  }

  function buildZip(result) {
    const s = result.summary;
    const name = baseName(s);
    const files = [
      { name: name + '_summary.csv', bytes: strBytes(summaryToCsv(s)) },
      { name: name + '_steps.csv', bytes: strBytes(tableToCsv('Steps', result.steps)) },
      { name: name + '_events.csv', bytes: strBytes(tableToCsv('Events', result.events)) },
      { name: name + '_frames_analysis.csv', bytes: strBytes(tableToCsv('Frames', result.frames)) },
      { name: name + '_frames_raw.csv', bytes: strBytes(rawFramesCsv(result.rawFrames || [])) },
      { name: name + '_session.json', bytes: strBytes(JSON.stringify(sessionJson(result), null, 2)) },
      { name: 'README_dictionary_link.txt', bytes: strBytes('Full field definitions: DATA_DICTIONARY.md in the TUG//LAB repository.') },
    ];
    return { blob: makeZip(files), filename: name + '.zip' };
  }

  function sessionJson(result) {
    return {
      schemaVersion: CFG.app.schemaVersion,
      config: CFG,
      summary: result.summary,
      events: result.events,
      steps: result.steps,
      calibration: result.calibration || null,
      qc_flags: result.summary.qc_flags,
    };
  }

  function downloadZip(result) {
    const z = buildZip(result);
    download(z.blob, z.filename);
    return z.filename;
  }

  /* ---- Google Sheets upload + outbox ------------------------------------ */
  function buildPayload(result, uploadFrames) {
    return {
      schemaVersion: CFG.app.schemaVersion,
      summary: result.summary,
      steps: result.steps,
      events: result.events,
      frames: uploadFrames ? result.frames : undefined,
    };
  }

  function outboxGet() { return U.lsGet('outbox', []); }
  function outboxSet(list) { U.lsSet('outbox', list); }
  function outboxAdd(payload) {
    const list = outboxGet();
    if (list.some((p) => p.summary && p.summary.session_id === payload.summary.session_id)) return;
    list.push(payload); outboxSet(list);
  }
  function outboxRemove(sessionId) {
    outboxSet(outboxGet().filter((p) => !(p.summary && p.summary.session_id === sessionId)));
  }

  // POST as text/plain to avoid CORS preflight (Apps Script pattern).
  async function post(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    // Apps Script may still return JSON; try to parse
    let json = null; try { json = await res.json(); } catch (e) {}
    return { ok: res.ok, json };
  }

  async function upload(result, opts) {
    opts = opts || {};
    const url = CFG.sheets.webhookUrl;
    if (!url) return { status: 'not_configured' };
    const payload = buildPayload(result, CFG.sheets.uploadFrames);
    if (!navigator.onLine) { outboxAdd(payload); return { status: 'queued' }; }
    try {
      const r = await post(url, payload);
      if (r.ok) { outboxRemove(payload.summary.session_id); return { status: 'sent', response: r.json }; }
      outboxAdd(payload); return { status: 'queued', error: 'server' };
    } catch (e) {
      // CORS no-cors fallback: fire-and-forget, cannot confirm
      try { await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) }); outboxAdd(payload); return { status: 'sent_unconfirmed' }; }
      catch (e2) { outboxAdd(payload); return { status: 'queued', error: String(e2) }; }
    }
  }

  async function retryOutbox() {
    const url = CFG.sheets.webhookUrl;
    if (!url) return { status: 'not_configured' };
    const list = outboxGet();
    let sent = 0;
    for (const p of list.slice()) {
      try { const r = await post(url, p); if (r.ok) { outboxRemove(p.summary.session_id); sent++; } } catch (e) {}
    }
    return { status: 'done', sent, remaining: outboxGet().length };
  }

  async function testConnection() {
    const url = CFG.sheets.webhookUrl;
    if (!url) return { status: 'not_configured' };
    try { const res = await fetch(url, { method: 'GET' }); const json = await res.json(); return { status: 'ok', json }; }
    catch (e) { return { status: 'error', error: String(e) }; }
  }

  /* ---- local history (summaries) ---------------------------------------- */
  function historyGet() { return U.lsGet('history', []); }
  function historyAdd(summary) {
    const list = historyGet();
    // de-duplicate by session_id (auto-upload then a manual re-send is harmless)
    const existingIdx = list.findIndex((x) => x.session_id === summary.session_id);
    if (existingIdx >= 0) list.splice(existingIdx, 1);
    list.unshift({
      session_id: summary.session_id, participant_id: summary.participant_id,
      timestamp_utc: summary.timestamp_utc, total_time_taken_s: summary.total_time_taken_s,
      fall_risk_cdc: summary.fall_risk_cdc, fall_risk_tier: summary.fall_risk_tier,
      qc_pass: summary.qc_pass, test_outcome: summary.test_outcome, upload_status: summary._upload_status || 'local',
    });
    U.lsSet('history', list.slice(0, CFG.ui.maxHistory));
  }
  function historyClear() { U.lsSet('history', []); outboxSet([]); }

  /* ---- IndexedDB raw frame store (keep last N attempts) ----------------- */
  const DB_NAME = 'tuglab', STORE = 'raw';
  function openDb() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'session_id' }); };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  async function saveRaw(sessionId, rawFrames) {
    try {
      const db = await openDb();
      await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put({ session_id: sessionId, rawFrames, at: Date.now() }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      // prune oldest beyond maxRawAttemptsInDb
      const all = await new Promise((res) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
      all.sort((a, b) => b.at - a.at);
      const extra = all.slice(CFG.ui.maxRawAttemptsInDb);
      if (extra.length) { const tx = db.transaction(STORE, 'readwrite'); extra.forEach((e) => tx.objectStore(STORE).delete(e.session_id)); }
    } catch (e) { /* IndexedDB may be unavailable; ignore */ }
  }

  global.Exporter = {
    csvCell, rowsToCsv, summaryToCsv, tableToCsv, rawFramesCsv,
    crc32, makeZip, buildZip, downloadZip, download,
    buildPayload, upload, retryOutbox, testConnection,
    outboxGet, outboxAdd, outboxRemove,
    historyGet, historyAdd, historyClear,
    saveRaw,
  };
})(typeof window !== 'undefined' ? window : globalThis);
