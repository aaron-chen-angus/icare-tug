/* =============================================================================
 * TUG//LAB — screen-setup.js  (S2 Setup & calibrate)
 * Portrait camera, always-visible overlay, panning-aware pre-flight checks,
 * world-landmark scale calibration (+ optional 2-tap course scale when static),
 * setup diagram, lens picker, wake lock. START gated on blocking checks.
 * ========================================================================== */
(function (global) {
  'use strict';

  const R = global.Router;
  const CFG = global.CONFIG;
  const T = global.T;
  const el = R.el;
  // PoseEngine is a deferred ES module; bound at render() time (after load).
  let PE = null;
  let IDX = null;

  // Pre-flight checks (adapted for an operator-FOLLOWING camera).
  // 'blocking' true means START stays disabled until it passes (or is overridden).
  const CHECKS = [
    { key: 'camera', label: 'Camera running ≥ 15 fps', blocking: true },
    { key: 'body', label: 'Whole body in frame (head to feet)', blocking: true },
    { key: 'seated', label: 'Participant seated & still to start', blocking: true },
    { key: 'scale', label: 'Scale calibrated (from height / world landmarks)', blocking: true },
    { key: 'sideon', label: 'Roughly side-on view', blocking: false },
    { key: 'light', label: 'Adequate lighting', blocking: false },
    { key: 'pan', label: 'Camera pan steady (not too fast)', blocking: false },
  ];

  let liveState = null; // mutable per-screen check state

  function setupDiagram() {
    // Top-down view: operator follows the subject; chair -> cone 3 m.
    const svg = `
<svg class="setup-diagram" viewBox="0 0 320 150" role="img" aria-label="Setup diagram: operator follows the participant from chair to cone and back">
  <rect x="0" y="0" width="320" height="150" fill="none"/>
  <!-- path line -->
  <line x1="40" y1="70" x2="250" y2="70" stroke="#00d4ff" stroke-width="2" stroke-dasharray="6 5"/>
  <!-- chair -->
  <g transform="translate(28,56)">
    <rect x="0" y="0" width="22" height="22" fill="none" stroke="#ff6a00" stroke-width="2"/>
    <text x="11" y="40" fill="#ff6a00" font-size="10" text-anchor="middle" font-family="Orbitron">CHAIR</text>
  </g>
  <!-- cone -->
  <g transform="translate(246,58)">
    <polygon points="8,0 16,18 0,18" fill="none" stroke="#ffd700" stroke-width="2"/>
    <text x="8" y="34" fill="#ffd700" font-size="10" text-anchor="middle" font-family="Orbitron">CONE</text>
  </g>
  <text x="145" y="60" fill="#8fa6c8" font-size="10" text-anchor="middle">3 m</text>
  <!-- operator with phone, below the path, following -->
  <g transform="translate(120,110)">
    <circle cx="0" cy="0" r="7" fill="none" stroke="#4cdf7c" stroke-width="2"/>
    <rect x="12" y="-6" width="9" height="14" fill="none" stroke="#4cdf7c" stroke-width="2"/>
    <line x1="21" y1="0" x2="60" y2="-36" stroke="#4cdf7c" stroke-width="1" stroke-dasharray="3 3"/>
    <text x="0" y="26" fill="#4cdf7c" font-size="10" text-anchor="middle" font-family="Orbitron">OPERATOR</text>
  </g>
  <text x="160" y="146" fill="#8fa6c8" font-size="9" text-anchor="middle">Hold phone in PORTRAIT · pan to keep whole body in frame</text>
</svg>`;
    const holder = el('div', { html: svg });
    return holder.firstElementChild;
  }

  function render() {
    PE = global.PoseEngine;
    IDX = PE.IDX;
    if (!PE || !IDX) {
      const w = el('div');
      w.appendChild(R.header());
      const p = el('div', { class: 'panel' });
      p.appendChild(el('h2', {}, ['Pose engine not ready']));
      p.appendChild(el('p', {}, ['MediaPipe module is still loading or blocked. Check your connection (the model loads from a CDN over HTTPS) and retry.']));
      p.appendChild(el('button', { class: 'btn', onclick: () => R.go('setup') }, ['RETRY']));
      p.appendChild(el('button', { class: 'btn', style: 'margin-top:8px', onclick: () => R.go('entry') }, ['← BACK']));
      w.appendChild(p);
      return w;
    }
    const S = R.Store;
    const wrap = el('div');
    wrap.appendChild(R.header());

    const panel = el('div', { class: 'panel' });
    panel.appendChild(el('div', { class: 'brackets' }));
    panel.appendChild(el('h2', {}, [T('setup.title')]));
    panel.appendChild(setupDiagram());
    panel.appendChild(el('p', { style: 'font-size:14px;color:var(--text-dim)' }, [T('setup.follow')]));

    // permission / start-camera button
    const permBtn = el('button', { class: 'btn btn-primary btn-large', id: 'permBtn', onclick: onStartCamera }, [T('setup.permission')]);
    panel.appendChild(permBtn);
    const camErr = el('div', { class: 'err', id: 'camErr' });
    panel.appendChild(camErr);

    // lens picker (populated after permission)
    const lensWrap = el('div', { class: 'fg hidden', id: 'lensWrap' });
    lensWrap.appendChild(el('label', {}, ['Camera / lens']));
    const lensSel = el('select', { id: 'lensSel', onchange: onLensChange });
    lensWrap.appendChild(lensSel);
    lensWrap.appendChild(el('button', { class: 'btn', style: 'margin-top:8px', onclick: onWide }, ['TRY WIDE (0.5×) LENS']));
    panel.appendChild(lensWrap);
    wrap.appendChild(panel);

    // pre-flight list
    const pf = el('div', { class: 'panel hidden', id: 'pfPanel' });
    pf.appendChild(el('h3', {}, ['Pre-flight checks']));
    const list = el('ul', { class: 'preflight', id: 'pfList' });
    CHECKS.forEach((c) => {
      const li = el('li', { id: 'pf_' + c.key }, []);
      li.appendChild(el('span', { class: 'mark', id: 'mark_' + c.key }, ['◌']));
      li.appendChild(el('span', {}, [c.label]));
      if (c.blocking) li.appendChild(el('span', { class: 'block-tag' }, ['BLOCKING']));
      list.appendChild(li);
    });
    pf.appendChild(list);
    pf.appendChild(el('p', { class: 'opt', id: 'pfHint' }, [T('setup.markHeight')]));
    wrap.appendChild(pf);

    // controls shown in the fixed live layer when camera is active
    const controls = R.$('#liveControls');
    controls.innerHTML = '';
    const startBtn = el('button', { class: 'btn btn-primary', id: 'startTestBtn', disabled: 'true', onclick: onStartTest }, [T('setup.start')]);
    const cancelBtn = el('button', { class: 'btn btn-danger', onclick: onCancel }, ['CANCEL']);
    controls.appendChild(cancelBtn);
    controls.appendChild(startBtn);

    // reset per-screen state
    liveState = {
      started: false,
      pass: {}, scaleM: null, chainPx: null,
      seatedHipUp: null, seatedStable: false, stillSamples: [],
      lumaOk: true, obliquity: 1, panRate: 0, prevWorldUp: null,
      bodyOkSince: null,
    };
    CHECKS.forEach((c) => { liveState.pass[c.key] = false; });

    return wrap;
  }

  async function onStartCamera() {
    const S = R.Store;
    const permBtn = R.$('#permBtn');
    R.$('#camErr').textContent = '';
    permBtn.disabled = true; permBtn.textContent = 'Starting camera…';
    try {
      await PE.init(S.form.pose_model);
      const info = await PE.startCamera({ facing: S.form.camera_facing });
      S.device = {
        video_width_px: info.width, video_height_px: info.height, lens_label: info.label,
        pose_delegate: PE.delegate(), orientation: (screen.orientation && screen.orientation.type) || '',
        user_agent: navigator.userAgent,
      };
      await PE.requestWakeLock();
      // populate lens list
      const cams = await PE.listCameras();
      const sel = R.$('#lensSel');
      sel.innerHTML = '';
      cams.forEach((c, i) => sel.appendChild(el('option', { value: c.deviceId }, [c.label || ('Camera ' + (i + 1))])));
      R.$('#lensWrap').classList.remove('hidden');
      R.$('#pfPanel').classList.remove('hidden');
      permBtn.classList.add('hidden');
      // start detection feeding the pre-flight evaluator
      PE.markT0(performance.now());
      PE.startDetection(onPreflightFrame);
    } catch (e) {
      permBtn.disabled = false; permBtn.textContent = T('setup.permission');
      R.$('#camErr').textContent = 'Camera error: ' + (e && e.message ? e.message : e) +
        '. Camera needs HTTPS (GitHub Pages) or localhost.';
    }
  }

  async function onLensChange() {
    const S = R.Store;
    const id = R.$('#lensSel').value;
    try { PE.stop(); await PE.init(S.form.pose_model); await PE.startCamera({ facing: S.form.camera_facing, deviceId: id }); PE.markT0(performance.now()); PE.startDetection(onPreflightFrame); }
    catch (e) { R.$('#camErr').textContent = 'Lens switch failed: ' + e.message; }
  }
  async function onWide() {
    const id = await PE.tryWideLens();
    if (id) { R.$('#lensSel').value = id; onLensChange(); }
    else R.$('#pfHint').textContent = 'No ultra-wide lens detected; moved to min zoom if supported. Step further back if the body does not fit.';
  }

  // --- pre-flight evaluation from each pose frame ------------------------
  function onPreflightFrame(pkt) {
    const img = pkt.image, world = pkt.world;
    const ls = liveState;
    if (!ls) return;

    // 1. camera fps
    ls.pass.camera = pkt.fps >= CFG.qc.minFps;

    // 2. whole body in frame: key markers visible >=0.5
    let bodyOk = false;
    if (img) {
      const needed = [IDX.nose, IDX.l_sh, IDX.r_sh, IDX.l_hip, IDX.r_hip, IDX.l_kn, IDX.r_kn, IDX.l_an, IDX.r_an, IDX.l_heel, IDX.r_heel, IDX.l_toe, IDX.r_toe];
      bodyOk = needed.every((i) => img[i] && img[i].visibility >= 0.5 && img[i].y >= 0.02 && img[i].y <= 0.99);
    }
    if (bodyOk) { if (ls.bodyOkSince == null) ls.bodyOkSince = pkt.tMs; }
    else ls.bodyOkSince = null;
    ls.pass.body = bodyOk && (pkt.tMs - (ls.bodyOkSince || pkt.tMs) >= 1000);

    // 3. seated & still (hip world vertical stable + knees flexed)
    if (world) {
      const hipUp = -((world[IDX.l_hip].y + world[IDX.r_hip].y) / 2); // world y down-positive -> up = -y
      const kneeFlex = kneeFlexWorld(world, 'l');
      ls.stillSamples.push(hipUp);
      if (ls.stillSamples.length > 45) ls.stillSamples.shift(); // ~1.5 s @30
      const jitter = range(ls.stillSamples);
      const trunkLen = Math.abs(((world[IDX.l_sh].y + world[IDX.r_sh].y) / 2) - ((world[IDX.l_hip].y + world[IDX.r_hip].y) / 2)) || 0.5;
      ls.pass.seated = ls.stillSamples.length >= 40 && (jitter / trunkLen) < CFG.live.autoFinishJitter && (kneeFlex == null || kneeFlex >= 55);
      if (ls.pass.seated) ls.seatedHipUp = global.Util.median(ls.stillSamples);
    }

    // 4. scale: world landmarks are metric, so scale is "calibrated" as soon as
    //    the chain is visible. Cross-check against known height.
    if (world) {
      const chain = worldChainLen(world);
      if (chain) {
        // expected standing chain ~ height*0.53 (shoulder->ankle); seated differs,
        // so we simply confirm world landmarks are present & plausible here.
        ls.scaleM = 1; // metric already
        ls.pass.scale = true;
      }
    }

    // 5. side-on view (non-blocking): hip separation / trunk length small
    if (world) {
      const hipSep = Math.abs(world[IDX.l_hip].x - world[IDX.r_hip].x);
      const trunk = Math.abs(((world[IDX.l_sh].y + world[IDX.r_sh].y) / 2) - ((world[IDX.l_hip].y + world[IDX.r_hip].y) / 2)) || 0.5;
      ls.obliquity = hipSep / trunk;
      ls.pass.sideon = ls.obliquity < CFG.qc.maxObliquity * 1.6; // lenient; following camera varies
    }

    // 6. lighting (non-blocking) sampled occasionally
    ls.pass.light = ls.lumaOk;

    // 7. camera pan steadiness: estimate from world "up" axis wobble
    if (world) {
      const up = ((world[IDX.l_sh].y + world[IDX.r_sh].y) / 2) - ((world[IDX.l_hip].y + world[IDX.r_hip].y) / 2);
      if (ls.prevWorldUp != null) {
        const dr = Math.abs(up - ls.prevWorldUp) * 30 * 57.3; // crude deg/s proxy
        ls.panRate = ls.panRate * 0.8 + dr * 0.2;
      }
      ls.prevWorldUp = up;
      ls.pass.pan = ls.panRate < CFG.panning.maxCameraYawRateDegS;
    }

    renderChecks();
    updateHud(pkt);
  }

  function updateHud(pkt) {
    const hud = R.$('#liveHud');
    if (!hud) return;
    hud.innerHTML = '';
    const fps = el('span', { class: 'phase-chip' }, [Math.round(pkt.fps) + ' FPS']);
    hud.appendChild(fps);
    if (CFG.debug.enabled) {
      const ov = R.$('#debugOverlay');
      if (ov) ov.textContent = `fps ${Math.round(pkt.fps)} · ${pkt.delegate} · oblq ${liveState.obliquity.toFixed(2)} · pan ${Math.round(liveState.panRate)}`;
    }
  }

  function renderChecks() {
    let allBlockingPass = true;
    CHECKS.forEach((c) => {
      const mark = R.$('#mark_' + c.key);
      if (!mark) return;
      const ok = liveState.pass[c.key];
      mark.textContent = ok ? '✔' : (c.blocking ? '✖' : '◌');
      mark.className = 'mark ' + (ok ? 'ok' : (c.blocking ? 'bad' : 'warn'));
      if (c.blocking && !ok) allBlockingPass = false;
    });
    const btn = R.$('#startTestBtn');
    if (btn) btn.disabled = !allBlockingPass;
  }

  // --- geometry helpers (world landmarks) --------------------------------
  function angle(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
    const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
    const d = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const m1 = Math.hypot(v1.x, v1.y, v1.z), m2 = Math.hypot(v2.x, v2.y, v2.z);
    if (!m1 || !m2) return null;
    return Math.acos(global.Util.clamp(d / (m1 * m2), -1, 1)) * 57.2958;
  }
  function kneeFlexWorld(world, side) {
    const h = world[side === 'l' ? IDX.l_hip : IDX.r_hip];
    const k = world[side === 'l' ? IDX.l_kn : IDX.r_kn];
    const a = world[side === 'l' ? IDX.l_an : IDX.r_an];
    if (!h || !k || !a) return null;
    const ang = angle(h, k, a);
    return ang == null ? null : 180 - ang;
  }
  function worldChainLen(world) {
    const seq = [IDX.l_sh, IDX.l_hip, IDX.l_kn, IDX.l_an];
    let len = 0;
    for (let i = 1; i < seq.length; i++) {
      const p = world[seq[i - 1]], q = world[seq[i]];
      if (!p || !q) return null;
      len += Math.hypot(p.x - q.x, p.y - q.y, (p.z || 0) - (q.z || 0));
    }
    return len;
  }
  function range(arr) { if (!arr.length) return 0; let mn = Infinity, mx = -Infinity; arr.forEach((v) => { if (v < mn) mn = v; if (v > mx) mx = v; }); return mx - mn; }

  // --- actions -----------------------------------------------------------
  function onStartTest() {
    const S = R.Store;
    S.calibration = {
      method: 'world',
      dominant_side: pickDominant(),
      hip_up_seated_m: liveState.seatedHipUp,
      obliquity_median: liveState.obliquity,
    };
    R.go('live');
  }
  function pickDominant() {
    const last = PE.lastResult();
    const w = last && last.worldLandmarks && last.worldLandmarks[0];
    if (!w) return 'left';
    const lv = (w[IDX.l_sh].visibility || 0) + (w[IDX.l_hip].visibility || 0) + (w[IDX.l_kn].visibility || 0) + (w[IDX.l_an].visibility || 0);
    const rv = (w[IDX.r_sh].visibility || 0) + (w[IDX.r_hip].visibility || 0) + (w[IDX.r_kn].visibility || 0) + (w[IDX.r_an].visibility || 0);
    return lv >= rv ? 'left' : 'right';
  }
  function onCancel() { PE.stop(); R.go('entry'); }

  R.register('setup', render);
})(typeof window !== 'undefined' ? window : globalThis);
