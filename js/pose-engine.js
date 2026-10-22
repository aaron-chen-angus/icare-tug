/* =============================================================================
 * TUG//LAB — pose-engine.js  (ES module)
 * MediaPipe Pose Landmarker + camera + portrait overlay + replay-from-file.
 *
 * window.PoseEngine API:
 *   init(model)                      load vision + model (GPU, CPU fallback)
 *   listCameras()                    enumerate video inputs (after permission)
 *   startCamera({facing,deviceId})   getUserMedia portrait stream into <video>
 *   startDetection(onFrame)          per-frame loop; onFrame(packet)
 *   startReplay(file,onFrame,onEnd)  analyse a video file through the same path
 *   stop()                           stop loop + camera + release
 *   setMarkers(opts)                 overlay toggles {labels,angles,trail}
 *   mapLandmark(nx,ny)               image-normalised -> displayed canvas px
 *   drawOverlay(result)              draw skeleton + CHAIR/CONE markers
 *   setCalibMarkers({chairX,coneX})  vertical marker x in normalised units
 *   requestWakeLock()/releaseWakeLock()
 *   measuredFps()                    last measured capture fps
 *
 * onFrame packet: { tMs, image:[{x,y,z,visibility}×33], world:[{x,y,z}×33], fps }
 * The MediaPipe bundle is loaded with a dynamic import() at init() so the page
 * still renders if the CDN is briefly unreachable (error surfaced to the UI).
 * ========================================================================== */

(function (global) {
  'use strict';

  const CFG = global.CONFIG;

  // 17 landmarks this app uses -> MediaPipe indices (matches schema MARKERS)
  const IDX = {
    nose: 0, l_sh: 11, r_sh: 12, l_el: 13, r_el: 14, l_wr: 15, r_wr: 16,
    l_hip: 23, r_hip: 24, l_kn: 25, r_kn: 26, l_an: 27, r_an: 28,
    l_heel: 29, r_heel: 30, l_toe: 31, r_toe: 32,
  };

  // Bone connections to draw (by MediaPipe index pairs). side: 'l'|'r'|'c'
  const BONES = [
    [11, 12, 'c'], [11, 23, 'l'], [12, 24, 'r'], [23, 24, 'c'],
    [23, 25, 'l'], [25, 27, 'l'], [27, 29, 'l'], [29, 31, 'l'], [27, 31, 'l'],
    [24, 26, 'r'], [26, 28, 'r'], [28, 30, 'r'], [30, 32, 'r'], [28, 32, 'r'],
    [11, 13, 'l'], [13, 15, 'l'], [12, 14, 'r'], [14, 16, 'r'],
  ];
  const DOTS = Object.values(IDX);

  const state = {
    landmarker: null,
    vision: null,
    delegate: 'CPU',
    model: CFG.pose.defaultModel,
    video: null,
    canvas: null,
    ctx: null,
    wrap: null,
    stream: null,
    running: false,
    rafId: null,
    lastVideoTime: -1,
    onFrame: null,
    t0: null,          // performance.now at GO (set by caller via markT0)
    fpsWin: [],        // timestamps for fps measurement
    fps: 0,
    markers: { labels: false, angles: false, trail: false },
    trail: [],         // recent hip points for trail overlay
    calib: null,       // {chairX, coneX} normalised
    mirror: false,     // front camera display mirror
    wakeLock: null,
    lastResult: null,
  };

  /* ---- init: load MediaPipe --------------------------------------------- */
  async function init(model) {
    state.model = model || CFG.pose.defaultModel;
    if (state.landmarker) return state;
    const mod = await import(/* @vite-ignore */ CFG.pose.visionBundle);
    const { PoseLandmarker, FilesetResolver } = mod;
    state.vision = await FilesetResolver.forVisionTasks(CFG.pose.wasmBase);

    const common = {
      baseOptions: { modelAssetPath: CFG.pose.models[state.model] },
      runningMode: 'VIDEO',
      numPoses: CFG.pose.numPoses,
      minPoseDetectionConfidence: CFG.pose.minPoseDetectionConfidence,
      minPosePresenceConfidence: CFG.pose.minPosePresenceConfidence,
      minTrackingConfidence: CFG.pose.minTrackingConfidence,
      outputSegmentationMasks: false,
    };
    // Try GPU delegate, fall back to CPU.
    try {
      state.landmarker = await PoseLandmarker.createFromOptions(state.vision,
        Object.assign({}, common, { baseOptions: Object.assign({}, common.baseOptions, { delegate: 'GPU' }) }));
      state.delegate = 'GPU';
    } catch (e) {
      state.landmarker = await PoseLandmarker.createFromOptions(state.vision,
        Object.assign({}, common, { baseOptions: Object.assign({}, common.baseOptions, { delegate: 'CPU' }) }));
      state.delegate = 'CPU';
    }
    return state;
  }

  /* ---- camera enumeration + start --------------------------------------- */
  async function listCameras() {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      return devs.filter((d) => d.kind === 'videoinput');
    } catch (e) { return []; }
  }

  function bindDom() {
    state.video = document.getElementById('camVideo');
    state.canvas = document.getElementById('overlay');
    state.wrap = document.getElementById('videoWrap');
    state.ctx = state.canvas.getContext('2d');
  }

  async function startCamera(opts) {
    opts = opts || {};
    bindDom();
    state.mirror = (opts.facing === 'user');
    state.wrap.classList.toggle('mirror', state.mirror);

    const video = {
      width: { ideal: CFG.camera.width },
      height: { ideal: CFG.camera.height },
      frameRate: { ideal: CFG.camera.fps, min: 24 },
    };
    if (opts.deviceId) video.deviceId = { exact: opts.deviceId };
    else video.facingMode = { ideal: opts.facing || 'environment' };

    state.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    state.video.srcObject = state.stream;
    await state.video.play();
    await new Promise((res) => {
      if (state.video.videoWidth) return res();
      state.video.onloadedmetadata = () => res();
    });
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
    return {
      width: state.video.videoWidth,
      height: state.video.videoHeight,
      label: trackLabel(),
    };
  }

  function trackLabel() {
    try { return state.stream.getVideoTracks()[0].label || ''; } catch (e) { return ''; }
  }

  // Try to pick an ultra-wide / 0.5x lens if the course doesn't fit.
  async function tryWideLens() {
    const cams = await listCameras();
    const wide = cams.find((c) => /ultra|0\.5|wide/i.test(c.label));
    if (wide) return wide.deviceId;
    // else try min zoom on current track
    try {
      const track = state.stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.zoom && caps.zoom.min != null) {
        await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
      }
    } catch (e) {}
    return null;
  }

  /* ---- display mapping (shared by overlay + analysis) -------------------- */
  // The <video> and <canvas> use object-fit: contain. Compute the letterboxed
  // rectangle so normalised image coords map to the SAME displayed pixels.
  function fitRect() {
    const cw = state.canvas.width, ch = state.canvas.height;
    const vw = state.video.videoWidth || cw, vh = state.video.videoHeight || ch;
    const scale = Math.min(cw / vw, ch / vh);
    const dw = vw * scale, dh = vh * scale;
    return { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh };
  }

  function mapLandmark(nx, ny) {
    const r = fitRect();
    let x = r.x + nx * r.w;
    const y = r.y + ny * r.h;
    if (state.mirror) x = state.canvas.width - x;
    return { x, y };
  }

  function resizeCanvas() {
    if (!state.canvas || !state.wrap) return;
    const rect = state.wrap.getBoundingClientRect();
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    state.canvas.width = Math.round(rect.width * dpr);
    state.canvas.height = Math.round(rect.height * dpr);
    state.canvas.style.width = rect.width + 'px';
    state.canvas.style.height = rect.height + 'px';
  }

  /* ---- detection loop --------------------------------------------------- */
  function markT0(t) { state.t0 = (t == null ? performance.now() : t); }

  function packetFrom(result, tMs) {
    const lm = (result.landmarks && result.landmarks[0]) || null;
    const wl = (result.worldLandmarks && result.worldLandmarks[0]) || null;
    return {
      tMs,
      image: lm ? lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null,
      world: wl ? wl.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })) : null,
      fps: state.fps,
      delegate: state.delegate,
    };
  }

  function updateFps(now) {
    state.fpsWin.push(now);
    while (state.fpsWin.length && now - state.fpsWin[0] > 1000) state.fpsWin.shift();
    state.fps = state.fpsWin.length; // frames in last ~1 s
  }

  function loop() {
    if (!state.running) return;
    const video = state.video;
    const now = performance.now();
    if (video.currentTime !== state.lastVideoTime && state.landmarker) {
      state.lastVideoTime = video.currentTime;
      let result = null;
      try { result = state.landmarker.detectForVideo(video, now); } catch (e) { result = null; }
      updateFps(now);
      state.lastResult = result;
      const tMs = state.t0 == null ? now : (now - state.t0);
      if (result) {
        drawOverlay(result);
        if (state.onFrame) state.onFrame(packetFrom(result, tMs));
      }
    }
    scheduleNext();
  }

  function scheduleNext() {
    if (state.video.requestVideoFrameCallback) {
      state.video.requestVideoFrameCallback(() => loop());
    } else {
      state.rafId = requestAnimationFrame(loop);
    }
  }

  function startDetection(onFrame) {
    state.onFrame = onFrame || null;
    state.running = true;
    state.lastVideoTime = -1;
    scheduleNext();
  }

  /* ---- replay from file ------------------------------------------------- */
  async function startReplay(file, onFrame, onEnd, speed) {
    bindDom();
    state.mirror = false;
    state.wrap.classList.remove('mirror');
    const url = URL.createObjectURL(file);
    state.video.srcObject = null;
    state.video.src = url;
    state.video.muted = true;
    state.video.playbackRate = speed || 1;
    await new Promise((res) => { state.video.onloadedmetadata = () => res(); });
    resizeCanvas();
    state.onFrame = onFrame || null;
    state.running = true;
    state.lastVideoTime = -1;
    markT0(performance.now());
    state.video.onended = () => { state.running = false; URL.revokeObjectURL(url); if (onEnd) onEnd(); };
    await state.video.play();
    scheduleNext();
  }

  /* ---- overlay drawing -------------------------------------------------- */
  function setMarkers(opts) { Object.assign(state.markers, opts || {}); }
  function setCalibMarkers(c) { state.calib = c; }

  function visColor(vis, side) {
    if (vis != null && vis < 0.5) return { stroke: CFG ? '#ffd700' : 'yellow', fill: 'transparent' };
    const near = (side === 'l'); // dominant/near side blue, far orange-soft
    return { stroke: near ? '#00d4ff' : '#ff8c3a', fill: near ? '#00d4ff' : '#ff8c3a' };
  }

  function drawOverlay(result) {
    const ctx = state.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    const lm = (result && result.landmarks && result.landmarks[0]) || null;

    // CHAIR / CONE vertical markers (if set)
    if (state.calib) {
      ['chairX', 'coneX'].forEach((k) => {
        if (state.calib[k] == null) return;
        const p = mapLandmark(state.calib[k], 0);
        const pb = mapLandmark(state.calib[k], 1);
        ctx.save();
        ctx.strokeStyle = k === 'chairX' ? '#ff6a00' : '#ffd700';
        ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '12px Orbitron, sans-serif';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fillText(k === 'chairX' ? 'CHAIR' : 'CONE', p.x + 4, p.y + 16);
        ctx.restore();
      });
    }

    if (!lm) return;

    // bones
    ctx.lineWidth = 3;
    BONES.forEach(([a, b, side]) => {
      const pa = lm[a], pb = lm[b];
      if (!pa || !pb) return;
      const A = mapLandmark(pa.x, pa.y), B = mapLandmark(pb.x, pb.y);
      const lowVis = (pa.visibility < 0.5 || pb.visibility < 0.5);
      ctx.strokeStyle = lowVis ? 'rgba(255,215,0,.7)' : (side === 'l' ? '#00d4ff' : side === 'r' ? '#ff8c3a' : '#dfe9ff');
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    });

    // dots
    DOTS.forEach((i) => {
      const p = lm[i];
      if (!p) return;
      const P = mapLandmark(p.x, p.y);
      const low = p.visibility < 0.5;
      const side = ([11, 13, 15, 23, 25, 27, 29, 31].indexOf(i) >= 0) ? 'l' : 'r';
      ctx.beginPath();
      ctx.arc(P.x, P.y, 4, 0, Math.PI * 2);
      if (low) { ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2; ctx.stroke(); }
      else { ctx.fillStyle = side === 'l' ? '#00d4ff' : '#ff8c3a'; ctx.fill(); }
      if (state.markers.labels) {
        ctx.font = '10px Rajdhani, sans-serif';
        ctx.fillStyle = '#8fa6c8';
        ctx.fillText(Math.round((p.visibility || 0) * 100) + '%', P.x + 6, P.y - 6);
      }
    });

    // trail (hip mid, last ~3 s)
    if (state.markers.trail) {
      const lh = lm[IDX.l_hip], rh = lm[IDX.r_hip];
      if (lh && rh) {
        const hp = mapLandmark((lh.x + rh.x) / 2, (lh.y + rh.y) / 2);
        state.trail.push(hp);
        if (state.trail.length > 90) state.trail.shift();
        ctx.strokeStyle = 'rgba(0,212,255,.5)'; ctx.lineWidth = 2; ctx.beginPath();
        state.trail.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
        ctx.stroke();
      }
    }
  }

  /* ---- wake lock -------------------------------------------------------- */
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        state.wakeLock = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', reacquireWakeLock);
      }
    } catch (e) {}
  }
  async function reacquireWakeLock() {
    if (document.visibilityState === 'visible' && !state.wakeLock) {
      try { if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
    }
  }
  function releaseWakeLock() {
    try { if (state.wakeLock) { state.wakeLock.release(); state.wakeLock = null; } } catch (e) {}
    document.removeEventListener('visibilitychange', reacquireWakeLock);
  }

  /* ---- stop ------------------------------------------------------------- */
  function stop() {
    state.running = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('orientationchange', resizeCanvas);
    try { if (state.stream) state.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    state.stream = null;
    if (state.video) { try { state.video.pause(); } catch (e) {} state.video.srcObject = null; state.video.src = ''; }
    releaseWakeLock();
    state.trail = [];
    state.onFrame = null;
  }

  global.PoseEngine = {
    IDX, init, listCameras, startCamera, tryWideLens, startDetection, startReplay,
    stop, setMarkers, setCalibMarkers, mapLandmark, drawOverlay, resizeCanvas,
    markT0, requestWakeLock, releaseWakeLock,
    measuredFps: () => state.fps,
    delegate: () => state.delegate,
    videoSize: () => ({ w: state.video ? state.video.videoWidth : 0, h: state.video ? state.video.videoHeight : 0 }),
    lastResult: () => state.lastResult,
    _state: state,
  };
})(typeof window !== 'undefined' ? window : globalThis);
