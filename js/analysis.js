/* =============================================================================
 * TUG//LAB — analysis.js  (authoritative offline engine)
 * TUGAnalysis.run(frames, meta) -> { summary, steps, events, frames } + qc.
 *
 * Panning-camera design: geometry comes from MediaPipe WORLD landmarks (metric,
 * pelvis-origin, camera-motion-invariant). The travelled path is reconstructed
 * by integrating anterior-posterior pelvis-vs-stance-foot motion.
 *
 * M3 scope: signal prep (10.1) + phase/event detection (10.2).
 * M4 adds: gait events, steps/strides, symmetry, velocity, foot pattern,
 *          turn/STS kinematics, QC flags, classification.
 *
 * Coordinate conventions used internally (world):
 *   up(t)   = -y_hipmid        (y is down-positive -> up = -y), metres
 *   axis(t) = world x of markers, which in side view is the walking axis
 *   Path coordinate s(t): reconstructed cumulative travel toward the cone.
 * ========================================================================== */
(function (global) {
  'use strict';

  const CFG = global.CONFIG;
  const DSP = global.DSP;
  const U = global.Util;
  const IDX = {
    nose: 0, l_sh: 11, r_sh: 12, l_el: 13, r_el: 14, l_wr: 15, r_wr: 16,
    l_hip: 23, r_hip: 24, l_kn: 25, r_kn: 26, l_an: 27, r_an: 28,
    l_heel: 29, r_heel: 30, l_toe: 31, r_toe: 32,
  };

  function mid(a, b, k) { return (a[k] + b[k]) / 2; }

  /* ---- extract raw channels from frames --------------------------------- */
  function extract(frames) {
    const t = [], chan = {};
    const keys = ['hip_up', 'sh_up', 'hip_x', 'l_heel_x', 'r_heel_x', 'l_toe_x', 'r_toe_x',
      'l_an_x', 'r_an_x', 'l_heel_y', 'r_heel_y', 'l_kn_x', 'r_kn_x',
      'knee_l', 'knee_r', 'hip_flex_l', 'hip_flex_r', 'trunk', 'yaw',
      'hip_sep', 'chain', 'l_wr_x', 'r_wr_x', 'valid'];
    keys.forEach((k) => chan[k] = []);
    frames.forEach((fr) => {
      t.push(fr.tMs / 1000);
      const w = fr.world;
      if (!w) { keys.forEach((k) => chan[k].push(null)); chan.valid[chan.valid.length - 1] = 0; return; }
      // World landmarks are pelvis-origin, so pelvis y is ~constant. The signal
      // that actually changes between seated and standing is the VERTICAL
      // distance from the ankles (feet on the floor) up to the pelvis. Use the
      // lower (grounded) ankle as the floor reference. y is down-positive, so
      // this distance = ankle.y - hip.y (positive, grows when standing).
      const hipY = mid(w[IDX.l_hip], w[IDX.r_hip], 'y');
      const ankY = Math.max(w[IDX.l_an].y, w[IDX.r_an].y); // lower foot = larger y
      const hipUp = ankY - hipY;                            // pelvis height above feet
      const shY = mid(w[IDX.l_sh], w[IDX.r_sh], 'y');
      const shUp = ankY - shY;
      const hipX = mid(w[IDX.l_hip], w[IDX.r_hip], 'x');
      chan.hip_up.push(hipUp);
      chan.sh_up.push(shUp);
      chan.hip_x.push(hipX);
      chan.l_heel_x.push(w[IDX.l_heel].x);
      chan.r_heel_x.push(w[IDX.r_heel].x);
      chan.l_toe_x.push(w[IDX.l_toe].x);
      chan.r_toe_x.push(w[IDX.r_toe].x);
      chan.l_an_x.push(w[IDX.l_an].x);
      chan.r_an_x.push(w[IDX.r_an].x);
      chan.l_heel_y.push(-w[IDX.l_heel].y);
      chan.r_heel_y.push(-w[IDX.r_heel].y);
      chan.l_kn_x.push(w[IDX.l_kn].x);
      chan.r_kn_x.push(w[IDX.r_kn].x);
      chan.l_wr_x.push(w[IDX.l_wr].x);
      chan.r_wr_x.push(w[IDX.r_wr].x);
      chan.knee_l.push(kneeFlex(w, 'l'));
      chan.knee_r.push(kneeFlex(w, 'r'));
      chan.hip_flex_l.push(hipFlex(w, 'l'));
      chan.hip_flex_r.push(hipFlex(w, 'r'));
      chan.trunk.push(trunkIncl(w));
      chan.yaw.push(torsoYaw(w));
      chan.hip_sep.push(Math.abs(w[IDX.l_hip].x - w[IDX.r_hip].x));
      chan.chain.push(chainLen(w));
      chan.valid.push(allChainVisible(w) ? 1 : 0);
    });
    return { t, chan };
  }

  function angle3(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) };
    const v2 = { x: c.x - b.x, y: c.y - b.y, z: (c.z || 0) - (b.z || 0) };
    const d = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const m1 = Math.hypot(v1.x, v1.y, v1.z), m2 = Math.hypot(v2.x, v2.y, v2.z);
    if (!m1 || !m2) return null;
    return Math.acos(U.clamp(d / (m1 * m2), -1, 1)) * 57.2958;
  }
  function kneeFlex(w, side) {
    const a = angle3(w[side === 'l' ? IDX.l_hip : IDX.r_hip], w[side === 'l' ? IDX.l_kn : IDX.r_kn], w[side === 'l' ? IDX.l_an : IDX.r_an]);
    return a == null ? null : 180 - a;
  }
  function hipFlex(w, side) {
    const a = angle3(w[side === 'l' ? IDX.l_sh : IDX.r_sh], w[side === 'l' ? IDX.l_hip : IDX.r_hip], w[side === 'l' ? IDX.l_kn : IDX.r_kn]);
    return a == null ? null : 180 - a;
  }
  function trunkIncl(w) {
    // forward lean; sign applied later by facing. Use sagittal projection.
    const shx = mid(w[IDX.l_sh], w[IDX.r_sh], 'x'), shy = mid(w[IDX.l_sh], w[IDX.r_sh], 'y');
    const hx = mid(w[IDX.l_hip], w[IDX.r_hip], 'x'), hy = mid(w[IDX.l_hip], w[IDX.r_hip], 'y');
    return Math.atan2(shx - hx, hy - shy) * 57.2958; // signed by facing in prep
  }
  function torsoYaw(w) {
    return Math.atan2((w[IDX.r_sh].z || 0) - (w[IDX.l_sh].z || 0), w[IDX.r_sh].x - w[IDX.l_sh].x) * 57.2958;
  }
  function chainLen(w) {
    const seq = [IDX.l_sh, IDX.l_hip, IDX.l_kn, IDX.l_an];
    let len = 0;
    for (let i = 1; i < seq.length; i++) len += Math.hypot(w[seq[i]].x - w[seq[i - 1]].x, w[seq[i]].y - w[seq[i - 1]].y);
    return len;
  }
  function allChainVisible(w) {
    const need = [IDX.l_sh, IDX.r_sh, IDX.l_hip, IDX.r_hip, IDX.l_kn, IDX.r_kn, IDX.l_an, IDX.r_an, IDX.l_heel, IDX.r_heel, IDX.l_toe, IDX.r_toe];
    return need.every((i) => (w[i].visibility == null || w[i].visibility >= CFG.signal.minVisibility));
  }

  /* ---- signal preparation (10.1) ---------------------------------------- */
  function prepare(frames, meta) {
    const fs = CFG.signal.resampleHz;
    const { t, chan } = extract(frames);
    if (!t.length) return null;
    const t0 = t[0], t1 = t[t.length - 1];

    const grid = {};
    const gapChan = DSP.resampleUniform(t, chan.hip_up, fs, t0, t1, CFG.signal.maxGapS);
    const T = gapChan.t;
    grid.t = T;
    grid.gap = gapChan.gap;

    // resample + filter each channel
    const filtKeys = ['hip_up', 'sh_up', 'hip_x', 'l_heel_x', 'r_heel_x', 'l_toe_x', 'r_toe_x',
      'l_an_x', 'r_an_x', 'l_heel_y', 'r_heel_y', 'l_kn_x', 'r_kn_x',
      'knee_l', 'knee_r', 'hip_flex_l', 'hip_flex_r', 'trunk', 'yaw', 'hip_sep', 'chain', 'l_wr_x', 'r_wr_x'];
    const footKeys = { l_heel_x: 1, r_heel_x: 1, l_toe_x: 1, r_toe_x: 1, l_heel_y: 1, r_heel_y: 1, l_an_x: 1, r_an_x: 1 };
    filtKeys.forEach((k) => {
      const rs = DSP.resampleUniform(t, chan[k], fs, t0, t1, CFG.signal.maxGapS).y;
      const cutoff = footKeys[k] ? CFG.signal.cutoffFootHz : CFG.signal.cutoffHz;
      grid[k] = DSP.filtfilt(rs.map((v) => (v == null ? 0 : v)), cutoff, fs, CFG.signal.padSamples);
    });

    // valid fraction
    const vr = DSP.resampleUniform(t, chan.valid, fs, t0, t1, CFG.signal.maxGapS).y;
    grid.valid = vr.map((v) => (v >= 0.5 ? 1 : 0));

    // facing direction f(t): sign of mean(toe_x - heel_x) over both feet
    const rawFacing = T.map((_, i) => {
      const lf = grid.l_toe_x[i] - grid.l_heel_x[i];
      const rf = grid.r_toe_x[i] - grid.r_heel_x[i];
      return Math.sign(lf + rf) || 1;
    });
    grid.facing = DSP.debounceSign(rawFacing, fs, 0.3, 0.25);

    // seated baseline: prefer pre-roll (t<0) median; else the calibration value
    // captured on S2 (live recording starts at GO with no pre-roll); else the
    // low percentile of hip height as a last resort.
    const preIdx = T.map((tt, i) => (tt < 0 ? i : -1)).filter((i) => i >= 0);
    let hipSeated = U.median(preIdx.map((i) => grid.hip_up[i]));
    if (hipSeated == null && meta && meta.calibration && meta.calibration.hip_up_seated_m != null) {
      hipSeated = meta.calibration.hip_up_seated_m;
    }
    if (hipSeated == null) hipSeated = DSP.percentile(grid.hip_up, 10);

    // standing hip height: refine from high percentile first, improved after segmentation
    const hipStandEst = DSP.percentile(grid.hip_up, 90);
    grid.hipSeated = hipSeated;
    grid.hipStand = hipStandEst;

    // hip progress p(t)
    const denom = (hipStandEst - hipSeated) || 1;
    grid.p = grid.hip_up.map((h) => (h - hipSeated) / denom);

    // trunk sign by facing
    grid.trunk = grid.trunk.map((v, i) => v * (grid.facing[i] >= 0 ? 1 : -1));
    grid.yawUnwrapped = DSP.unwrapDeg(grid.yaw);

    // --- path reconstruction (panning-safe) ---
    // Pelvis-relative stance-foot motion integrates to travelled distance.
    // walk_dir_out from meta/calibration or first-walk sign.
    grid.hipVelUp = DSP.derivative(grid.hip_up, fs);
    reconstructPath(grid, fs);

    grid.fs = fs;
    return grid;
  }

  // Reconstruct path s(t): cumulative forward travel. In pelvis-relative world
  // coords the stance foot slides backward as the body advances, so the pelvis
  // forward speed ≈ negative of stance-foot relative x-velocity. We detect the
  // grounded (more posterior-moving, lower) foot and integrate.
  function reconstructPath(grid, fs) {
    const n = grid.t.length;
    const s = new Array(n).fill(0);
    const vSigned = new Array(n).fill(0);   // signed body velocity along the image axis
    // Relative-to-pelvis velocity of each heel (world x). The STANCE foot is
    // planted on the ground, so in pelvis-relative coords it slides opposite to
    // body travel: body_velocity_along_axis = -(stance foot relative velocity).
    // This needs NO facing sign and works identically out and back.
    const vL = DSP.derivative(grid.l_heel_x, fs);
    const vR = DSP.derivative(grid.r_heel_x, fs);
    for (let i = 0; i < n; i++) {
      // grounded foot = lower one (larger world y). grid.*_heel_y = -world.y,
      // so the grounded foot has the SMALLER grid heel_y value.
      const lGrounded = grid.l_heel_y[i] <= grid.r_heel_y[i];
      const vFoot = lGrounded ? vL[i] : vR[i];
      vSigned[i] = -vFoot;                 // body velocity along +x image axis
      if (grid.p[i] < 0.3) vSigned[i] = 0; // not travelling while seated
    }
    // Establish the OUT direction from the net signed displacement early in the
    // walk (first ~1.5 s after movement starts), then express path as travel in
    // that direction: path rises on the way out, peaks at the cone, falls back.
    let early = 0;
    const startI = grid.p.findIndex((v) => v >= 0.9);
    const s0 = startI < 0 ? 0 : startI;
    for (let i = s0; i < Math.min(n, s0 + Math.round(1.5 * fs)); i++) early += vSigned[i];
    const outSign = early >= 0 ? 1 : -1;
    grid.walkDirOut = outSign;

    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) acc += vSigned[i] * outSign * (1 / fs);
      s[i] = acc;
    }
    grid.pathS = s;
    // vPath: positive = moving toward cone, negative = moving toward chair.
    grid.vPath = vSigned.map((v) => v * outSign);
  }

  /* ---- phase / event detection (10.2) ----------------------------------- */
  function detectEvents(grid) {
    const fs = grid.fs, T = grid.t, p = grid.p;
    const n = T.length;
    const ev = {};
    const E = CFG.events;

    const idxGo = T.findIndex((t) => t >= 0);
    const go = idxGo < 0 ? 0 : idxGo;
    ev.GO = { i: go, t: 0 };

    // SEAT_OFF: first p>=seatOffPct after GO
    let seatOff = -1;
    for (let i = go; i < n; i++) if (p[i] >= E.seatOffPct) { seatOff = i; break; }
    if (seatOff >= 0) ev.SEAT_OFF = { i: seatOff, t: T[seatOff] };

    // STANDING: first p>=standingPct (knee check relaxed on world data)
    let standing = -1;
    for (let i = (seatOff >= 0 ? seatOff : go); i < n; i++) if (p[i] >= E.standingPct) { standing = i; break; }
    if (standing >= 0) ev.STANDING = { i: standing, t: T[standing] };

    // furthest point (max path) between standing and end
    let far = standing >= 0 ? standing : go, maxS = -Infinity;
    for (let i = (standing >= 0 ? standing : go); i < n; i++) if (grid.pathS[i] > maxS) { maxS = grid.pathS[i]; far = i; }
    ev.TURN1_FAR = { i: far, t: T[far] };
    grid.maxPath = maxS;

    // median out/back walking speed for turn thresholds
    const walkSpeeds = [];
    for (let i = (standing >= 0 ? standing : go); i < far; i++) walkSpeeds.push(Math.abs(grid.vPath[i]));
    const medOut = U.median(walkSpeeds) || CFG.gait.minWalkSpeedMs;
    const backSpeeds = [];
    for (let i = far; i < n; i++) backSpeeds.push(Math.abs(grid.vPath[i]));
    const medBack = U.median(backSpeeds) || medOut;

    // TURN1_START: going back from far, last time out-speed >= frac*medOut
    let t1s = far;
    for (let i = far; i > (standing >= 0 ? standing : go); i--) {
      if (grid.vPath[i] >= E.turnSpeedFrac * medOut) { t1s = i; break; }
    }
    ev.TURN1_START = { i: t1s, t: T[t1s] };

    // TURN1_END: going forward from far, first time back-speed >= frac*medBack
    let t1e = far;
    for (let i = far; i < n; i++) {
      if (-grid.vPath[i] >= E.turnSpeedFrac * medBack) { t1e = i; break; }
    }
    ev.TURN1_END = { i: t1e, t: T[t1e] };

    // TURN2_START: after back walking near chair: back-speed falls below frac & s<1.0
    let t2s = -1;
    for (let i = t1e; i < n; i++) {
      if (-grid.vPath[i] < E.turnSpeedFrac * medBack && grid.pathS[i] < 1.0) { t2s = i; break; }
    }
    if (t2s < 0) {
      // fallback: facing flips back to walk_dir_out minus 0.2 s
      for (let i = t1e; i < n; i++) if (grid.facing[i] === grid.facing[go]) { t2s = Math.max(t1e, i - Math.round(0.2 * fs)); break; }
    }
    if (t2s < 0) t2s = t1e;
    ev.TURN2_START = { i: t2s, t: T[t2s] };

    // SIT_DESCENT_START: last p>=standingPct before final descent to seat contact
    // SEAT_CONTACT: first p<=sitContactPct with |hipVelUp|<thresh after descent
    let seatContact = -1;
    for (let i = t2s; i < n; i++) {
      if (p[i] <= E.sitContactPct && Math.abs(grid.hipVelUp[i]) < E.seatContactMaxSpeedMs) { seatContact = i; break; }
    }
    if (seatContact < 0) {
      // fallback: last sample where p minimal
      let minp = Infinity, mi = n - 1;
      for (let i = t2s; i < n; i++) if (p[i] < minp) { minp = p[i]; mi = i; }
      seatContact = mi;
    }
    let sitStart = -1;
    for (let i = seatContact; i > t2s; i--) if (p[i] >= E.standingPct) { sitStart = i; break; }
    if (sitStart < 0) sitStart = t2s;
    ev.SIT_DESCENT_START = { i: sitStart, t: T[sitStart] };
    ev.SEAT_CONTACT = { i: seatContact, t: T[seatContact] };
    ev.END = { i: Math.min(n - 1, seatContact + Math.round(CFG.protocol.tailS * fs)), t: T[Math.min(n - 1, seatContact + Math.round(CFG.protocol.tailS * fs))] };

    grid.medOut = medOut; grid.medBack = medBack;
    return ev;
  }

  function phaseLabels(grid, ev) {
    const n = grid.t.length;
    const labels = new Array(n).fill('SEATED_PRE');
    const seg = (fromKey, toKey, label) => {
      const a = ev[fromKey] ? ev[fromKey].i : null;
      const b = ev[toKey] ? ev[toKey].i : null;
      if (a == null || b == null) return;
      for (let i = a; i < b; i++) labels[i] = label;
    };
    seg('SEAT_OFF', 'STANDING', 'SIT_TO_STAND');
    seg('STANDING', 'TURN1_START', 'WALK_OUT');
    seg('TURN1_START', 'TURN1_END', 'TURN_1');
    seg('TURN1_END', 'TURN2_START', 'WALK_BACK');
    seg('TURN2_START', 'SIT_DESCENT_START', 'TURN_2');
    seg('SIT_DESCENT_START', 'SEAT_CONTACT', 'STAND_TO_SIT');
    if (ev.SEAT_CONTACT) for (let i = ev.SEAT_CONTACT.i; i < n; i++) labels[i] = 'SEATED_END';
    grid.phase = labels;
    return labels;
  }

  /* =======================================================================
   * M4 — gait events, steps/strides, velocity, symmetry, foot pattern,
   *      turn/STS/sit kinematics, QC, classification, full assembly.
   * ===================================================================== */

  // Zeni foot-ahead-of-pelvis signal in world coords (pelvis ~ origin on x).
  function gaitSignals(grid) {
    const n = grid.t.length;
    const out = grid.walkDirOut; // +1 / -1
    // d_seg flips per segment so HS are always maxima of g.
    const gL = new Array(n), gR = new Array(n);
    for (let i = 0; i < n; i++) {
      const ph = grid.phase[i];
      // direction of travel: OUT -> +out, BACK -> -out
      let dSeg = 0;
      if (ph === 'WALK_OUT') dSeg = out;
      else if (ph === 'WALK_BACK') dSeg = -out;
      else dSeg = out; // turns/other: nominal
      const hipMidX = grid.hip_x[i]; // ~0 in pelvis-origin world
      gL[i] = dSeg * (grid.l_heel_x[i] - hipMidX);
      gR[i] = dSeg * (grid.r_heel_x[i] - hipMidX);
    }
    grid.gL = gL; grid.gR = gR;
    return { gL, gR };
  }

  // Detect heel strikes (maxima) and toe-offs (minima) per foot within straight
  // segments. Returns arrays of {i, t, foot, segment, type}.
  function detectGaitEvents(grid) {
    const fs = grid.fs;
    gaitSignals(grid);
    const trunkLen = Math.abs(U.median(grid.sh_up) - 0) || 0.5; // sh_up ~ trunk length proxy
    const minSep = Math.round(CFG.gait.minHsIntervalS * fs);
    const minProm = CFG.gait.minProminenceTrunk * (U.median(grid.sh_up.map(Math.abs)) || 0.5);

    function segMask(label) {
      const idx = [];
      for (let i = 0; i < grid.phase.length; i++) if (grid.phase[i] === label) idx.push(i);
      return idx;
    }

    const events = [];
    ['WALK_OUT', 'WALK_BACK', 'TURN_1', 'TURN_2'].forEach((label) => {
      const idx = segMask(label);
      if (idx.length < 4) return;
      const a = idx[0], b = idx[idx.length - 1];
      ['l', 'r'].forEach((foot) => {
        const g = (foot === 'l' ? grid.gL : grid.gR).slice(a, b + 1);
        const hs = DSP.findPeaks(g, { minSep, minProminence: minProm });
        const to = DSP.findValleys(g, { minSep, minProminence: minProm });
        hs.forEach((p) => events.push({ i: a + p.index, t: grid.t[a + p.index], foot: foot === 'l' ? 'left' : 'right', segment: label, type: 'HS' }));
        to.forEach((p) => events.push({ i: a + p.index, t: grid.t[a + p.index], foot: foot === 'l' ? 'left' : 'right', segment: label, type: 'TO' }));
      });
    });
    events.sort((x, y) => x.i - y.i);
    grid.gaitEvents = events;
    return events;
  }

  // Build steps/strides from HS events. Step length/time between opposite feet;
  // stride between same-foot consecutive HS. Distances use the reconstructed
  // path coordinate (panning-safe).
  function buildSteps(grid) {
    const hs = grid.gaitEvents.filter((e) => e.type === 'HS');
    const to = grid.gaitEvents.filter((e) => e.type === 'TO');
    const steps = [];
    const lastSame = { left: null, right: null };
    let lastAny = null;

    hs.forEach((e, k) => {
      const step = {
        step_index: k,
        foot: e.foot,
        segment: e.segment,
        t_hs_s: e.t,
        heel_x_m_path: grid.pathS[e.i],
        included_in_means: (e.segment === 'OUT' || e.segment === 'BACK' || e.segment === 'WALK_OUT' || e.segment === 'WALK_BACK'),
        exclusion_reason: '',
      };
      // normalise segment names used in means
      step.segment = (e.segment === 'WALK_OUT') ? 'OUT' : (e.segment === 'WALK_BACK') ? 'BACK' : e.segment;
      step.included_in_means = (step.segment === 'OUT' || step.segment === 'BACK');
      if (!step.included_in_means) step.exclusion_reason = 'turn_overlap';

      // step time/length (opposite foot's previous HS)
      if (lastAny && lastAny.foot !== e.foot) {
        step.step_time_s = e.t - lastAny.t_hs_s;
        step.step_length_m = Math.abs(grid.pathS[e.i] - lastAny.heel_x_m_path);
      } else { step.step_time_s = null; step.step_length_m = null; }

      // stride (same foot). A stride is only valid when BOTH heel strikes fall
      // in the same straight segment — a stride whose previous same-foot HS was
      // before/within a turn would span the turn and is excluded (brief §10.4).
      const prevSame = lastSame[e.foot];
      if (prevSame && prevSame.segment === step.segment && (step.segment === 'OUT' || step.segment === 'BACK')) {
        step.stride_time_s = e.t - prevSame.t_hs_s;
        step.stride_length_m = Math.abs(grid.pathS[e.i] - prevSame.heel_x_m_path);
        step.stride_velocity_m_s = step.stride_time_s > 0 ? step.stride_length_m / step.stride_time_s : null;
        prevSame.t_to_next_same_foot_s = step.stride_time_s;
        step.t_to_prev_same_foot_s = step.stride_time_s;
      } else {
        step.stride_time_s = null; step.stride_length_m = null; step.stride_velocity_m_s = null;
        if (prevSame && prevSame.segment !== step.segment) step.exclusion_reason = step.exclusion_reason || 'turn_overlap';
      }

      // following toe-off
      const nextTo = to.find((x) => x.i > e.i && x.foot === e.foot);
      step.t_toe_off_s = nextTo ? nextTo.t : null;
      if (step.t_toe_off_s != null && step.stride_time_s) {
        step.stance_pct = U.clamp((step.t_toe_off_s - e.t) / step.stride_time_s * 100, 0, 100);
        step.swing_pct = 100 - step.stance_pct;
      } else { step.stance_pct = null; step.swing_pct = null; }

      // per-step kinematics
      step.knee_flex_swing_peak_deg = peakBetween(grid, e.foot === 'left' ? 'knee_l' : 'knee_r', e.i, nextTo ? nextTo.i : e.i + Math.round(0.4 * grid.fs));
      step.hip_flex_at_hs_deg = grid[e.foot === 'left' ? 'hip_flex_l' : 'hip_flex_r'][e.i];
      step.hip_ext_peak_deg = minBetween(grid, e.foot === 'left' ? 'hip_flex_l' : 'hip_flex_r', e.i, prevSame ? prevSame.i : e.i);
      step.trunk_incl_at_hs_deg = grid.trunk[e.i];

      lastSame[e.foot] = step;
      lastAny = step;
      steps.push(step);
    });

    // optional steady-state trimming
    if (CFG.gait.steadyStateOnly) {
      ['OUT', 'BACK'].forEach((seg) => {
        ['left', 'right'].forEach((foot) => {
          const segSteps = steps.filter((s) => s.segment === seg && s.foot === foot);
          if (segSteps.length >= 3) {
            segSteps[0].included_in_means = false; segSteps[0].exclusion_reason = 'first_last';
            segSteps[segSteps.length - 1].included_in_means = false; segSteps[segSteps.length - 1].exclusion_reason = 'first_last';
          }
        });
      });
    }

    grid.steps = steps;
    return steps;
  }

  function peakBetween(grid, key, a, b) {
    let mx = -Infinity; for (let i = a; i <= b && i < grid[key].length; i++) if (grid[key][i] > mx) mx = grid[key][i];
    return isFinite(mx) ? mx : null;
  }
  function minBetween(grid, key, a, b) {
    let mn = Infinity; const lo = Math.min(a, b), hi = Math.max(a, b);
    for (let i = lo; i <= hi && i < grid[key].length; i++) if (grid[key][i] < mn) mn = grid[key][i];
    return isFinite(mn) ? mn : null;
  }

  function strideMeans(steps, foot) {
    const s = steps.filter((x) => x.included_in_means && (foot ? x.foot === foot : true));
    return {
      len: U.mean(s.map((x) => x.stride_length_m)),
      time: U.mean(s.map((x) => x.stride_time_s)),
      count: s.filter((x) => x.stride_length_m != null).length,
    };
  }

  /* ---- summary assembly ------------------------------------------------- */
  function computeSummary(grid, ev, meta) {
    const S = {};
    const T = (k) => (ev[k] ? ev[k].t : null);
    const totalTime = T('SEAT_CONTACT');
    S.total_time_taken_s = U.round(totalTime, 2);
    S.reaction_time_s = U.round(T('SEAT_OFF'), 2);
    S.total_time_from_seat_off_s = (T('SEAT_CONTACT') != null && T('SEAT_OFF') != null) ? U.round(T('SEAT_CONTACT') - T('SEAT_OFF'), 2) : null;

    // event times
    S.t_seat_off_s = U.round(T('SEAT_OFF'), 2);
    S.t_standing_s = U.round(T('STANDING'), 2);
    S.t_walk_start_s = U.round(T('WALK_START'), 2);
    S.t_turn1_start_s = U.round(T('TURN1_START'), 2);
    S.t_turn1_end_s = U.round(T('TURN1_END'), 2);
    S.t_turn2_start_s = U.round(T('TURN2_START'), 2);
    S.t_sit_descent_start_s = U.round(T('SIT_DESCENT_START'), 2);
    S.t_seat_contact_s = U.round(T('SEAT_CONTACT'), 2);

    // phase durations
    const dur = (a, b) => (T(a) != null && T(b) != null) ? (T(b) - T(a)) : null;
    S.time_seated_to_full_extension_s = U.round(dur('SEAT_OFF', 'STANDING'), 2);
    S.time_walk_out_s = U.round(dur('STANDING', 'TURN1_START'), 2);
    S.time_around_cone_s = U.round(dur('TURN1_START', 'TURN1_END'), 2);
    S.time_walk_back_s = U.round(dur('TURN1_END', 'TURN2_START'), 2);
    S.time_turn_to_sit_s = U.round(dur('TURN2_START', 'SIT_DESCENT_START'), 2);
    S.time_to_sitting_down_s = U.round(dur('SIT_DESCENT_START', 'SEAT_CONTACT'), 2);

    if (totalTime) {
      const stS = dur('SEAT_OFF', 'STANDING') || 0;
      const walk = (dur('STANDING', 'TURN1_START') || 0) + (dur('TURN1_END', 'TURN2_START') || 0);
      const turns = (dur('TURN1_START', 'TURN1_END') || 0) + (dur('TURN2_START', 'SIT_DESCENT_START') || 0);
      const sit = dur('SIT_DESCENT_START', 'SEAT_CONTACT') || 0;
      S.pct_sit_to_stand = U.round(stS / totalTime * 100, 1);
      S.pct_walk = U.round(walk / totalTime * 100, 1);
      S.pct_turns = U.round(turns / totalTime * 100, 1);
      S.pct_stand_to_sit = U.round(sit / totalTime * 100, 1);
    }

    // gait summary
    const steps = grid.steps;
    const all = strideMeans(steps);
    const lft = strideMeans(steps, 'left');
    const rgt = strideMeans(steps, 'right');
    S.average_stride_length_m = U.round(all.len, 3);
    S.average_stride_time_s = U.round(all.time, 3);
    S.average_left_stride_length_m = U.round(lft.len, 3);
    S.average_left_stride_time_s = U.round(lft.time, 3);
    S.average_right_stride_length_m = U.round(rgt.len, 3);
    S.average_right_stride_time_s = U.round(rgt.time, 3);
    S.n_strides_left = lft.count;
    S.n_strides_right = rgt.count;

    const incl = steps.filter((x) => x.included_in_means);
    S.n_strides_included = incl.filter((x) => x.stride_length_m != null).length;
    S.n_strides_excluded = steps.length - S.n_strides_included;
    S.n_steps_total = steps.length;
    S.n_steps_out = steps.filter((x) => x.segment === 'OUT').length;
    S.n_steps_back = steps.filter((x) => x.segment === 'BACK').length;

    // step means L/R
    const stepL = steps.filter((x) => x.foot === 'left' && x.step_length_m != null && x.included_in_means);
    const stepR = steps.filter((x) => x.foot === 'right' && x.step_length_m != null && x.included_in_means);
    S.step_length_left_mean_m = U.round(U.mean(stepL.map((x) => x.step_length_m)), 3);
    S.step_length_right_mean_m = U.round(U.mean(stepR.map((x) => x.step_length_m)), 3);
    S.step_time_left_mean_s = U.round(U.mean(stepL.map((x) => x.step_time_s)), 3);
    S.step_time_right_mean_s = U.round(U.mean(stepR.map((x) => x.step_time_s)), 3);

    // cadence over straight walking
    const walkTime = (S.time_walk_out_s || 0) + (S.time_walk_back_s || 0);
    S.cadence_steps_min = walkTime > 0 ? U.round(S.n_steps_total / walkTime * 60, 1) : null;

    // variability (>=4 strides)
    const strideLens = incl.map((x) => x.stride_length_m).filter((v) => v != null);
    const strideTimes = incl.map((x) => x.stride_time_s).filter((v) => v != null);
    S.stride_length_cv_pct = strideLens.length >= 4 ? U.round(U.sd(strideLens) / U.mean(strideLens) * 100, 1) : null;
    S.stride_time_cv_pct = strideTimes.length >= 4 ? U.round(U.sd(strideTimes) / U.mean(strideTimes) * 100, 1) : null;

    // symmetry
    S.stride_length_asym_pct = U.round(U.asymPct(lft.len, rgt.len), 1);
    S.stride_time_asym_pct = U.round(U.asymPct(lft.time, rgt.time), 1);
    S.step_length_asym_pct = U.round(U.asymPct(S.step_length_left_mean_m, S.step_length_right_mean_m), 1);
    S.step_time_asym_pct = U.round(U.asymPct(S.step_time_left_mean_s, S.step_time_right_mean_s), 1);

    // velocity
    S.walk_out_velocity_m_s = segVelocity(grid, steps, 'OUT');
    S.walk_back_velocity_m_s = segVelocity(grid, steps, 'BACK');
    const vals = [S.walk_out_velocity_m_s, S.walk_back_velocity_m_s].filter((v) => v != null);
    S.gait_velocity_m_s = vals.length ? U.round(U.mean(vals), 3) : null;
    const nominalDenom = (S.time_walk_out_s || 0) + (S.time_walk_back_s || 0);
    S.gait_velocity_nominal_m_s = nominalDenom > 0 ? U.round(2 * (meta.course_length_m || CFG.protocol.courseLengthM) / nominalDenom, 3) : null;
    if (S.walk_out_velocity_m_s && S.walk_back_velocity_m_s) {
      S.velocity_change_pct = U.round((S.walk_back_velocity_m_s - S.walk_out_velocity_m_s) / S.walk_out_velocity_m_s * 100, 1);
    }

    // foot pattern
    footPattern(grid, S);

    // turns
    turnMetrics(grid, ev, S);

    // STS / sit / gait kinematics
    stsMetrics(grid, ev, S, meta);
    sitMetrics(grid, ev, S);
    gaitKinematics(grid, S);

    // calibration descriptors
    S.dominant_side = (meta.calibration && meta.calibration.dominant_side) || grid.dominant || 'left';
    S.calib_hip_up_seated_m = U.round(grid.hipSeated, 3);
    S.calib_hip_up_stand_m = U.round(grid.hipStand, 3);
    S.walk_dir_out = grid.walkDirOut >= 0 ? 'left_to_right' : 'right_to_left';

    return S;
  }

  function segVelocity(grid, steps, seg) {
    const s = steps.filter((x) => x.segment === seg && x.heel_x_m_path != null);
    if (s.length < 2) return null;
    const first = s[0], last = s[s.length - 1];
    const dist = Math.abs(last.heel_x_m_path - first.heel_x_m_path);
    const time = last.t_hs_s - first.t_hs_s;
    return time > 0 ? U.round(dist / time, 3) : null;
  }

  function footPattern(grid, S) {
    const ge = grid.gaitEvents;
    const firstTOAfterStand = ge.find((e) => e.type === 'TO' && (e.segment === 'WALK_OUT'));
    S.first_foot_walk = firstTOAfterStand ? firstTOAfterStand.foot : '';
    const outHS = ge.filter((e) => e.type === 'HS' && e.segment === 'WALK_OUT');
    S.last_foot_walk = outHS.length ? outHS[outHS.length - 1].foot : '';
    const coneTO = ge.find((e) => e.type === 'TO' && e.segment === 'TURN_1');
    S.first_foot_around_cone = coneTO ? coneTO.foot : '';
    const beforeSitTO = ge.filter((e) => e.type === 'TO' && (e.segment === 'WALK_BACK' || e.segment === 'TURN_2'));
    S.last_foot_turn_before_sitting = beforeSitTO.length ? beforeSitTO[beforeSitTO.length - 1].foot : '';
  }

  function turnMetrics(grid, ev, S) {
    const fs = grid.fs;
    const yawRate = DSP.derivative(grid.yawUnwrapped, fs);
    function doTurn(aKey, bKey, prefix) {
      if (!ev[aKey] || !ev[bKey]) return;
      const a = ev[aKey].i, b = Math.max(ev[aKey].i + 1, ev[bKey].i);
      const dur = grid.t[b] - grid.t[a];
      const slice = yawRate.slice(a, b + 1).map(Math.abs);
      const hsInTurn = grid.gaitEvents.filter((e) => e.type === 'HS' && e.i >= a && e.i <= b).length;
      S[prefix + '_n_steps'] = hsInTurn;
      S[prefix + '_yaw_change_deg'] = U.round(Math.abs(grid.yawUnwrapped[b] - grid.yawUnwrapped[a]), 1);
      S[prefix + '_peak_yaw_rate_deg_s'] = U.round(Math.max.apply(null, slice.length ? slice : [0]), 1);
      S[prefix + '_mean_yaw_rate_deg_s'] = dur > 0 ? U.round(S[prefix + '_yaw_change_deg'] / dur, 1) : null;
      S[prefix + '_yaw_rate_peaks'] = DSP.findPeaks(yawRate.slice(a, b + 1), { minSep: Math.round(0.2 * fs), minProminence: 20 }).length;
    }
    doTurn('TURN1_START', 'TURN1_END', 'turn1');
    doTurn('TURN2_START', 'SIT_DESCENT_START', 'turn2');
  }

  function stsMetrics(grid, ev, S, meta) {
    if (!ev.SEAT_OFF || !ev.STANDING) return;
    const a = ev.SEAT_OFF.i, b = ev.STANDING.i, fs = grid.fs;
    S.sts_hip_rise_m = U.round(grid.hip_up[b] - grid.hip_up[a], 3);
    S.sts_ascent_time_s = U.round(grid.t[b] - grid.t[a], 2);
    const vel = DSP.derivative(grid.hip_up, fs);
    S.sts_peak_ascent_velocity_m_s = U.round(Math.max.apply(null, vel.slice(a, b + 1)), 3);
    S.sts_mean_ascent_velocity_m_s = S.sts_ascent_time_s > 0 ? U.round(S.sts_hip_rise_m / S.sts_ascent_time_s, 3) : null;
    const side = (S.dominant_side === 'right') ? 'r' : 'l';
    S.sts_knee_flex_seatoff_deg = U.round(grid['knee_' + side][a], 1);
    S.sts_knee_flex_standing_deg = U.round(grid['knee_' + side][b], 1);
    S.sts_knee_rom_deg = U.round(grid['knee_' + side][a] - grid['knee_' + side][b], 1);
    const kneeVel = DSP.derivative(grid['knee_' + side], fs).slice(a, b + 1).map(Math.abs);
    S.sts_knee_ext_peak_vel_deg_s = U.round(Math.max.apply(null, kneeVel.length ? kneeVel : [0]), 1);
    S.sts_hip_flex_seatoff_deg = U.round(grid['hip_flex_' + side][a], 1);
    S.sts_hip_flex_standing_deg = U.round(grid['hip_flex_' + side][b], 1);
    const hipVel = DSP.derivative(grid['hip_flex_' + side], fs).slice(a, b + 1).map(Math.abs);
    S.sts_hip_ext_peak_vel_deg_s = U.round(Math.max.apply(null, hipVel.length ? hipVel : [0]), 1);
    S.sts_trunk_lean_peak_deg = U.round(Math.max.apply(null, grid.trunk.slice(a, b + 1)), 1);
    S.sts_trunk_incl_standing_deg = U.round(grid.trunk[b], 1);
    if (meta.body_mass_kg) {
      S.sts_work_rate_proxy_w = S.sts_ascent_time_s > 0 ? U.round(meta.body_mass_kg * 9.81 * S.sts_hip_rise_m / S.sts_ascent_time_s, 1) : null;
    } else S.sts_work_rate_proxy_w = null;
    S.sts_arm_push_suspected = false;
  }

  function sitMetrics(grid, ev, S) {
    if (!ev.SIT_DESCENT_START || !ev.SEAT_CONTACT) return;
    const a = ev.SIT_DESCENT_START.i, b = ev.SEAT_CONTACT.i, fs = grid.fs;
    S.sit_descent_time_s = U.round(grid.t[b] - grid.t[a], 2);
    const vel = DSP.derivative(grid.hip_up, fs).slice(a, b + 1).map((v) => -v).filter((v) => v > 0);
    S.sit_peak_descent_velocity_m_s = U.round(Math.max.apply(null, vel.length ? vel : [0]), 3);
    const drop = grid.hip_up[a] - grid.hip_up[b];
    S.sit_mean_descent_velocity_m_s = S.sit_descent_time_s > 0 ? U.round(drop / S.sit_descent_time_s, 3) : null;
    S.sit_controlled_descent_index = (S.sit_mean_descent_velocity_m_s > 0) ? U.round(S.sit_peak_descent_velocity_m_s / S.sit_mean_descent_velocity_m_s, 2) : null;
    S.sit_trunk_lean_peak_deg = U.round(Math.max.apply(null, grid.trunk.slice(a, b + 1)), 1);
    const side = (S.dominant_side === 'right') ? 'r' : 'l';
    S.sit_knee_flex_at_contact_deg = U.round(grid['knee_' + side][b], 1);
  }

  function gaitKinematics(grid, S) {
    const steps = grid.steps.filter((x) => x.included_in_means);
    const byFoot = (foot, key) => U.mean(steps.filter((x) => x.foot === foot).map((x) => x[key]));
    S.knee_flex_swing_peak_left_deg = U.round(byFoot('left', 'knee_flex_swing_peak_deg'), 1);
    S.knee_flex_swing_peak_right_deg = U.round(byFoot('right', 'knee_flex_swing_peak_deg'), 1);
    S.hip_flex_peak_left_deg = U.round(byFoot('left', 'hip_flex_at_hs_deg'), 1);
    S.hip_flex_peak_right_deg = U.round(byFoot('right', 'hip_flex_at_hs_deg'), 1);
    S.hip_ext_peak_left_deg = U.round(byFoot('left', 'hip_ext_peak_deg'), 1);
    S.hip_ext_peak_right_deg = U.round(byFoot('right', 'hip_ext_peak_deg'), 1);
    S.hip_rom_left_deg = (S.hip_flex_peak_left_deg != null && S.hip_ext_peak_left_deg != null) ? U.round(S.hip_flex_peak_left_deg - S.hip_ext_peak_left_deg, 1) : null;
    S.hip_rom_right_deg = (S.hip_flex_peak_right_deg != null && S.hip_ext_peak_right_deg != null) ? U.round(S.hip_flex_peak_right_deg - S.hip_ext_peak_right_deg, 1) : null;
    // trunk over straight segments
    const walkIdx = grid.phase.map((p, i) => ((p === 'WALK_OUT' || p === 'WALK_BACK') ? i : -1)).filter((i) => i >= 0);
    const trunkVals = walkIdx.map((i) => grid.trunk[i]);
    S.trunk_incl_walk_mean_deg = U.round(U.mean(trunkVals), 1);
    S.trunk_incl_walk_sd_deg = U.round(U.sd(trunkVals), 1);
    // hip vertical oscillation: peak-to-peak hip_up per stride (approx over walk)
    const hipWalk = walkIdx.map((i) => grid.hip_up[i]);
    S.hip_vertical_osc_m = hipWalk.length ? U.round(Math.max.apply(null, hipWalk) - Math.min.apply(null, hipWalk), 3) : null;
    // arm swing amplitude (wrist x rel shoulder, peak-to-peak / trunk len)
    const trunkLen = Math.abs(U.median(grid.sh_up)) || 0.5;
    const armL = walkIdx.map((i) => grid.l_wr_x[i] - grid.hip_x[i]);
    const armR = walkIdx.map((i) => grid.r_wr_x[i] - grid.hip_x[i]);
    S.arm_swing_amp_left_trunklen = armL.length ? U.round((Math.max.apply(null, armL) - Math.min.apply(null, armL)) / trunkLen, 2) : null;
    S.arm_swing_amp_right_trunklen = armR.length ? U.round((Math.max.apply(null, armR) - Math.min.apply(null, armR)) / trunkLen, 2) : null;
  }

  /* ---- QC flags --------------------------------------------------------- */
  function computeQC(grid, ev, meta, S) {
    const flags = [];
    const fs = grid.fs;
    // valid frame pct over test window
    const a = ev.GO ? ev.GO.i : 0, b = ev.SEAT_CONTACT ? ev.SEAT_CONTACT.i : grid.t.length - 1;
    const win = grid.valid.slice(a, b + 1);
    const validPct = win.length ? win.reduce((s, v) => s + v, 0) / win.length * 100 : 0;
    S.valid_frame_pct = U.round(validPct, 1);
    const gapWin = grid.gap.slice(a, b + 1);
    const imputedPct = gapWin.length ? gapWin.reduce((s, v) => s + (v ? 1 : 0), 0) / gapWin.length * 100 : 0;
    S.imputed_sample_pct = U.round(imputedPct, 1);
    // longest gap
    let longest = 0, run = 0;
    gapWin.forEach((g) => { if (g) { run++; longest = Math.max(longest, run); } else run = 0; });
    S.longest_gap_s = U.round(longest / fs, 2);
    S.median_chain_visibility = U.round(U.median(grid.valid), 2);
    S.view_obliquity_median = U.round(U.median(grid.hip_sep.map((v, i) => v / (Math.abs(grid.sh_up[i]) || 0.5))), 2);
    // depth drift: chain length variation over walk
    const chainWalk = grid.phase.map((p, i) => ((p === 'WALK_OUT' || p === 'WALK_BACK') ? grid.chain[i] : null)).filter((v) => v != null);
    const chainMean = U.mean(chainWalk);
    S.depth_drift_pct = (chainMean && chainWalk.length) ? U.round((Math.max.apply(null, chainWalk) - Math.min.apply(null, chainWalk)) / chainMean * 100, 1) : null;
    S.knee_2d_3d_diff_deg = null; // 2D not computed separately in world-only mode
    S.lr_swap_corrections = grid.lrSwaps || 0;
    S.camera_yaw_rate_median_deg_s = grid.camYawMedian != null ? U.round(grid.camYawMedian, 1) : null;

    // BLOCKING
    if (S.effective_fs_hz != null && S.effective_fs_hz < CFG.qc.minFps) flags.push('LOW_FPS');
    if (validPct < CFG.qc.minValidFramePct) flags.push('LOW_VALID_FRAMES');
    if (imputedPct > CFG.qc.maxImputedPct || S.longest_gap_s > CFG.qc.maxGapS) flags.push('TRACKING_GAPS');
    if (!ev.SEAT_OFF) flags.push('EVENT_MISSING:SEAT_OFF');
    if (!ev.STANDING) flags.push('EVENT_MISSING:STANDING');
    if (!ev.TURN1_START || !ev.TURN1_END) flags.push('EVENT_MISSING:TURN1');
    if (!ev.SEAT_CONTACT) flags.push('EVENT_MISSING:SEAT_CONTACT');
    if (grid.maxPath != null && grid.maxPath < CFG.qc.courseCompletedFrac * (meta.course_length_m || CFG.protocol.courseLengthM)) flags.push('COURSE_NOT_COMPLETED');
    if (S.sts_hip_rise_m != null && (S.sts_hip_rise_m < CFG.qc.hipRiseMinM || S.sts_hip_rise_m > CFG.qc.hipRiseMaxM)) flags.push('HIP_RISE_IMPLAUSIBLE');
    if (meta.manual_stop) flags.push('MANUAL_STOP');

    // NON-BLOCKING
    if (S.view_obliquity_median != null && S.view_obliquity_median > CFG.qc.maxObliquity) flags.push('OBLIQUE_VIEW');
    if (S.depth_drift_pct != null && S.depth_drift_pct > CFG.qc.maxDepthDriftPct) flags.push('DEPTH_DRIFT');
    if ((S.n_strides_left || 0) < 2 || (S.n_strides_right || 0) < 2) flags.push('FEW_STRIDES');
    if (grid.camYawMedian != null && grid.camYawMedian > CFG.panning.maxCameraYawRateDegS) flags.push('CAMERA_PAN_FAST');
    if (meta.calibration && meta.calibration.method === 'world' && !(meta.calibration.course_px)) { /* world scale ok */ }

    const BLOCKING = ['LOW_FPS', 'LOW_VALID_FRAMES', 'TRACKING_GAPS', 'NOT_SEATED_AT_START', 'MOVED_BEFORE_GO', 'MANUAL_STOP', 'COURSE_NOT_COMPLETED', 'CAMERA_MOVED', 'FACING_PATTERN_UNEXPECTED', 'HIP_RISE_IMPLAUSIBLE', 'PARTICIPANT_LEFT_FRAME'];
    const isBlocking = (f) => BLOCKING.indexOf(f) >= 0 || f.indexOf('EVENT_MISSING') === 0;
    S.qc_flags = flags.join(';');
    S.qc_pass = !flags.some(isBlocking);
    return flags;
  }

  /* ---- classification & norms ------------------------------------------- */
  function classify(S, meta) {
    const t = S.total_time_taken_s;
    if (t == null) { S.fall_risk_cdc = null; S.fall_risk_tier = null; return; }
    S.fall_risk_cdc = (t >= CFG.protocol.fallRiskCdcS) ? 'At risk' : 'Not at risk (CDC cut-point)';
    S.fall_risk_tier = (t < CFG.risk.tierLowBelowS) ? 'low' : (t < CFG.risk.tierHighAtS ? 'moderate' : 'high');
    S.fall_probability = null; // server model unavailable
    S.alt_cutoff_flag_13_5 = (t >= CFG.protocol.altCutoffS);
    S.mobility_category = (t < 10) ? 'freely mobile' : (t < 20) ? 'mostly independent' : (t < 30) ? 'variable mobility, may need assistance' : 'impaired mobility';

    // age-band norm (Bohannon 2006)
    const age = meta.age_years;
    const bands = CFG.norms.bohannon2006;
    let band = null, bandKey = null;
    Object.keys(bands).forEach((k) => { const bb = bands[k]; if (age != null && age >= bb.low && age <= bb.high) { band = bb; bandKey = k; } });
    if (band) {
      S.age_norm_band = bandKey;
      S.age_norm_mean_s = band.mean;
      S.age_norm_ci_low_s = band.ciLow;
      S.age_norm_ci_high_s = band.ciHigh;
      S.age_norm_comparison = (t < band.ciLow) ? 'Faster' : (t > band.ciHigh ? 'Slower' : 'Within');
    } else {
      S.age_norm_band = null; S.age_norm_mean_s = null; S.age_norm_ci_low_s = null; S.age_norm_ci_high_s = null; S.age_norm_comparison = null;
    }

    const checks = meta.checks || {};
    const checksOk = checks.safety && checks.chair && checks.course && checks.footwear && checks.practice;
    S.valid_for_norm = !!(S.qc_pass && checksOk && (meta.test_outcome === 'completed') && age != null && age >= 60 && band);
  }

  /* ---- build Events / Frames export tables ------------------------------ */
  function buildEventsTable(grid, ev, sessionId) {
    const rows = [];
    let idx = 0;
    const order = ['GO', 'SEAT_OFF', 'STANDING', 'WALK_START', 'TURN1_START', 'TURN1_FAR', 'TURN1_END', 'TURN2_START', 'SIT_DESCENT_START', 'SEAT_CONTACT', 'END'];
    order.forEach((code) => {
      if (!ev[code]) return;
      const i = ev[code].i;
      rows.push({ session_id: sessionId, event_index: idx++, event_code: code, t_s: U.round(ev[code].t, 3), path_s_m: U.round(grid.pathS[i], 3), hip_progress: U.round(grid.p[i], 3), facing: grid.facing[i], note: '' });
    });
    // gait events
    grid.gaitEvents.forEach((e) => {
      const code = (e.type === 'HS' ? 'HS_' : 'TO_') + (e.foot === 'left' ? 'L' : 'R');
      rows.push({ session_id: sessionId, event_index: idx++, event_code: code, t_s: U.round(e.t, 3), path_s_m: U.round(grid.pathS[e.i], 3), hip_progress: U.round(grid.p[e.i], 3), facing: grid.facing[e.i], note: e.segment });
    });
    rows.sort((a, b) => a.t_s - b.t_s);
    rows.forEach((r, i) => r.event_index = i);
    return rows;
  }

  function buildFramesTable(grid, sessionId) {
    const rows = [];
    const fs = grid.fs;
    const kneeVelL = DSP.derivative(grid.knee_l, fs);
    const kneeVelR = DSP.derivative(grid.knee_r, fs);
    const yawRate = DSP.derivative(grid.yawUnwrapped, fs);
    for (let i = 0; i < grid.t.length; i++) {
      rows.push({
        session_id: sessionId, t_s: U.round(grid.t[i], 3), phase: grid.phase[i], tracking_gap: !!grid.gap[i],
        facing: grid.facing[i], progress: U.round(grid.p[i], 3), hip_up_m: U.round(grid.hip_up[i], 3),
        path_s_m: U.round(grid.pathS[i], 3), hip_vel_up_m_s: U.round(grid.hipVelUp[i], 3), hip_vel_path_m_s: U.round(grid.vPath[i], 3),
        knee_flex_l_deg: U.round(grid.knee_l[i], 1), knee_flex_r_deg: U.round(grid.knee_r[i], 1),
        hip_flex_l_deg: U.round(grid.hip_flex_l[i], 1), hip_flex_r_deg: U.round(grid.hip_flex_r[i], 1),
        knee_vel_l_deg_s: U.round(kneeVelL[i], 1), knee_vel_r_deg_s: U.round(kneeVelR[i], 1),
        trunk_incl_deg: U.round(grid.trunk[i], 1), shank_incl_l_deg: null, shank_incl_r_deg: null,
        torso_yaw_deg: U.round(grid.yawUnwrapped[i], 1), torso_yaw_rate_deg_s: U.round(yawRate[i], 1),
        g_left_m: U.round(grid.gL ? grid.gL[i] : null, 3), g_right_m: U.round(grid.gR ? grid.gR[i] : null, 3),
        arm_dev_l: U.round(grid.l_wr_x[i] - grid.hip_x[i], 3), arm_dev_r: U.round(grid.r_wr_x[i] - grid.hip_x[i], 3),
        obliquity: U.round(grid.hip_sep[i] / (Math.abs(grid.sh_up[i]) || 0.5), 2), chain_px: U.round(grid.chain[i], 3),
        cam_yaw_rate_deg_s: null,
      });
    }
    return rows;
  }

  function buildStepsTable(grid, sessionId) {
    return grid.steps.map((s) => ({
      session_id: sessionId, step_index: s.step_index, foot: s.foot, segment: s.segment,
      t_hs_s: U.round(s.t_hs_s, 3), t_to_prev_same_foot_s: U.round(s.t_to_prev_same_foot_s, 3), t_to_next_same_foot_s: U.round(s.t_to_next_same_foot_s, 3),
      heel_x_m_path: U.round(s.heel_x_m_path, 3), step_time_s: U.round(s.step_time_s, 3), step_length_m: U.round(s.step_length_m, 3),
      stride_time_s: U.round(s.stride_time_s, 3), stride_length_m: U.round(s.stride_length_m, 3), stride_velocity_m_s: U.round(s.stride_velocity_m_s, 3),
      t_toe_off_s: U.round(s.t_toe_off_s, 3), stance_pct: U.round(s.stance_pct, 1), swing_pct: U.round(s.swing_pct, 1),
      knee_flex_swing_peak_deg: U.round(s.knee_flex_swing_peak_deg, 1), hip_flex_at_hs_deg: U.round(s.hip_flex_at_hs_deg, 1),
      hip_ext_peak_deg: U.round(s.hip_ext_peak_deg, 1), trunk_incl_at_hs_deg: U.round(s.trunk_incl_at_hs_deg, 1),
      included_in_means: s.included_in_means, exclusion_reason: s.exclusion_reason,
    }));
  }

  /* ---- authoritative full run() ----------------------------------------- */
  function run(frames, meta) {
    meta = meta || {};
    const grid = prepare(frames, meta);
    if (!grid) return null;
    const ev = detectEvents(grid);
    phaseLabels(grid, ev);
    detectGaitEvents(grid);
    buildSteps(grid);

    const sessionId = meta.session_id || (U.uuid());
    const S = computeSummary(grid, ev, meta);
    S.effective_fs_hz = meta.effective_fs_hz != null ? meta.effective_fs_hz : CFG.signal.resampleHz;
    computeQC(grid, ev, meta, S);
    classify(S, meta);

    return {
      sessionId,
      summary: S,
      events: buildEventsTable(grid, ev, sessionId),
      steps: buildStepsTable(grid, sessionId),
      frames: buildFramesTable(grid, sessionId),
      grid, ev,
    };
  }

  /* ---- public (M3 partial): prepare + events ---------------------------- */
  function runPartial(frames, meta) {
    const grid = prepare(frames, meta || {});
    if (!grid) return null;
    const ev = detectEvents(grid);
    phaseLabels(grid, ev);
    return { grid, ev };
  }

  global.TUGAnalysis = Object.assign(global.TUGAnalysis || {}, {
    _internal: { extract, prepare, detectEvents, phaseLabels, reconstructPath, detectGaitEvents, buildSteps, computeSummary, computeQC, classify, IDX, kneeFlex, hipFlex, trunkIncl, torsoYaw },
    run,
    runPartial,
  });
})(typeof window !== 'undefined' ? window : globalThis);
