/* =============================================================================
 * TUG//LAB — live.js
 * Causal (real-time) feedback state machine. Cheap; for feedback only — the
 * offline analysis (analysis.js) is authoritative. Drives the live timer,
 * phase chip, hip-progress bar and the auto-finish suggestion.
 *
 * Usage:
 *   const lt = LiveTracker.create({ hipSeated });
 *   lt.onGo();                 // t=0
 *   lt.update(packet);         // per frame -> returns {phase, p, elapsed, finishSuggested}
 *   lt.reset();
 * ========================================================================== */
(function (global) {
  'use strict';

  const CFG = global.CONFIG;
  const IDXMAP = {
    l_hip: 23, r_hip: 24, l_an: 27, r_an: 28, l_heel: 29, r_heel: 30, l_toe: 31, r_toe: 32,
    l_kn: 25, r_kn: 26, l_sh: 11, r_sh: 12,
  };

  function create(opts) {
    opts = opts || {};
    const st = {
      go: false, t0: null, elapsed: 0,
      emaP: 0, hipSeated: opts.hipSeated, hipStand: null,
      state: 'SEATED', phase: 'SEATED_PRE',
      stillBuf: [], finishSuggested: false, autoFinished: false,
      maxP: 0, outPeak: 0, prevPath: 0, pathEst: 0, prevHipRel: null,
      stillSince: null,
    };

    function hipUp(w) {
      const hipY = (w[IDXMAP.l_hip].y + w[IDXMAP.r_hip].y) / 2;
      const ankY = Math.max(w[IDXMAP.l_an].y, w[IDXMAP.r_an].y);
      return ankY - hipY; // pelvis height above grounded foot
    }

    function onGo() { st.go = true; st.t0 = performance.now(); st.state = 'RISING'; }

    function update(pkt) {
      const w = pkt.world;
      if (st.go && st.t0 != null) st.elapsed = (performance.now() - st.t0) / 1000;
      if (!w) return snapshot();

      const h = hipUp(w);
      if (st.hipSeated == null) st.hipSeated = h;
      if (st.hipStand == null || h > st.hipStand) st.hipStand = Math.max(st.hipStand || 0, h);
      const denom = (st.hipStand - st.hipSeated) || 1;
      let p = (h - st.hipSeated) / denom;
      st.emaP = st.emaP + CFG.live.emaAlpha * (p - st.emaP);
      p = st.emaP;
      st.maxP = Math.max(st.maxP, p);

      // crude path progress from hip horizontal (feedback only)
      const hipX = (w[IDXMAP.l_hip].x + w[IDXMAP.r_hip].x) / 2;
      if (st.prevHipRel != null) st.pathEst += Math.abs(hipX - st.prevHipRel);
      st.prevHipRel = hipX;

      // state machine (causal, lenient)
      switch (st.state) {
        case 'SEATED': case 'RISING':
          st.phase = (p > 0.15) ? 'SIT_TO_STAND' : 'SEATED_PRE';
          if (p > 0.9) { st.state = 'WALKING_OUT'; st.phase = 'WALK_OUT'; }
          break;
        case 'WALKING_OUT':
          st.phase = 'WALK_OUT';
          st.outPeak = Math.max(st.outPeak, st.pathEst);
          // far-end detection handled loosely; transition when path plateaus
          if (st.go && st.elapsed > 1.0 && st.pathEst > 0 && pathStalled()) { st.state = 'TURNING1'; st.phase = 'TURN_1'; }
          break;
        case 'TURNING1':
          st.phase = 'TURN_1';
          if (!pathStalled()) { st.state = 'WALKING_BACK'; st.phase = 'WALK_BACK'; }
          break;
        case 'WALKING_BACK':
          st.phase = 'WALK_BACK';
          if (p < 0.6) { st.state = 'SITTING'; st.phase = 'STAND_TO_SIT'; }
          break;
        case 'SITTING':
          st.phase = 'STAND_TO_SIT';
          if (p < 0.2) { st.state = 'SEATED_END'; st.phase = 'SEATED_END'; }
          break;
        case 'SEATED_END':
          st.phase = 'SEATED_END';
          break;
      }

      // auto-finish: seated again (p<0.2) and still for autoFinishStillS
      const trunkLen = Math.abs(((w[IDXMAP.l_sh].y + w[IDXMAP.r_sh].y) / 2) - ((w[IDXMAP.l_hip].y + w[IDXMAP.r_hip].y) / 2)) || 0.5;
      st.stillBuf.push(h);
      if (st.stillBuf.length > 45) st.stillBuf.shift();
      const jitter = range(st.stillBuf) / trunkLen;
      const seatedAgain = (st.state === 'SEATED_END' || p < 0.2) && st.maxP > 0.8 && st.elapsed > 3;
      if (seatedAgain && jitter < CFG.live.autoFinishJitter) {
        if (st.stillSince == null) st.stillSince = performance.now();
        if ((performance.now() - st.stillSince) / 1000 >= CFG.live.autoFinishStillS) st.finishSuggested = true;
      } else { st.stillSince = null; }

      // hard max duration
      if (st.elapsed >= CFG.protocol.maxDurationS) st.finishSuggested = true;

      return snapshot();
    }

    let pathHist = [];
    function pathStalled() {
      pathHist.push(st.pathEst);
      if (pathHist.length > 12) pathHist.shift();
      if (pathHist.length < 10) return false;
      return (pathHist[pathHist.length - 1] - pathHist[0]) < 0.02;
    }

    function range(a) { if (!a.length) return 0; let mn = Infinity, mx = -Infinity; a.forEach((v) => { if (v < mn) mn = v; if (v > mx) mx = v; }); return mx - mn; }

    function snapshot() {
      return { phase: st.phase, p: st.emaP, elapsed: st.elapsed, finishSuggested: st.finishSuggested, progress01: clamp01(st.pathEst / (st.outPeak || 1)) };
    }
    function clamp01(v) { return Math.min(1, Math.max(0, v)); }

    function reset() { st.go = false; st.t0 = null; st.elapsed = 0; st.state = 'SEATED'; st.finishSuggested = false; st.stillBuf = []; pathHist = []; st.maxP = 0; st.pathEst = 0; st.prevHipRel = null; }

    return { onGo, update, reset, snapshot, state: () => st };
  }

  global.LiveTracker = { create };
})(typeof window !== 'undefined' ? window : globalThis);
