/* =============================================================================
 * TUG//LAB — screen-live.js  (S3 Live test + S4 Analysing)
 * Countdown 3-2-1-GO, live timer/phase chip/progress, auto-finish, frame
 * recording. On completion -> S4 analysing -> TUGAnalysis.run -> results.
 * ========================================================================== */
(function (global) {
  'use strict';

  const R = global.Router;
  const CFG = global.CONFIG;
  const T = global.T;
  const el = R.el;

  let PE = null;
  let rec = null; // recording state

  function beep(freq, ms) {
    try {
      const ac = beep._ac || (beep._ac = new (global.AudioContext || global.webkitAudioContext)());
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = freq || 880; o.connect(g); g.connect(ac.destination);
      g.gain.setValueAtTime(0.2, ac.currentTime);
      o.start();
      o.stop(ac.currentTime + (ms || 150) / 1000);
    } catch (e) {}
  }
  function speak(text) {
    try { if (global.speechSynthesis) { const u = new SpeechSynthesisUtterance(text); global.speechSynthesis.speak(u); } } catch (e) {}
  }

  function render() {
    PE = global.PoseEngine;
    const S = R.Store;

    // Build HUD + controls inside the fixed live layer.
    const hud = R.$('#liveHud');
    hud.innerHTML = '';
    const timeEl = el('span', { class: 'hud-time counting', id: 'hudTime', role: 'timer', 'aria-live': 'off', 'aria-label': 'Elapsed time' }, ['0.0']);
    const chip = el('span', { class: 'phase-chip', id: 'phaseChip' }, [T('live.getReady')]);
    hud.appendChild(timeEl);
    hud.appendChild(chip);

    const controls = R.$('#liveControls');
    controls.innerHTML = '';
    const stopBtn = el('button', { class: 'btn btn-danger', onclick: () => finish(true) }, [T('live.stop')]);
    const doneBtn = el('button', { class: 'btn btn-primary', id: 'completeBtn', onclick: () => finish(false) }, [T('live.complete')]);
    controls.appendChild(stopBtn);
    controls.appendChild(doneBtn);

    const status = R.$('#overlayStatus');
    status.className = 'overlay-status big';
    status.textContent = '';

    const prog = R.$('#liveProgress').firstElementChild;
    prog.style.width = '0%';

    // start recording state
    rec = {
      frames: [], live: global.LiveTracker.create({ hipSeated: (S.calibration && S.calibration.hip_up_seated_m) }),
      started: false, finished: false, startWall: null, frameCount: 0,
      manualStop: false, autoFinished: false,
    };

    // ensure camera is still running from S2; if not, we cannot proceed
    if (!PE || !PE._state || !PE._state.stream) {
      const w = el('div');
      w.appendChild(R.header());
      const p = el('div', { class: 'panel' });
      p.appendChild(el('h2', {}, ['Camera not active']));
      p.appendChild(el('p', {}, ['The camera stream is not running. Go back to setup.']));
      p.appendChild(el('button', { class: 'btn', onclick: () => R.go('setup') }, ['← SETUP']));
      w.appendChild(p);
      return w;
    }

    // countdown then GO
    startCountdown(status, timeEl, chip, prog);

    // the visible screen content (under the fixed camera layer it's mostly empty)
    const wrap = el('div');
    return wrap;
  }

  function startCountdown(status, timeEl, chip, prog) {
    let n = CFG.protocol.countdownS;
    status.textContent = String(n);
    beep(660, 120);
    const iv = setInterval(() => {
      n -= 1;
      if (n > 0) { status.textContent = String(n); beep(660, 120); }
      else {
        clearInterval(iv);
        status.textContent = T('live.go');
        beep(1200, 300);
        if (global.CONFIG.ui && global.speechSynthesis) speak('Go');
        setTimeout(() => { status.textContent = ''; }, 600);
        onGo(timeEl, chip, prog);
      }
    }, 1000);
  }

  function onGo(timeEl, chip, prog) {
    rec.started = true;
    rec.startWall = performance.now();
    rec.live.onGo();
    PE.markT0(performance.now());
    PE.setMarkers({ trail: true });
    // begin the detection loop (reuse the camera already running)
    PE.startDetection(onFrame.bind(null, timeEl, chip, prog));
  }

  function onFrame(timeEl, chip, prog, pkt) {
    if (!rec || rec.finished) return;
    rec.frameCount++;
    // record raw frame (image+world+tMs) for offline analysis
    rec.frames.push({ tMs: pkt.tMs, image: pkt.image, world: pkt.world });

    const snap = rec.live.update(pkt);
    if (timeEl) timeEl.textContent = snap.elapsed.toFixed(1);
    if (chip) { chip.textContent = T('phase.' + snap.phase); chip.className = 'phase-chip phase-' + snap.phase; }
    if (prog) prog.style.width = Math.round(snap.progress01 * 100) + '%';

    if (snap.finishSuggested && !rec.suggested) {
      rec.suggested = true;
      const btn = R.$('#completeBtn');
      if (btn) btn.classList.add('pulse');
      if (CFG.protocol.autoFinish) {
        rec.autoFinished = true;
        setTimeout(() => finish(false), 400);
      }
    }
  }

  function finish(manualStop) {
    if (!rec || rec.finished) return;
    rec.finished = true;
    rec.manualStop = !!manualStop;
    PE.stop(); // stops loop + camera + wake lock

    const S = R.Store;
    // capture pre-roll: the live frames start at GO (t0). We also want the
    // seated baseline that preceded GO — approximated by the first frames here.
    S.frames = rec.frames;
    S.live_time_s = rec.live.state().elapsed;
    S.liveMeta = {
      manual_stop: rec.manualStop,
      auto_finished: rec.autoFinished,
      test_outcome: manualStop ? 'aborted' : 'completed',
      frame_count: rec.frameCount,
    };
    R.go('analysing', { outcome: S.liveMeta.test_outcome });
  }

  // ---- S4 analysing -----------------------------------------------------
  function renderAnalysing(opts) {
    const S = R.Store;
    const wrap = el('div');
    wrap.appendChild(R.header());
    const p = el('div', { class: 'panel' });
    p.appendChild(el('h2', {}, [T('analysing.title')]));
    p.appendChild(el('div', { class: 'spinner' }));
    const statusLine = el('p', { class: 'analysing-status', id: 'analyseStatus', role: 'status', 'aria-live': 'polite' }, [T('analysing.filter')]);
    p.appendChild(statusLine);
    wrap.appendChild(p);

    // run analysis asynchronously so the spinner paints
    setTimeout(() => runAnalysis(statusLine, opts), 60);
    return wrap;
  }

  async function runAnalysis(statusLine, opts) {
    const S = R.Store;
    const steps = [T('analysing.filter'), T('analysing.phases'), T('analysing.gait')];
    let si = 0;
    const tick = setInterval(() => { si = (si + 1) % steps.length; if (statusLine) statusLine.textContent = steps[si]; }, 500);

    let result = null, err = null;
    try {
      const meta = buildMeta(S, opts);
      result = global.TUGAnalysis.run(S.frames, meta);
    } catch (e) { err = e; }
    clearInterval(tick);

    if (!result) {
      S.result = { error: true, message: (err && err.message) || 'Analysis could not complete (no pose data).' };
      R.go('results', { error: true });
      return;
    }
    // compose full Sessions row from form + device + protocol + metrics
    result.summary = Object.assign(sessionBase(S, opts), result.summary);
    S.result = result;
    S.live_vs_offline_diff_s = (S.live_time_s != null && result.summary.total_time_taken_s != null)
      ? Math.round((S.live_time_s - result.summary.total_time_taken_s) * 100) / 100 : null;
    result.summary.live_time_s = global.Util.round(S.live_time_s, 2);
    result.summary.live_vs_offline_diff_s = S.live_vs_offline_diff_s;
    result.rawFrames = S.frames;

    // AUTO-UPLOAD on completion: save to local history and push to Google Sheets
    // immediately, without waiting for the operator to tap Submit. The receiver
    // de-duplicates by session_id, so a later manual submit is harmless.
    if (opts && opts.outcome === 'completed' && global.CONFIG.sheets.autoUpload) {
      try {
        if (statusLine) statusLine.textContent = 'Saving to Google Sheets…';
        result.summary.selected_attempt = true;
        global.Exporter.historyAdd(result.summary);
        if (global.CONFIG.sheets.webhookUrl) {
          const r = await global.Exporter.upload(result);
          result.summary._upload_status = r.status;
          S.autoUploaded = true;
        }
      } catch (e) { /* non-fatal: results still shown; manual submit remains */ }
    }
    R.go('results', {});
  }

  function buildMeta(S, opts) {
    return {
      session_id: (S.result && S.result.sessionId) || global.Util.uuid(),
      age_years: S.form.age_years,
      sex: S.form.sex,
      body_mass_kg: S.form.body_mass_kg,
      course_length_m: CFG.protocol.courseLengthM,
      test_outcome: (S.liveMeta && S.liveMeta.test_outcome) || 'completed',
      manual_stop: !!(S.liveMeta && S.liveMeta.manual_stop),
      checks: S.checks || {},
      calibration: S.calibration || {},
      effective_fs_hz: (S.liveMeta && S.liveMeta.frame_count && S.live_time_s) ? (S.liveMeta.frame_count / S.live_time_s) : CFG.signal.resampleHz,
    };
  }

  // The non-metric Sessions columns (participant/device/protocol).
  function sessionBase(S, opts) {
    const now = new Date();
    const dev = S.device || {};
    return {
      session_id: (S.result && S.result.sessionId) || global.Util.uuid(),
      timestamp_utc: now.toISOString(),
      utc_offset_min: -now.getTimezoneOffset(),
      app_version: CFG.app.version, analysis_version: CFG.app.analysisVersion, schema_version: CFG.app.schemaVersion,
      participant_id: S.form.participant_id, age_years: S.form.age_years, sex: S.form.sex,
      height_cm: S.form.height_cm, body_mass_kg: S.form.body_mass_kg, body_fat_pct: S.form.body_fat_pct,
      bmr_kcal_day: S.form.bmr_kcal_day, chair_seat_height_cm: S.form.chair_seat_height_cm,
      assistive_device: S.form.assistive_device, site: S.form.site, operator_notes: S.form.operator_notes,
      instruction_language: S.form.instruction_language, attempt_no: S.attemptNo || 1, attempts_total: S.attemptNo || 1,
      selected_attempt: true, test_outcome: (S.liveMeta && S.liveMeta.test_outcome) || 'completed', unable_reason: null,
      source: (S.liveMeta && S.liveMeta.source) || 'live',
      pose_model: S.form.pose_model, pose_delegate: dev.pose_delegate || '', camera_facing: S.form.camera_facing,
      lens_label: dev.lens_label || '', video_width_px: dev.video_width_px, video_height_px: dev.video_height_px,
      orientation: dev.orientation || '', user_agent: dev.user_agent || navigator.userAgent,
      effective_fs_hz: global.Util.round((S.liveMeta && S.liveMeta.frame_count && S.live_time_s) ? (S.liveMeta.frame_count / S.live_time_s) : CFG.signal.resampleHz, 1),
      panning_mode: CFG.panning.enabled,
      course_length_m: CFG.protocol.courseLengthM, max_duration_s: CFG.protocol.maxDurationS,
      test_duration_s: global.Util.round(S.live_time_s, 2), manual_stop: !!(S.liveMeta && S.liveMeta.manual_stop),
      auto_finished: !!(S.liveMeta && S.liveMeta.auto_finished),
      practice_done_confirmed: !!(S.checks && S.checks.practice), safety_confirmed: !!(S.checks && S.checks.safety),
      armchair_confirmed: !!(S.checks && S.checks.chair), footwear_assist_confirmed: !!(S.checks && S.checks.footwear),
      calibration_method: (S.calibration && S.calibration.method) || 'world',
      scale_m_per_px_walk: null, scale_m_per_px_body: null, scale_check_diff_pct: null,
      filter_cutoff_hz: CFG.signal.cutoffHz, filter_cutoff_foot_hz: CFG.signal.cutoffFootHz, resample_hz: CFG.signal.resampleHz,
    };
  }

  // ---- Replay mode (analyse a video file) -------------------------------
  function renderReplay() {
    PE = global.PoseEngine;
    const S = R.Store;
    if (!PE || !S.replayFile) {
      const w = el('div'); w.appendChild(R.header());
      const p = el('div', { class: 'panel' });
      p.appendChild(el('h2', {}, ['Replay unavailable']));
      p.appendChild(el('p', {}, ['No file selected or pose engine not ready.']));
      p.appendChild(el('button', { class: 'btn', onclick: () => R.go('entry') }, ['← BACK']));
      w.appendChild(p); return w;
    }

    const hud = R.$('#liveHud'); hud.innerHTML = '';
    hud.appendChild(el('span', { class: 'phase-chip', id: 'replayChip' }, ['REPLAY']));
    const controls = R.$('#liveControls'); controls.innerHTML = '';
    controls.appendChild(el('button', { class: 'btn btn-danger', onclick: () => { PE.stop(); R.go('entry'); } }, ['CANCEL']));
    const status = R.$('#overlayStatus'); status.className = 'overlay-status'; status.textContent = 'Loading…';

    rec = { frames: [], finished: false, manualStop: false, autoFinished: false };

    (async () => {
      try {
        await PE.init(S.form.pose_model);
        PE.setMarkers({ trail: true });
        await PE.startReplay(S.replayFile, (pkt) => {
          rec.frames.push({ tMs: pkt.tMs, image: pkt.image, world: pkt.world });
          const chip = R.$('#replayChip'); if (chip) chip.textContent = 'REPLAY ' + (rec.frames.length) + 'f';
        }, () => {
          // on end
          const S2 = R.Store;
          S2.frames = rec.frames;
          S2.live_time_s = rec.frames.length ? rec.frames[rec.frames.length - 1].tMs / 1000 : null;
          S2.liveMeta = { manual_stop: false, auto_finished: false, test_outcome: 'completed', frame_count: rec.frames.length, source: 'replay' };
          R.go('analysing', { outcome: 'completed', source: 'replay' });
        }, 1);
      } catch (e) {
        status.textContent = 'Replay failed: ' + (e && e.message ? e.message : e);
      }
    })();

    const wrap = el('div');
    return wrap;
  }

  R.register('live', render);
  R.register('analysing', renderAnalysing);
  R.register('replay', renderReplay);
})(typeof window !== 'undefined' ? window : globalThis);
