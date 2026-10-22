/* =============================================================================
 * TUG//LAB — screen-history.js  (S6 History & outbox)
 * Local session list, retry failed uploads, test connection, delete all.
 * ========================================================================== */
(function (global) {
  'use strict';

  const R = global.Router;
  const CFG = global.CONFIG;
  const T = global.T;
  const U = global.Util;
  const el = R.el;
  const Ex = global.Exporter;

  function render() {
    const wrap = el('div');
    wrap.appendChild(R.header());

    const head = el('div', { class: 'panel' });
    head.appendChild(el('div', { class: 'brackets' }));
    head.appendChild(el('h2', {}, [T('hist.title')]));

    // connection row
    const connRow = el('div', { class: 'btn-row' });
    const outbox = Ex.outboxGet();
    const testBtn = el('button', { class: 'btn', onclick: onTestConn }, [T('hist.testConn')]);
    const retryBtn = el('button', { class: 'btn', onclick: onRetry }, [T('hist.retry') + (outbox.length ? ' (' + outbox.length + ')' : '')]);
    connRow.appendChild(testBtn);
    connRow.appendChild(retryBtn);
    head.appendChild(connRow);
    const connStatus = el('p', { class: 'opt', id: 'connStatus' }, [
      CFG.sheets.webhookUrl ? ('Webhook configured. Outbox: ' + outbox.length) : 'Cloud upload not configured — results stay on device.',
    ]);
    head.appendChild(connStatus);
    wrap.appendChild(head);

    // sessions list
    const list = Ex.historyGet();
    if (!list.length) {
      const p = el('div', { class: 'panel' });
      p.appendChild(el('p', {}, [T('hist.empty')]));
      wrap.appendChild(p);
    } else {
      const hist = el('div', { class: 'hist' });
      list.forEach((s) => hist.appendChild(card(s)));
      wrap.appendChild(hist);
    }

    // footer actions
    const foot = el('div', { class: 'btn-row', style: 'margin-top:12px' });
    foot.appendChild(el('button', { class: 'btn btn-primary', onclick: () => R.go('entry') }, ['← NEW TEST']));
    if (list.length) foot.appendChild(el('button', { class: 'btn btn-danger', onclick: onDeleteAll }, [T('hist.deleteAll')]));
    wrap.appendChild(foot);

    wrap.appendChild(el('p', { class: 'footer-limits' }, [T('app.notDevice')]));
    return wrap;
  }

  function card(s) {
    const c = el('div', { class: 'card' });
    const top = el('div', { class: 'top' });
    top.appendChild(el('span', { class: 'big' }, [U.fmt(s.total_time_taken_s, 1) + ' s']));
    const atRisk = s.fall_risk_cdc && s.fall_risk_cdc.indexOf('At risk') === 0;
    top.appendChild(el('span', { class: 'badge ' + (atRisk ? 'red' : 'green') }, [atRisk ? 'AT RISK' : 'OK']));
    c.appendChild(top);
    c.appendChild(el('div', { class: 'meta' }, [
      (s.participant_id || '?') + ' · ' + (s.timestamp_utc ? new Date(s.timestamp_utc).toLocaleString() : '') +
      ' · ' + (s.test_outcome || '') + ' · QC ' + (s.qc_pass ? 'pass' : 'review'),
    ]));
    const statusBadge = el('span', { class: 'badge ' + (s.upload_status === 'sent' ? 'sent' : s.upload_status === 'queued' ? 'queued' : 'blue') }, [uploadLabel(s.upload_status)]);
    c.appendChild(statusBadge);
    const row = el('div', { class: 'btn-row', style: 'margin-top:10px' });
    row.appendChild(el('button', { class: 'btn', onclick: () => reDownload(s) }, ['DOWNLOAD ZIP']));
    row.appendChild(el('button', { class: 'btn btn-danger', onclick: () => del(s.session_id) }, ['DELETE']));
    c.appendChild(row);
    return c;
  }

  function uploadLabel(st) {
    switch (st) {
      case 'sent': return 'uploaded';
      case 'sent_unconfirmed': return 'sent (unconfirmed)';
      case 'queued': return 'queued';
      default: return 'local only';
    }
  }

  async function reDownload(s) {
    // We keep only summaries in localStorage; raw/analysis frames live in
    // IndexedDB. Rebuild a minimal ZIP from the summary + any stored raw frames.
    const connStatus = R.$('#connStatus');
    try {
      const raw = await getRaw(s.session_id);
      if (!raw) {
        // fall back to summary-only ZIP
        Ex.downloadZip({ summary: s, steps: [], events: [], frames: [], rawFrames: [] });
        if (connStatus) connStatus.textContent = 'Downloaded summary only (full frames pruned from local store).';
        return;
      }
      // re-run analysis from raw to regenerate full tables
      const meta = { session_id: s.session_id, age_years: s.age_years, test_outcome: s.test_outcome, course_length_m: CFG.protocol.courseLengthM, checks: {} };
      const res = global.TUGAnalysis.run(raw.rawFrames, meta);
      res.summary = Object.assign({}, res.summary, s);
      res.rawFrames = raw.rawFrames;
      Ex.downloadZip(res);
    } catch (e) {
      if (connStatus) connStatus.textContent = 'Re-download failed: ' + e.message;
    }
  }

  function getRaw(sessionId) {
    return new Promise((res) => {
      try {
        const req = indexedDB.open('tuglab', 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('raw')) return res(null);
          const tx = db.transaction('raw', 'readonly');
          const r = tx.objectStore('raw').get(sessionId);
          r.onsuccess = () => res(r.result || null);
          r.onerror = () => res(null);
        };
        req.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  }

  function del(sessionId) {
    const list = Ex.historyGet().filter((x) => x.session_id !== sessionId);
    U.lsSet('history', list);
    Ex.outboxRemove(sessionId);
    R.go('history');
  }

  function onDeleteAll() {
    if (!confirm('Delete ALL local sessions and outbox? This cannot be undone.')) return;
    Ex.historyClear();
    R.go('history');
  }

  async function onTestConn() {
    const connStatus = R.$('#connStatus');
    connStatus.textContent = 'Testing connection…';
    const r = await Ex.testConnection();
    if (r.status === 'not_configured') connStatus.textContent = 'No webhook configured in config.js.';
    else if (r.status === 'ok') connStatus.textContent = 'Connected: ' + JSON.stringify(r.json);
    else connStatus.textContent = 'Connection failed: ' + (r.error || 'unknown');
  }

  async function onRetry() {
    const connStatus = R.$('#connStatus');
    connStatus.textContent = 'Retrying outbox…';
    const r = await Ex.retryOutbox();
    if (r.status === 'not_configured') connStatus.textContent = 'No webhook configured.';
    else connStatus.textContent = 'Retry done: ' + r.sent + ' sent, ' + r.remaining + ' remaining.';
  }

  // auto-retry on reconnect
  global.addEventListener('online', () => { if (CFG.sheets.webhookUrl) Ex.retryOutbox(); });

  R.register('history', render);
})(typeof window !== 'undefined' ? window : globalThis);
