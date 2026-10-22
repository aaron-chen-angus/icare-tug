/* =============================================================================
 * TUG//LAB — tests/synth.js
 * Synthetic ground-truth TUG landmark generator.
 *
 * Produces a frame sequence compatible with the analysis engine input:
 *   frames[i] = { tMs, image:[33]{x,y,z,visibility}, world:[33]{x,y,z,visibility} }
 * plus a `truth` object with known event times, stride lengths/times, foot-first
 * labels and total time.
 *
 * Model (seated pre-roll -> sit-to-stand -> walk out -> turn -> walk back ->
 * turn -> stand-to-sit). Designed for the OPERATOR-FOLLOWING camera: WORLD
 * landmarks are pelvis-relative and metric (as MediaPipe emits), so camera
 * panning does not affect them. The subject's absolute world position is kept
 * internally only to drive stance-foot-relative motion (the signal analysis
 * actually consumes).
 *
 * Conventions (match MediaPipe world): origin = pelvis mid; metres; x = body
 * left(-)/right(+) which aligns with the walking axis in side view; y DOWN
 * positive; z toward camera. Walking direction sign = dir (+1 left->right).
 * ========================================================================== */
(function (global) {
  'use strict';

  const IDX = {
    nose: 0, l_sh: 11, r_sh: 12, l_el: 13, r_el: 14, l_wr: 15, r_wr: 16,
    l_hip: 23, r_hip: 24, l_kn: 25, r_kn: 26, l_an: 27, r_an: 28,
    l_heel: 29, r_heel: 30, l_toe: 31, r_toe: 32,
  };

  function emptyLm() {
    const a = new Array(33);
    for (let i = 0; i < 33; i++) a[i] = { x: 0, y: 0, z: 0, visibility: 1 };
    return a;
  }

  // Default anthropometry (metres), pelvis-relative world offsets when standing.
  function seg(height) {
    const h = height || 1.70;
    return {
      shoulderUp: 0.52 * h / 1.70,   // hip->shoulder vertical
      hipHalf: 0.09,                 // half hip width (x)
      thigh: 0.245 * h / 1.70,
      shank: 0.246 * h / 1.70,
      foot: 0.15,
      noseUp: 0.72 * h / 1.70,
      arm: 0.30 * h / 1.70,
    };
  }

  function cos01(t) { return (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, t)))) / 2; }

  /* ---- main generator ---------------------------------------------------
   * opts: {
   *   fs, height, dir(+1/-1), preRollS, stsT, walkSteps, strideLen, strideT,
   *   turnT, asymLen(0..), asymTime, stsSitT, noiseSigma, dropoutS, front,
   *   occludeFar, lateStartS, course(m)
   * }
   */
  function generate(opts) {
    opts = opts || {};
    const fs = opts.fs || 30;
    const H = opts.height || 1.70;
    const dir = opts.dir || 1;
    const preRollS = opts.preRollS != null ? opts.preRollS : 1.5;
    const stsT = opts.stsT || 1.2;
    const strideLen = opts.strideLen || 1.2;      // m (per stride = 2 steps)
    const strideT = opts.strideT || 1.1;          // s
    const asymLen = opts.asymLen || 0;            // fractional L/R difference
    const asymTime = opts.asymTime || 0;
    const turnT = opts.turnT || 1.4;
    const stsSitT = opts.stsSitT || 1.3;
    const course = opts.course || 3.0;
    const noise = opts.noiseSigma || 0;
    const front = !!opts.front;
    const occludeFar = !!opts.occludeFar;
    const s = seg(H);

    // Number of steps to cover the course (one way). Step length = strideLen/2.
    const stepLen = strideLen / 2;
    const nStepsOneWay = Math.max(2, Math.round(course / stepLen));

    const frames = [];
    const events = []; // {code, t}
    const hsTruth = []; // {foot, t, segment}
    let tS = -preRollS;
    const dt = 1 / fs;

    // State we track to build pelvis-relative world landmarks:
    //   pelvisAbs: absolute horizontal position of pelvis along walking axis (m)
    //   hipUp: pelvis height above ground (m); seated lower than standing
    //   phase label
    const standHip = 0.92 * H / 1.70; // pelvis height standing
    const seatHip = 0.55 * H / 1.70;  // pelvis height seated
    let pelvisAbs = 0;

    function pushFrame(label, pelvisAbsPos, hipUp, footPlant, facing, armPhase, kneeFlexExtra) {
      // footPlant: { l:{abs, down}, r:{abs, down} } absolute foot x and whether on ground
      const world = emptyLm();
      const image = emptyLm();

      // Build pelvis-relative world coords (origin at pelvis mid). y DOWN positive.
      const hipY = 0;            // pelvis is origin
      const shY = -s.shoulderUp; // shoulders above pelvis -> negative y (up)
      // left/right hips
      world[IDX.l_hip] = { x: -s.hipHalf * dir, y: 0, z: 0, visibility: 1 };
      world[IDX.r_hip] = { x: +s.hipHalf * dir, y: 0, z: 0, visibility: 1 };
      world[IDX.l_sh] = { x: -s.hipHalf * dir, y: shY, z: 0, visibility: 1 };
      world[IDX.r_sh] = { x: +s.hipHalf * dir, y: shY, z: 0, visibility: 1 };
      world[IDX.nose] = { x: 0, y: -s.noseUp, z: 0.02, visibility: 1 };

      // feet: pelvis-relative horizontal = footAbs - pelvisAbsPos (along walking axis -> world x*dir).
      // world y is DOWN-positive with pelvis at origin, so the ground is at y=+hipUp.
      // The SWING foot (down=false) is lifted toward the pelvis (smaller y).
      function legFor(sideSign, footAbs, onGround, which, lift) {
        const ankX = (footAbs - pelvisAbsPos) * dir; // relative, signed by dir
        const groundY = hipUp;                 // ground plane (down-positive) below pelvis
        const footLift = onGround ? 0 : (lift || 0.06); // metres lifted during swing
        const heelY = groundY - footLift;
        const ankY = heelY - 0.03;
        const knY = groundY - s.shank;
        const knX = ankX * 0.5;
        const heelX = ankX - 0.02 * dir;
        const toeX = ankX + s.foot * dir * facing;
        const o = (occludeFar && which === 'far') ? 0.3 : 1;
        const base = (sideSign === 'l' ? -s.hipHalf : s.hipHalf) * dir;
        world[sideSign === 'l' ? IDX.l_kn : IDX.r_kn] = { x: base + knX, y: knY - footLift * 0.5, z: 0, visibility: o };
        world[sideSign === 'l' ? IDX.l_an : IDX.r_an] = { x: base + ankX, y: ankY, z: 0, visibility: o };
        world[sideSign === 'l' ? IDX.l_heel : IDX.r_heel] = { x: base + heelX, y: heelY, z: 0, visibility: o };
        world[sideSign === 'l' ? IDX.l_toe : IDX.r_toe] = { x: base + toeX, y: heelY, z: 0, visibility: o };
      }
      // near/far side for optional far-limb occlusion (arbitrary 'r' = far)
      legFor('l', footPlant.l.abs, footPlant.l.down, 'near');
      legFor('r', footPlant.r.abs, footPlant.r.down, occludeFar ? 'far' : 'near');

      // arms swing opposite to legs
      const sw = (armPhase || 0);
      world[IDX.l_el] = { x: -s.hipHalf * dir, y: shY + s.arm * 0.5, z: 0, visibility: 1 };
      world[IDX.r_el] = { x: +s.hipHalf * dir, y: shY + s.arm * 0.5, z: 0, visibility: 1 };
      world[IDX.l_wr] = { x: -s.hipHalf * dir + sw * 0.12 * dir, y: shY + s.arm, z: 0, visibility: 1 };
      world[IDX.r_wr] = { x: +s.hipHalf * dir - sw * 0.12 * dir, y: shY + s.arm, z: 0, visibility: 1 };

      // noise
      if (noise) for (let i = 0; i < 33; i++) {
        world[i].x += (Math.random() - 0.5) * 2 * noise;
        world[i].y += (Math.random() - 0.5) * 2 * noise;
      }

      // image landmarks: project world to a portrait frame that FOLLOWS the
      // pelvis (operator keeps pelvis roughly centred). Simple orthographic:
      // image x centred on pelvis; scale so body ~ fills frame height.
      const pxScale = 0.18;  // m -> normalised x
      const pyScale = 0.42;  // m -> normalised y
      for (let i = 0; i < 33; i++) {
        let nx = 0.5 + world[i].x * pxScale;
        let ny = 0.5 + (world[i].y + (standHip - hipUp) * 0.0) * pyScale + 0.1;
        // vertical placement: pelvis near middle, feet lower
        ny = 0.45 + (world[i].y) * pyScale + (standHip - hipUp) * 0.15;
        if (front) nx = 1 - nx; // front camera mirror in image only
        image[i] = { x: nx, y: ny, z: world[i].z, visibility: world[i].visibility };
      }

      frames.push({ tMs: Math.round(tS * 1000), image, world, _dbg: { label, pelvisAbs: pelvisAbsPos, hipUp } });
    }

    // ---- 1. seated pre-roll ----
    const seatedFoot = { l: { abs: 0.05, down: true }, r: { abs: -0.05, down: true } };
    for (let t = 0; t < preRollS - 1e-9; t += dt) {
      pushFrame('SEATED_PRE', 0, seatHip, seatedFoot, 1, 0, 0.9); // knees flexed -> extra bend
      tS += dt;
    }
    // t=0 == GO at end of pre-roll
    const tGo = tS; // ~0
    events.push({ code: 'GO', t: 0 });

    // ---- 2. sit-to-stand ----
    const nSts = Math.round(stsT * fs);
    for (let i = 0; i < nSts; i++) {
      const f = i / nSts;
      const hipUp = seatHip + (standHip - seatHip) * cos01(f);
      pushFrame('SIT_TO_STAND', 0, hipUp, seatedFoot, 1, 0, 0.9 * (1 - cos01(f)));
      tS += dt;
    }
    const tStanding = tS - tGo;
    events.push({ code: 'SEAT_OFF', t: preRollS * 0 + (stsT * 0.12) }); // ~ when p>=0.1
    events.push({ code: 'STANDING', t: tStanding });

    // ---- 3. walk out ----
    let footAbs = { l: 0.05, r: -0.05 };
    let swingFoot = (dir > 0) ? 'l' : 'l'; // left steps first by default
    const firstFootWalk = swingFoot === 'l' ? 'left' : 'right';
    const walkStartT = tS - tGo;
    events.push({ code: 'WALK_START', t: walkStartT });

    // Physically exact walking model:
    //   - pelvis advances exactly `stepLen` per step (so nSteps -> nSteps*stepLen)
    //   - the stance (grounded) foot stays FIXED in absolute space during stance
    //   - the swing foot travels from behind the pelvis to `stepLen` ahead of the
    //     previous stance foot, then becomes the new stance foot.
    function doWalk(nSteps, direction, segment) {
      for (let st = 0; st < nSteps; st++) {
        const nf = Math.round((strideT / 2) * fs);
        const thisFoot = swingFoot;
        const lenMul = thisFoot === 'l' ? (1 + asymLen / 2) : (1 - asymLen / 2);
        const timeMul = thisFoot === 'l' ? (1 + asymTime / 2) : (1 - asymTime / 2);
        const nfr = Math.max(2, Math.round(nf * timeMul));
        const sLen = stepLen * lenMul;
        const startAbs = footAbs[thisFoot];
        const pelvisStart = pelvisAbs;
        const targetAbs = startAbs + direction * (2 * sLen); // land two steps ahead of itself
        for (let i = 1; i <= nfr; i++) {
          const f = i / nfr;
          // pelvis advances linearly by sLen across this swing
          pelvisAbs = pelvisStart + direction * sLen * f;
          const plant = {
            l: { abs: footAbs.l, down: thisFoot !== 'l' },
            r: { abs: footAbs.r, down: thisFoot !== 'r' },
          };
          // swing foot arcs from its start to its target (cosine)
          plant[thisFoot] = { abs: startAbs + (targetAbs - startAbs) * cos01(f), down: false };
          const armPhase = Math.sin(f * Math.PI) * (thisFoot === 'l' ? 1 : -1);
          pushFrame(segment, pelvisAbs, standHip, plant, direction, armPhase, 0.05 + 0.25 * Math.sin(f * Math.PI));
          tS += dt;
        }
        footAbs[thisFoot] = targetAbs;
        hsTruth.push({ foot: thisFoot === 'l' ? 'left' : 'right', t: tS - tGo, segment });
        swingFoot = (swingFoot === 'l') ? 'r' : 'l';
      }
    }

    doWalk(nStepsOneWay, dir, 'OUT');
    const lastFootWalk = (swingFoot === 'l') ? 'right' : 'left'; // last planted was the other
    const tTurn1Start = tS - tGo;
    events.push({ code: 'TURN1_START', t: tTurn1Start });

    // ---- 4. turn at cone (pelvis roughly stationary, feet shuffle) ----
    const nTurn = Math.round(turnT * fs);
    const firstFootCone = (swingFoot === 'l') ? 'left' : 'right';
    for (let i = 0; i < nTurn; i++) {
      const f = i / nTurn;
      const plant = { l: { abs: footAbs.l, down: true }, r: { abs: footAbs.r, down: true } };
      pushFrame('TURN_1', pelvisAbs, standHip, plant, dir, 0, 0.1);
      // mark a couple of turn HS
      tS += dt;
    }
    hsTruth.push({ foot: firstFootCone, t: tTurn1Start + turnT * 0.3, segment: 'TURN_1' });
    events.push({ code: 'TURN1_END', t: tS - tGo });

    // ---- 5. walk back ----
    doWalk(nStepsOneWay, -dir, 'BACK');
    events.push({ code: 'TURN2_START', t: tS - tGo });

    // ---- 6. turn at chair ----
    const lastFootBeforeSit = (swingFoot === 'l') ? 'right' : 'left';
    const nTurn2 = Math.round(turnT * fs);
    for (let i = 0; i < nTurn2; i++) {
      pushFrame('TURN_2', pelvisAbs, standHip, { l: { abs: footAbs.l, down: true }, r: { abs: footAbs.r, down: true } }, dir, 0, 0.1);
      tS += dt;
    }
    events.push({ code: 'SIT_DESCENT_START', t: tS - tGo });

    // ---- 7. stand-to-sit ----
    const nSit = Math.round(stsSitT * fs);
    for (let i = 0; i < nSit; i++) {
      const f = i / nSit;
      const hipUp = standHip - (standHip - seatHip) * cos01(f);
      pushFrame('STAND_TO_SIT', pelvisAbs, hipUp, { l: { abs: footAbs.l, down: true }, r: { abs: footAbs.r, down: true } }, dir, 0, 0.9 * cos01(f));
      tS += dt;
    }
    const tSeatContact = tS - tGo;
    events.push({ code: 'SEAT_CONTACT', t: tSeatContact });

    // ---- 8. seated tail ----
    for (let t = 0; t < 1.0; t += dt) {
      pushFrame('SEATED_END', pelvisAbs, seatHip, { l: { abs: footAbs.l, down: true }, r: { abs: footAbs.r, down: true } }, dir, 0, 0.9);
      tS += dt;
    }

    // apply dropouts (missing frames -> null landmarks for <=0.2 s)
    if (opts.dropoutS) {
      const n = Math.round(opts.dropoutS * fs);
      const start = Math.floor(frames.length * 0.4);
      for (let i = start; i < start + n && i < frames.length; i++) {
        frames[i].image = null; frames[i].world = null;
      }
    }

    const truth = {
      totalTime: tSeatContact,
      events: eventsMap(events),
      firstFootWalk, lastFootWalk,
      firstFootAroundCone: firstFootCone,
      lastFootTurnBeforeSitting: lastFootBeforeSit,
      strideLen, strideT, course, dir,
      nStepsOneWay,
      hs: hsTruth,
    };
    return { frames, truth };
  }

  function eventsMap(events) {
    const m = {};
    events.forEach((e) => { m[e.code] = e.t; });
    return m;
  }

  global.Synth = { generate, IDX };
})(typeof window !== 'undefined' ? window : globalThis);
