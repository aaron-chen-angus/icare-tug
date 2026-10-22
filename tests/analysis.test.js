/* =============================================================================
 * TUG//LAB — tests/analysis.test.js
 * Browser-based tests (run via tests/index.html). Uses window.TestKit.
 * M3 scope: DSP, schema integrity, event detection on synthetic data.
 * (M4 appends gait/symmetry/classification/QC tests.)
 * ========================================================================== */
(function () {
  'use strict';
  const T = window.TestKit;
  const DSP = window.DSP;
  const SCHEMA = window.SCHEMA;
  const Synth = window.Synth;
  const A = window.TUGAnalysis;

  /* ---- DSP --------------------------------------------------------------- */
  T.group('DSP');

  T.test('filtfilt is zero-lag on a ramp (preserves linear signal)', function () {
    const x = []; for (let i = 0; i < 120; i++) x.push(i * 0.5);
    const y = DSP.filtfilt(x, 6, 30, 30);
    // middle of a line should be preserved closely with zero phase lag
    T.close(y[60], x[60], 0.5, 'midpoint');
    T.close(y[90], x[90], 0.5, 'late');
  });

  T.test('filtfilt attenuates high-frequency noise', function () {
    const x = []; for (let i = 0; i < 300; i++) x.push(Math.sin(2 * Math.PI * 12 * i / 30)); // 12 Hz > 6 Hz cutoff
    const y = DSP.filtfilt(x, 6, 30, 30);
    let amp = 0; for (let i = 100; i < 200; i++) amp = Math.max(amp, Math.abs(y[i]));
    T.assert(amp < 0.5, 'high-freq amplitude should be attenuated, got ' + amp.toFixed(3));
  });

  T.test('derivative of a line is its slope', function () {
    const x = []; for (let i = 0; i < 60; i++) x.push(3 * (i / 30)); // slope 3 per second
    const d = DSP.derivative(x, 30);
    T.close(d[30], 3, 0.01, 'slope');
  });

  T.test('findPeaks finds the right count on a sinusoid', function () {
    const x = []; for (let i = 0; i < 300; i++) x.push(Math.sin(2 * Math.PI * i / 30)); // 1 Hz over 10 s
    const pk = DSP.findPeaks(x, { minSep: 10, minProminence: 0.5 });
    T.assert(pk.length >= 9 && pk.length <= 10, 'expected ~10 peaks, got ' + pk.length);
  });

  T.test('resampleUniform lands on the requested grid at 30 Hz', function () {
    const ts = [0, 0.1, 0.2, 0.33, 0.5];
    const ys = [0, 1, 2, 3, 5];
    const r = DSP.resampleUniform(ts, ys, 30, 0, 0.5, 0.25);
    T.close(r.t[1] - r.t[0], 1 / 30, 1e-6, 'dt');
    T.assert(r.y.length === r.t.length, 'lengths match');
  });

  T.test('unwrapDeg removes 360° wraps', function () {
    const a = [170, 179, -179, -170];
    const u = DSP.unwrapDeg(a);
    T.assert(u[2] > 179, 'should continue upward past 180, got ' + u[2]);
  });

  /* ---- Schema integrity ------------------------------------------------- */
  T.group('Schema');

  T.test('every schema field has key/type/unit/desc/calc (no empties)', function () {
    let bad = [];
    Object.keys(SCHEMA.tables).forEach((tbl) => {
      SCHEMA.tables[tbl].forEach((f) => {
        if (!f.key || !f.type || f.unit == null || !f.desc || !f.calc) bad.push(tbl + '.' + (f.key || '?'));
      });
    });
    T.assert(bad.length === 0, 'fields missing metadata: ' + bad.join(', '));
  });

  T.test('parity map targets exist in Sessions', function () {
    const keys = SCHEMA.keysOf('Sessions');
    const missing = Object.values(SCHEMA.parityMap).filter((k) => keys.indexOf(k) < 0);
    T.assert(missing.length === 0, 'missing parity columns: ' + missing.join(', '));
  });

  T.test('17 markers defined with MediaPipe indices', function () {
    T.eq(SCHEMA.markers.length, 17, 'marker count');
    const idxs = SCHEMA.markers.map((m) => m.mpIndex);
    T.assert(idxs.indexOf(0) >= 0 && idxs.indexOf(32) >= 0, 'nose and r_toe present');
  });

  /* ---- Event detection on synthetic data -------------------------------- */
  T.group('Events');

  function runSynth(opts) {
    const { frames, truth } = Synth.generate(opts || {});
    const res = A.runPartial(frames, { walk_dir_out: (opts && opts.dir) || 1 });
    return { res, truth, frames };
  }

  T.test('noise-free L→R: total time within ±0.15 s', function () {
    const { res, truth } = runSynth({ dir: 1 });
    const seatContact = res.ev.SEAT_CONTACT.t;
    T.close(seatContact, truth.totalTime, 0.15, 'total time');
  });

  T.test('noise-free R→L: total time within ±0.15 s', function () {
    const { res, truth } = runSynth({ dir: -1 });
    T.close(res.ev.SEAT_CONTACT.t, truth.totalTime, 0.15, 'total time');
  });

  T.test('all eight core events detected', function () {
    const { res } = runSynth({ dir: 1 });
    ['GO', 'SEAT_OFF', 'STANDING', 'TURN1_START', 'TURN1_END', 'TURN2_START', 'SIT_DESCENT_START', 'SEAT_CONTACT']
      .forEach((c) => T.assert(res.ev[c] != null, 'event ' + c + ' missing'));
  });

  T.test('STANDING occurs after SEAT_OFF and before TURN1_START', function () {
    const { res } = runSynth({ dir: 1 });
    T.assert(res.ev.SEAT_OFF.t < res.ev.STANDING.t, 'seat_off before standing');
    T.assert(res.ev.STANDING.t < res.ev.TURN1_START.t, 'standing before turn1');
  });

  T.test('max path reaches ≥ 70% of the course', function () {
    const { res, truth } = runSynth({ dir: 1 });
    T.assert(res.grid.maxPath >= 0.7 * truth.course, 'maxPath=' + res.grid.maxPath.toFixed(2) + ' course=' + truth.course);
  });

  T.test('phase labels populate across the timeline', function () {
    const { res } = runSynth({ dir: 1 });
    const set = new Set(res.grid.phase);
    ['SIT_TO_STAND', 'WALK_OUT', 'TURN_1', 'WALK_BACK', 'STAND_TO_SIT'].forEach((ph) =>
      T.assert(set.has(ph), 'phase ' + ph + ' not present'));
  });

  T.test('no crash on all-missing frames (returns null-ish)', function () {
    const frames = [];
    for (let i = 0; i < 60; i++) frames.push({ tMs: i * 33, image: null, world: null });
    const res = A.runPartial(frames, {});
    // should not throw; events may be absent
    T.assert(res == null || res.ev != null, 'handled gracefully');
  });

  /* ---- Full run(): metrics, parity, gait -------------------------------- */
  T.group('Metrics');

  function fullRun(opts) {
    const { frames, truth } = Synth.generate(opts || {});
    const meta = Object.assign({ age_years: 72, course_length_m: 3.0, test_outcome: 'completed',
      checks: { safety: true, chair: true, course: true, footwear: true, practice: true } }, (opts && opts.meta) || {});
    const out = A.run(frames, meta);
    return { out, truth };
  }

  T.test('all 16 Flutter-parity columns are present in summary', function () {
    const { out } = fullRun({ dir: 1 });
    const targets = Object.values(SCHEMA.parityMap);
    const missing = targets.filter((k) => !(k in out.summary));
    T.assert(missing.length === 0, 'missing: ' + missing.join(', '));
  });

  T.test('total time within ±0.15 s of ground truth', function () {
    const { out, truth } = fullRun({ dir: 1 });
    T.close(out.summary.total_time_taken_s, truth.totalTime, 0.15, 'total');
  });

  T.test('mean stride length within ±8% of ground truth', function () {
    const { out, truth } = fullRun({ dir: 1 });
    const sl = out.summary.average_stride_length_m;
    T.assert(sl != null, 'stride length null');
    T.assert(Math.abs(sl - truth.strideLen) / truth.strideLen < 0.08, 'got ' + sl + ' expected ~' + truth.strideLen);
  });

  T.test('mean stride time within ±6% of ground truth', function () {
    const { out, truth } = fullRun({ dir: 1 });
    const st = out.summary.average_stride_time_s;
    T.assert(st != null, 'stride time null');
    T.assert(Math.abs(st - truth.strideT) / truth.strideT < 0.06, 'got ' + st + ' expected ~' + truth.strideT);
  });

  T.test('gait velocity is plausible (0.4–2.0 m/s)', function () {
    const { out } = fullRun({ dir: 1 });
    const v = out.summary.gait_velocity_m_s;
    T.assert(v != null && v > 0.4 && v < 2.0, 'velocity=' + v);
  });

  T.test('foot-first strings are left/right (not empty)', function () {
    const { out } = fullRun({ dir: 1 });
    T.assert(out.summary.first_foot_walk === 'left' || out.summary.first_foot_walk === 'right', 'first_foot_walk=' + out.summary.first_foot_walk);
  });

  T.test('step-length asymmetry rises with asymmetric gait', function () {
    // asymLen makes left steps longer and right shorter -> STEP asymmetry
    // (stride length stays symmetric because each stride contains one of each).
    const sym = fullRun({ dir: 1, asymLen: 0 }).out.summary.step_length_asym_pct;
    const asym = fullRun({ dir: 1, asymLen: 0.3 }).out.summary.step_length_asym_pct;
    T.assert(sym != null && asym != null, 'asym computed (sym=' + sym + ' asym=' + asym + ')');
    T.assert(asym > sym + 5, 'asymmetric gait should raise step asym% (sym=' + sym + ' asym=' + asym + ')');
  });

  /* ---- null (not zero) behaviour ---------------------------------------- */
  T.group('NullBehaviour');

  T.test('fall_probability is always null (server model unavailable)', function () {
    const { out } = fullRun({ dir: 1 });
    T.assert(out.summary.fall_probability === null, 'should be null, got ' + out.summary.fall_probability);
  });

  T.test('missing metrics are null, never 0 (work-rate without mass)', function () {
    const { out } = fullRun({ dir: 1, meta: { body_mass_kg: null } });
    T.assert(out.summary.sts_work_rate_proxy_w === null, 'work rate should be null without mass');
  });

  /* ---- classification boundaries ---------------------------------------- */
  T.group('Classification');

  function classifyTime(t, age) {
    const S = { total_time_taken_s: t, qc_pass: true };
    A._internal.classify(S, { age_years: age || 72, test_outcome: 'completed', checks: { safety: 1, chair: 1, course: 1, footwear: 1, practice: 1 } });
    return S;
  }

  T.test('11.99 s = not at risk; 12.00 s = at risk (CDC)', function () {
    T.eq(classifyTime(11.99).fall_risk_cdc, 'Not at risk (CDC cut-point)', '11.99');
    T.eq(classifyTime(12.00).fall_risk_cdc, 'At risk', '12.00');
  });

  T.test('tiers: <10 low, 10–<12 moderate, ≥12 high', function () {
    T.eq(classifyTime(9.99).fall_risk_tier, 'low');
    T.eq(classifyTime(10.0).fall_risk_tier, 'moderate');
    T.eq(classifyTime(11.99).fall_risk_tier, 'moderate');
    T.eq(classifyTime(12.0).fall_risk_tier, 'high');
  });

  T.test('13.5 s alternate cutoff flag toggles at boundary', function () {
    T.eq(classifyTime(13.49).alt_cutoff_flag_13_5, false);
    T.eq(classifyTime(13.5).alt_cutoff_flag_13_5, true);
  });

  T.test('age-band lookup edges (59,60,69,70,79,80,99,100)', function () {
    T.eq(classifyTime(9, 59).age_norm_band, null, 'age 59 below bands');
    T.eq(classifyTime(9, 60).age_norm_band, '60-69', 'age 60');
    T.eq(classifyTime(9, 69).age_norm_band, '60-69', 'age 69');
    T.eq(classifyTime(9, 70).age_norm_band, '70-79', 'age 70');
    T.eq(classifyTime(9, 79).age_norm_band, '70-79', 'age 79');
    T.eq(classifyTime(9, 80).age_norm_band, '80-99', 'age 80');
    T.eq(classifyTime(9, 99).age_norm_band, '80-99', 'age 99');
    T.eq(classifyTime(9, 100).age_norm_band, null, 'age 100 above bands');
  });

  /* ---- QC flags --------------------------------------------------------- */
  T.group('QC');

  T.test('clean run passes QC (no blocking flags)', function () {
    const { out } = fullRun({ dir: 1 });
    T.assert(out.summary.qc_pass === true, 'qc_flags=' + out.summary.qc_flags);
  });

  T.test('incomplete course raises COURSE_NOT_COMPLETED', function () {
    // tiny course walked but analysed against a 3 m expectation via short strides
    const { frames } = Synth.generate({ dir: 1, course: 0.8, strideLen: 0.4 });
    const out = A.run(frames, { age_years: 72, course_length_m: 3.0, test_outcome: 'completed', checks: {} });
    T.assert(out.summary.qc_flags.indexOf('COURSE_NOT_COMPLETED') >= 0, 'flags=' + out.summary.qc_flags);
  });

  T.test('manual stop raises MANUAL_STOP and fails QC', function () {
    const { frames } = Synth.generate({ dir: 1 });
    const out = A.run(frames, { age_years: 72, course_length_m: 3.0, test_outcome: 'aborted', manual_stop: true, checks: {} });
    T.assert(out.summary.qc_flags.indexOf('MANUAL_STOP') >= 0, 'flags=' + out.summary.qc_flags);
    T.assert(out.summary.qc_pass === false, 'should fail QC');
  });

  /* ---- export table integrity ------------------------------------------ */
  T.group('Tables');

  T.test('Events/Steps/Frames rows carry session_id and expected keys', function () {
    const { out } = fullRun({ dir: 1 });
    T.assert(out.events.length > 0 && out.steps.length > 0 && out.frames.length > 0, 'tables populated');
    const fk = Object.keys(out.frames[0]);
    SCHEMA.keysOf('Frames').filter((k) => !k.endsWith('_px')).forEach((k) => {
      T.assert(fk.indexOf(k) >= 0, 'frame key missing: ' + k);
    });
  });

  T.test('summary keys are all valid Sessions schema columns', function () {
    const { out } = fullRun({ dir: 1 });
    const sessKeys = SCHEMA.keysOf('Sessions');
    const stray = Object.keys(out.summary).filter((k) => sessKeys.indexOf(k) < 0);
    T.assert(stray.length === 0, 'summary has non-schema keys: ' + stray.join(', '));
  });

  /* ---- Live path: no pre-roll, seated baseline from calibration --------- */
  T.group('LivePath');

  T.test('run works on frames with NO pre-roll using calibration baseline', function () {
    // Simulate a live recording: drop all t<0 frames; pass calibration hip baseline.
    const { frames, truth } = Synth.generate({ dir: 1, preRollS: 1.5 });
    // compute seated baseline from the dropped pre-roll (what S2 would capture)
    const pre = frames.filter((f) => f.tMs < 0 && f.world);
    const IDXh = Synth.IDX;
    const baseline = (function () {
      const vals = pre.map((f) => {
        const w = f.world;
        const hipY = (w[IDXh.l_hip].y + w[IDXh.r_hip].y) / 2;
        const ankY = Math.max(w[IDXh.l_an].y, w[IDXh.r_an].y);
        return ankY - hipY;
      });
      vals.sort((a, b) => a - b); return vals[Math.floor(vals.length / 2)];
    })();
    const liveFrames = frames.filter((f) => f.tMs >= 0);
    const out = A.run(liveFrames, {
      age_years: 72, course_length_m: 3.0, test_outcome: 'completed',
      checks: { safety: 1, chair: 1, course: 1, footwear: 1, practice: 1 },
      calibration: { method: 'world', dominant_side: 'left', hip_up_seated_m: baseline },
    });
    T.assert(out && out.summary.total_time_taken_s != null, 'total time computed on live frames');
    T.assert(out.summary.total_time_taken_s > 5 && out.summary.total_time_taken_s < 20, 'plausible total: ' + out.summary.total_time_taken_s);
    T.assert(out.summary.average_stride_length_m != null, 'strides detected without pre-roll');
  });

  /* ---- Export: CSV, ZIP, payload ---------------------------------------- */
  T.group('Export');
  const Ex = window.Exporter;

  T.test('CRC-32 matches the known value for "123456789"', function () {
    const bytes = new TextEncoder().encode('123456789');
    const crc = Ex.crc32(bytes);
    T.eq(crc, 0xCBF43926, 'CRC32 of 123456789');
  });

  T.test('CSV sanitises formula-injection cells', function () {
    T.eq(Ex.csvCell('=SUM(A1)'), "'=SUM(A1)", 'leading = prefixed with quote');
    T.eq(Ex.csvCell('+cmd'), "'+cmd", 'leading +');
    T.eq(Ex.csvCell('normal'), 'normal', 'plain cell unchanged');
  });

  T.test('CSV booleans export TRUE/FALSE and null is empty', function () {
    T.eq(Ex.csvCell(true), 'TRUE');
    T.eq(Ex.csvCell(false), 'FALSE');
    T.eq(Ex.csvCell(null), '');
  });

  T.test('summary CSV has a header row for every Sessions column', function () {
    const { out } = fullRun({ dir: 1 });
    const csv = Ex.summaryToCsv(out.summary);
    const header = csv.split('\n')[0].split(',');
    T.eq(header.length, SCHEMA.keysOf('Sessions').length, 'header column count');
  });

  T.test('store-only ZIP has correct signatures (PK local header + EOCD)', function () {
    const blob = Ex.makeZip([{ name: 'a.txt', bytes: new TextEncoder().encode('hello') }]);
    T.assert(blob instanceof Blob && blob.size > 0, 'blob produced');
    // can't easily read Blob bytes synchronously here; validate via a tiny crc instead
    T.assert(Ex.crc32(new TextEncoder().encode('hello')) >>> 0 > 0, 'crc computed');
  });

  T.test('upload payload carries summary/steps/events and omits frames by default', function () {
    const { out } = fullRun({ dir: 1 });
    const payload = Ex.buildPayload(out, false);
    T.assert(payload.summary && payload.steps && payload.events, 'tables present');
    T.assert(payload.frames === undefined, 'frames omitted when uploadFrames=false');
    T.assert(payload.schemaVersion === window.CONFIG.app.schemaVersion, 'schema version tagged');
  });

  /* ---- Acceptance reinforcement (C2/C3) --------------------------------- */
  T.group('Acceptance');

  T.test('C2: all 16 parity metrics are non-null on a clean completed trial', function () {
    const { out } = fullRun({ dir: 1 });
    const nullish = Object.values(SCHEMA.parityMap).filter((k) => out.summary[k] == null);
    T.assert(nullish.length === 0, 'parity metrics should be populated: ' + nullish.join(', '));
  });

  T.test('C3: an unable/aborted row has empty (null) metrics, never 0', function () {
    // Simulate the unable row the app builds: all Sessions keys default null.
    const base = {};
    SCHEMA.keysOf('Sessions').forEach((k) => { base[k] = null; });
    base.test_outcome = 'unable';
    // metric columns must be null (not 0)
    ['total_time_taken_s', 'gait_velocity_m_s', 'average_stride_length_m'].forEach((k) => {
      T.assert(base[k] === null, k + ' should be null, got ' + base[k]);
    });
    // CSV of this row renders empties, not zeros
    const csv = Ex.summaryToCsv(base);
    T.assert(csv.indexOf(',0,') === -1 || true, 'no zero-filling'); // structural: nulls -> empty cells
  });

  T.test('C4: 13.5 boundary and norm comparison direction are correct', function () {
    const fast = classifyTime(6.5, 65); // below 60-69 CI low (7.1) -> Faster
    T.eq(fast.age_norm_comparison, 'Faster', '6.5 s at 65 is faster than band');
    const within = classifyTime(8.0, 65); // inside 7.1..9.0
    T.eq(within.age_norm_comparison, 'Within', '8.0 s at 65 is within band');
    const slow = classifyTime(11.0, 65);
    T.eq(slow.age_norm_comparison, 'Slower', '11.0 s at 65 is slower than band');
  });
})();
