/* =============================================================================
 * TUG//LAB — app.js
 * UI controller / screen router. Simple hash-less state machine.
 * Screens: S1 entry · S2 setup · S3 live · S4 analysing · S5 results · S6 history
 * ========================================================================== */
(function (global) {
  'use strict';

  const CFG = global.CONFIG;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const el = (tag, attrs, children) => {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  };

  /* ---- shared session store --------------------------------------------- */
  const Store = {
    form: {},            // participant/session inputs
    checks: {},          // pre-test checkboxes
    language: 'en',
    calibration: null,
    frames: null,        // captured raw pose frames
    result: null,        // offline analysis result
    previous: null,      // previous attempt (for comparison)
    attemptNo: 1,
    reset() {
      this.frames = null; this.result = null; this.calibration = null;
    },
  };

  /* ---- router ----------------------------------------------------------- */
  const Screens = {}; // name -> render() returning a DOM node
  let current = null;

  function register(name, renderFn) { Screens[name] = renderFn; }

  function go(name, opts) {
    const root = $('#screen-root');
    if (!Screens[name]) { console.warn('No screen', name); return; }
    current = name;
    // live camera layer only for S2/S3
    const liveLayer = $('#liveSession');
    const isLive = (name === 'setup' || name === 'live' || name === 'replay');
    document.body.classList.toggle('live-active', isLive);
    liveLayer.classList.toggle('active', isLive);
    liveLayer.setAttribute('aria-hidden', String(!isLive));

    // guard back button mid-test
    if (isLive) pushGuard();

    root.innerHTML = '';
    const node = Screens[name](opts || {});
    if (node) {
      node.classList.add('screen', 'active');
      root.appendChild(node);
    }
    window.scrollTo(0, 0);
    if (global.Router) global.Router.onChange && global.Router.onChange(name);
  }

  // Back-button guard so a swipe/back mid-test asks to confirm
  let guardArmed = false;
  function pushGuard() {
    if (guardArmed) return;
    guardArmed = true;
    history.pushState({ tug: 'guard' }, '');
  }
  window.addEventListener('popstate', () => {
    if (current === 'setup' || current === 'live' || current === 'replay') {
      if (confirm(global.T('common.leaveTest'))) {
        guardArmed = false;
        if (global.PoseEngine && global.PoseEngine.stop) global.PoseEngine.stop();
        go('entry');
      } else {
        history.pushState({ tug: 'guard' }, ''); // re-arm
      }
    }
  });

  /* ---- placeholder screens (replaced by later milestones) --------------- */
  function header() {
    return el('div', {}, [
      el('h1', { class: 'logo', html: 'TUG<span class="sep">//</span>LAB' }),
      el('p', { class: 'subtitle' }, [global.T('app.subtitle')]),
    ]);
  }

  // 'entry', 'unable', 'resultsLite' are provided by screen-entry.js.
  // 'history' placeholder until M7; 'setup'/'live' until M2/M5.
  register('history', function () {
    const wrap = el('div');
    wrap.appendChild(header());
    const p = el('div', { class: 'panel' });
    p.appendChild(el('h2', {}, [global.T('hist.title')]));
    p.appendChild(el('p', {}, [global.T('hist.empty')]));
    p.appendChild(el('button', { class: 'btn', onclick: () => go('entry') }, ['← BACK']));
    wrap.appendChild(p);
    return wrap;
  });

  // Placeholder results (replaced by M6). Shows the key outcome so the live
  // flow is testable end-to-end before the full results screen lands.
  if (!Screens.results) register('results', function (opts) {
    const wrap = el('div');
    wrap.appendChild(header());
    const S = Store;
    const p = el('div', { class: 'panel' });
    if (opts && opts.error || (S.result && S.result.error)) {
      p.appendChild(el('h2', {}, ['Analysis failed']));
      p.appendChild(el('p', {}, [(S.result && S.result.message) || 'Could not analyse.']));
    } else if (S.result && S.result.summary) {
      const sm = S.result.summary;
      p.appendChild(el('h2', {}, ['Result']));
      p.appendChild(el('div', { class: 'big-score' }, [
        el('div', { class: 'big-number' }, [global.Util.fmt(sm.total_time_taken_s, 1)]),
        el('div', { class: 'unit' }, ['SECONDS']),
      ]));
      p.appendChild(el('p', {}, ['CDC: ' + (sm.fall_risk_cdc || '—') + ' · tier ' + (sm.fall_risk_tier || '—') + ' · QC ' + (sm.qc_pass ? 'PASS' : 'REVIEW')]));
      p.appendChild(el('p', { class: 'opt' }, ['velocity ' + global.Util.fmt(sm.gait_velocity_m_s, 2) + ' m/s · avg stride ' + global.Util.fmt(sm.average_stride_length_m, 2) + ' m · full results screen in M6']));
    } else {
      p.appendChild(el('h2', {}, ['No result']));
    }
    p.appendChild(el('button', { class: 'btn btn-primary', style: 'margin-top:12px', onclick: () => go('entry') }, ['BACK TO START']));
    wrap.appendChild(p);
    return wrap;
  });

  // Placeholder setup/live (replaced by M2/M5). Kept so the entry flow is
  // testable end-to-end before the camera milestones land.
  if (!Screens.setup) register('setup', function () {
    const wrap = el('div');
    wrap.appendChild(header());
    const p = el('div', { class: 'panel' });
    p.appendChild(el('h2', {}, ['Setup & calibrate']));
    p.appendChild(el('p', {}, ['Camera setup (S2) lands in M2. Form captured OK — participant: ' + (Store.form.participant_id || '?') + '.']));
    p.appendChild(el('button', { class: 'btn', onclick: () => go('entry') }, ['← BACK']));
    wrap.appendChild(p);
    return wrap;
  });

  /* ---- debug ------------------------------------------------------------ */
  function initDebug() {
    if (!CFG.debug.enabled) return;
    const s = document.createElement('script');
    s.src = CFG.debug.erudaCdn;
    s.onload = () => { try { global.eruda.init(); } catch (e) {} };
    document.body.appendChild(s);
    const ov = el('div', { class: 'debug-overlay', id: 'debugOverlay' }, ['debug']);
    document.body.appendChild(ov);
  }

  /* ---- boot ------------------------------------------------------------- */
  function boot() {
    CFG._lang = Store.language;
    $('#versionFooter').textContent = `${CFG.app.name} v${CFG.app.version} · analysis ${CFG.app.analysisVersion} · schema ${CFG.app.schemaVersion}`;
    initDebug();
    // try to lock portrait where allowed (ignore failure)
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}
    go('entry');
  }

  // expose router + helpers for other modules/milestones
  global.Router = { go, register, Store, el, $, $$, header };
  global.App = { boot };

  // Boot on window.load so every screen module (loaded after app.js) has
  // registered itself before we render the first screen.
  if (document.readyState === 'complete') setTimeout(boot, 0);
  else window.addEventListener('load', boot);
})(typeof window !== 'undefined' ? window : globalThis);
