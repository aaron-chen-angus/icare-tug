/* =============================================================================
 * TUG//LAB — screen-results.js  (S5 Results)
 * Big score + badges, phase timeline, metrics, collapsible parity sections,
 * charts, per-step table, QC flags, operator observations, attempt comparison,
 * actions (submit / try again / download ZIP / back).
 * ========================================================================== */
(function (global) {
  'use strict';

  const R = global.Router;
  const CFG = global.CONFIG;
  const T = global.T;
  const U = global.Util;
  const el = R.el;
  const Ch = global.Charts;
  const Ex = global.Exporter;

  const OBS = [
    ['obs_slow_tentative_pace', 'Slow / tentative pace'],
    ['obs_loss_of_balance', 'Loss of balance'],
    ['obs_short_strides', 'Short strides'],
    ['obs_little_arm_swing', 'Little or no arm swing'],
    ['obs_steadying_on_walls', 'Steadying on walls'],
    ['obs_shuffling', 'Shuffling'],
    ['obs_en_bloc_turning', 'En bloc turning'],
    ['obs_assistive_device_misuse', 'Assistive device misuse'],
  ];

  const QC_TIPS = {
    LOW_FPS: 'Frame rate was low. Close other apps; use the Lite pose model; ensure good lighting.',
    LOW_VALID_FRAMES: 'Body was often not fully visible. Keep head-to-feet in frame while following.',
    TRACKING_GAPS: 'Tracking dropped out. Pan more smoothly and keep the participant in frame.',
    COURSE_NOT_COMPLETED: 'The walk did not reach ~3 m out. Confirm the cone distance and that the full walk was captured.',
    HIP_RISE_IMPLAUSIBLE: 'Sit-to-stand rise looked implausible. Re-check the seated baseline and side-on view.',
    MANUAL_STOP: 'Test was stopped manually; metrics may be incomplete.',
    OBLIQUE_VIEW: 'View was not side-on enough. Stand more perpendicular to the walking line.',
    DEPTH_DRIFT: 'The participant drifted toward/away from the camera. Keep the walk parallel to the camera.',
    FEW_STRIDES: 'Few strides detected. Ensure a clear side-on view of the feet.',
    CAMERA_PAN_FAST: 'Camera panned very fast. Follow more smoothly.',
  };

  function render(opts) {
    const S = R.Store;
    const wrap = el('div');
    wrap.appendChild(R.header());

    if ((opts && opts.error) || (S.result && S.result.error)) {
      const p = el('div', { class: 'panel' });
      p.appendChild(el('h2', {}, ['Analysis could not complete']));
      p.appendChild(el('p', {}, [(S.result && S.result.message) || 'No pose data was captured. Ensure the whole body is visible and retry.']));
      p.appendChild(el('button', { class: 'btn btn-primary', onclick: () => R.go('entry') }, [T('results.back')]));
      p.appendChild(el('button', { class: 'btn', style: 'margin-top:8px', onclick: tryAgain }, [T('results.tryAgain')]));
      wrap.appendChild(p);
      return wrap;
    }

    const res = S.result;
    const sm = res.summary;
    // keep raw frames available for ZIP (not uploaded)
    res.rawFrames = S.frames;

    // ---- big score + badges ----
    const score = el('div', { class: 'panel' });
    score.appendChild(el('div', { class: 'brackets' }));
    const big = el('div', { class: 'big-score' });
    big.appendChild(el('div', { class: 'big-number' }, [U.fmt(sm.total_time_taken_s, 1)]));
    big.appendChild(el('div', { class: 'unit' }, [T('results.seconds')]));
    const badges = el('div', { class: 'badges' });
    const atRisk = sm.fall_risk_cdc && sm.fall_risk_cdc.indexOf('At risk') === 0;
    badges.appendChild(el('span', { class: 'badge ' + (atRisk ? 'red' : 'green') }, ['CDC: ' + (atRisk ? T('risk.atRisk') : T('risk.notAtRisk'))]));
    const tierCol = sm.fall_risk_tier === 'low' ? 'green' : sm.fall_risk_tier === 'moderate' ? 'amber' : 'red';
    badges.appendChild(el('span', { class: 'badge ' + tierCol }, [(sm.fall_risk_tier || '').toUpperCase()]));
    badges.appendChild(el('span', { class: 'badge ' + (sm.qc_pass ? 'green' : 'amber') }, ['QC: ' + (sm.qc_pass ? T('qc.pass') : T('qc.review'))]));
    if (sm.age_norm_comparison) {
      const nc = sm.age_norm_comparison; const col = nc === 'Faster' ? 'green' : nc === 'Slower' ? 'red' : 'blue';
      badges.appendChild(el('span', { class: 'badge ' + col }, ['NORM: ' + nc.toUpperCase()]));
    }
    big.appendChild(badges);
    score.appendChild(big);
    if (!sm.qc_pass) score.appendChild(el('div', { class: 'flag block' }, ['⚠ Quality review: ' + (sm.qc_flags || '').split(';').filter(Boolean).join(', ')]));
    wrap.appendChild(score);

    // ---- phase timeline ----
    const tl = el('div', { class: 'panel' });
    tl.appendChild(el('h3', {}, ['Phase timeline']));
    tl.appendChild(Ch.phaseTimeline(res.ev, sm.total_time_taken_s));
    wrap.appendChild(tl);

    // ---- primary metrics grid ----
    const mp = el('div', { class: 'panel' });
    mp.appendChild(el('h3', {}, ['Primary metrics']));
    const grid = el('div', { class: 'metrics' });
    const M = (k, label, unit, d) => grid.appendChild(metric(label, sm[k], unit, d));
    M('gait_velocity_m_s', 'Gait velocity', 'm/s', 2);
    M('average_stride_length_m', 'Avg stride length', 'm', 2);
    M('average_stride_time_s', 'Avg stride time', 's', 2);
    M('cadence_steps_min', 'Cadence', '/min', 0);
    M('reaction_time_s', 'Reaction time', 's', 2);
    M('time_seated_to_full_extension_s', 'Sit-to-stand', 's', 2);
    M('time_around_cone_s', 'Around cone', 's', 2);
    M('time_turn_to_sit_s', 'Turn to sit', 's', 2);
    M('time_to_sitting_down_s', 'Sit down', 's', 2);
    M('stride_length_asym_pct', 'Stride len asym', '%', 1);
    M('step_time_asym_pct', 'Step time asym', '%', 1);
    mp.appendChild(grid);
    wrap.appendChild(mp);

    // ---- collapsible parity sections ----
    wrap.appendChild(section('Walking metrics', [
      ['Gait velocity', sm.gait_velocity_m_s, 'm/s'], ['Walk out velocity', sm.walk_out_velocity_m_s, 'm/s'],
      ['Walk back velocity', sm.walk_back_velocity_m_s, 'm/s'], ['Velocity change', sm.velocity_change_pct, '%'],
      ['Cadence', sm.cadence_steps_min, '/min'], ['Steps total', sm.n_steps_total, ''],
    ]));
    wrap.appendChild(section('Stride details — left', [
      ['Avg left stride length', sm.average_left_stride_length_m, 'm'], ['Avg left stride time', sm.average_left_stride_time_s, 's'],
      ['Left step length', sm.step_length_left_mean_m, 'm'], ['Left strides', sm.n_strides_left, ''],
    ]));
    wrap.appendChild(section('Stride details — right', [
      ['Avg right stride length', sm.average_right_stride_length_m, 'm'], ['Avg right stride time', sm.average_right_stride_time_s, 's'],
      ['Right step length', sm.step_length_right_mean_m, 'm'], ['Right strides', sm.n_strides_right, ''],
    ]));
    wrap.appendChild(section('Timing breakdown', [
      ['Reaction time', sm.reaction_time_s, 's'], ['Sit-to-stand', sm.time_seated_to_full_extension_s, 's'],
      ['Walk out', sm.time_walk_out_s, 's'], ['Around cone', sm.time_around_cone_s, 's'],
      ['Walk back', sm.time_walk_back_s, 's'], ['Turn to sit', sm.time_turn_to_sit_s, 's'], ['Sit down', sm.time_to_sitting_down_s, 's'],
    ]));
    wrap.appendChild(section('Gait pattern (foot sequence)', [
      ['First foot walk', sm.first_foot_walk, ''], ['Last foot walk', sm.last_foot_walk, ''],
      ['First foot around cone', sm.first_foot_around_cone, ''], ['Last foot before sitting', sm.last_foot_turn_before_sitting, ''],
    ]));
    wrap.appendChild(section('Turns', [
      ['Cone turn steps', sm.turn1_n_steps, ''], ['Cone yaw change', sm.turn1_yaw_change_deg, '°'], ['Cone peak yaw rate', sm.turn1_peak_yaw_rate_deg_s, '°/s'],
      ['Chair turn steps', sm.turn2_n_steps, ''], ['Chair yaw change', sm.turn2_yaw_change_deg, '°'], ['Chair peak yaw rate', sm.turn2_peak_yaw_rate_deg_s, '°/s'],
    ]));
    wrap.appendChild(section('Sit-to-stand & stand-to-sit', [
      ['Hip rise', sm.sts_hip_rise_m, 'm'], ['Ascent time', sm.sts_ascent_time_s, 's'], ['Peak ascent vel', sm.sts_peak_ascent_velocity_m_s, 'm/s'],
      ['Knee ROM (rise)', sm.sts_knee_rom_deg, '°'], ['Peak trunk lean (rise)', sm.sts_trunk_lean_peak_deg, '°'],
      ['Descent time', sm.sit_descent_time_s, 's'], ['Controlled-descent index', sm.sit_controlled_descent_index, ''],
    ]));
    wrap.appendChild(section('Gait joint kinematics', [
      ['Knee swing peak L', sm.knee_flex_swing_peak_left_deg, '°'], ['Knee swing peak R', sm.knee_flex_swing_peak_right_deg, '°'],
      ['Hip ROM L', sm.hip_rom_left_deg, '°'], ['Hip ROM R', sm.hip_rom_right_deg, '°'],
      ['Trunk incl mean', sm.trunk_incl_walk_mean_deg, '°'], ['Hip vertical osc', sm.hip_vertical_osc_m, 'm'],
      ['Arm swing L', sm.arm_swing_amp_left_trunklen, 'tl'], ['Arm swing R', sm.arm_swing_amp_right_trunklen, 'tl'],
    ]));
    wrap.appendChild(section('Calibration & QC', [
      ['Calibration', sm.calibration_method, ''], ['Walk direction', sm.walk_dir_out, ''], ['Dominant side', sm.dominant_side, ''],
      ['Valid frames', sm.valid_frame_pct, '%'], ['Imputed', sm.imputed_sample_pct, '%'], ['Longest gap', sm.longest_gap_s, 's'],
      ['Obliquity', sm.view_obliquity_median, ''], ['Depth drift', sm.depth_drift_pct, '%'], ['Effective fps', sm.effective_fs_hz, 'Hz'],
    ]));

    // ---- charts ----
    const cp = el('div', { class: 'panel' });
    cp.appendChild(el('h3', {}, ['Charts']));
    cp.appendChild(el('div', { class: 'chart-title' }, ['Hip progress & path vs time']));
    cp.appendChild(Ch.hipPathChart(res.grid, res.ev));
    cp.appendChild(el('div', { class: 'chart-title' }, ['Stride length per stride (L/R)']));
    cp.appendChild(Ch.strideChart(res.steps));
    cp.appendChild(el('div', { class: 'chart-title' }, ['Knee flexion L/R']));
    cp.appendChild(Ch.kneeChart(res.grid));
    cp.appendChild(el('div', { class: 'chart-title' }, ['Trunk inclination & torso yaw rate']));
    cp.appendChild(Ch.trunkYawChart(res.grid));
    cp.appendChild(el('div', { class: 'chart-title' }, ['Path with foot strikes']));
    cp.appendChild(Ch.pathMapChart(res.grid, res.steps));
    wrap.appendChild(cp);

    // ---- per-step table ----
    const stp = el('details');
    stp.appendChild(el('summary', {}, ['Per-step table (' + res.steps.length + ')']));
    const tw = el('div', { class: 'tablewrap' });
    const tbl = el('table');
    tbl.innerHTML = '<thead><tr><th>#</th><th>Foot</th><th>Seg</th><th>t HS</th><th>Stride len</th><th>Stride t</th><th>Step len</th><th>Incl</th></tr></thead>';
    const tb = el('tbody');
    res.steps.forEach((s) => {
      const tr = el('tr', { class: s.included_in_means ? '' : 'excluded' });
      tr.innerHTML = `<td>${s.step_index}</td><td>${s.foot}</td><td>${s.segment}</td><td>${U.fmt(s.t_hs_s, 2)}</td>` +
        `<td>${U.fmt(s.stride_length_m, 2)}</td><td>${U.fmt(s.stride_time_s, 2)}</td><td>${U.fmt(s.step_length_m, 2)}</td><td>${s.included_in_means ? '✓' : (s.exclusion_reason || '—')}</td>`;
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); tw.appendChild(tbl); stp.appendChild(tw);
    wrap.appendChild(stp);

    // ---- QC flags with tips ----
    const flags = (sm.qc_flags || '').split(';').filter(Boolean);
    if (flags.length) {
      const qp = el('div', { class: 'panel' });
      qp.appendChild(el('h3', {}, ['Quality flags']));
      flags.forEach((f) => {
        const base = f.split(':')[0];
        qp.appendChild(el('div', { class: 'flag' }, [f + (QC_TIPS[base] ? ' — ' + QC_TIPS[base] : '')]));
      });
      wrap.appendChild(qp);
    }

    // ---- operator observations (editable) ----
    const op = el('div', { class: 'panel' });
    op.appendChild(el('h3', {}, ['Operator observations (CDC)']));
    OBS.forEach(([key, label]) => {
      const lab = el('label', { class: 'check' });
      const cb = el('input', { type: 'checkbox', onchange: (e) => { sm[key] = e.target.checked; } });
      if (sm[key]) cb.checked = true;
      lab.appendChild(cb); lab.appendChild(el('span', {}, [label]));
      op.appendChild(lab);
    });
    wrap.appendChild(op);

    // ---- comparison card (2nd attempt) ----
    if (S.previous && S.previous.summary) {
      wrap.appendChild(comparisonCard(S.previous.summary, sm));
    }

    // ---- actions ----
    const act = el('div', { class: 'panel' });
    const uploadStatus = el('p', { class: 'opt', id: 'uploadStatus' }, [CFG.sheets.webhookUrl ? '' : 'Cloud upload not configured — results stay on device (download ZIP).']);
    if (!(S.previous && S.previous.summary)) {
      act.appendChild(el('button', { class: 'btn btn-primary btn-large', onclick: () => submit(sm, res) }, [T('results.submit')]));
    }
    const row = el('div', { class: 'btn-row', style: 'margin-top:10px' });
    row.appendChild(el('button', { class: 'btn', onclick: tryAgain }, [T('results.tryAgain')]));
    row.appendChild(el('button', { class: 'btn', onclick: () => Ex.downloadZip(res) }, [T('results.download')]));
    row.appendChild(el('button', { class: 'btn', onclick: () => R.go('entry') }, [T('results.back')]));
    act.appendChild(row);
    act.appendChild(uploadStatus);
    wrap.appendChild(act);

    // ---- important notice ----
    const notice = el('div', { class: 'notice' });
    notice.appendChild(el('h4', {}, [T('results.notice.title')]));
    notice.appendChild(el('p', {}, [T('results.notice.body')]));
    wrap.appendChild(notice);

    // save raw frames locally (IndexedDB) now
    try { Ex.saveRaw(sm.session_id, S.frames); } catch (e) {}

    return wrap;
  }

  function metric(label, val, unit, d) {
    const m = el('div', { class: 'metric' });
    m.appendChild(el('div', { class: 'k' }, [label]));
    const v = el('div', { class: 'v' });
    const text = (typeof val === 'string') ? (val || '—') : U.fmt(val, d);
    v.appendChild(document.createTextNode(text));
    if (unit) v.appendChild(el('small', {}, [' ' + unit]));
    m.appendChild(v);
    return m;
  }

  function section(title, rows) {
    const d = el('details');
    d.appendChild(el('summary', {}, [title]));
    const g = el('div', { class: 'metrics' });
    rows.forEach(([label, val, unit]) => g.appendChild(metric(label, val, unit, (typeof val === 'number' && val < 10) ? 2 : (unit === '%' || unit === '°' || unit === '/min') ? 1 : 2)));
    d.appendChild(g);
    return d;
  }

  function comparisonCard(prev, cur) {
    const p = el('div', { class: 'panel' });
    p.appendChild(el('h3', {}, ['Previous vs current']));
    const g = el('div', { class: 'metrics' });
    g.appendChild(metric('Previous time', prev.total_time_taken_s, 's', 1));
    g.appendChild(metric('Current time', cur.total_time_taken_s, 's', 1));
    g.appendChild(metric('Previous risk', prev.fall_risk_tier, '', 1));
    g.appendChild(metric('Current risk', cur.fall_risk_tier, '', 1));
    p.appendChild(g);
    const row = el('div', { class: 'btn-row', style: 'margin-top:10px' });
    row.appendChild(el('button', { class: 'btn', onclick: () => submitChosen(prev) }, [T('results.keepPrev')]));
    row.appendChild(el('button', { class: 'btn btn-primary', onclick: () => submitChosen(cur) }, [T('results.useCurrent')]));
    p.appendChild(row);
    return p;
  }

  function submitChosen(summary) {
    const S = R.Store;
    const res = (summary === (S.result && S.result.summary)) ? S.result : S.previous;
    summary.selected_attempt = true;
    submit(summary, res);
  }

  async function submit(summary, res) {
    const S = R.Store;
    summary.selected_attempt = true;
    summary.attempts_total = S.attemptNo || 1;
    Ex.historyAdd(summary);
    const statusEl = R.$('#uploadStatus');
    if (CFG.sheets.webhookUrl) {
      if (statusEl) statusEl.textContent = 'Uploading…';
      const r = await Ex.upload(res);
      summary._upload_status = r.status;
      if (statusEl) statusEl.textContent = uploadMsg(r.status);
    }
    setTimeout(() => R.go('history'), 800);
  }

  function uploadMsg(status) {
    switch (status) {
      case 'sent': return 'Saved to cloud ✓';
      case 'sent_unconfirmed': return 'Sent (cannot confirm — no-cors fallback)';
      case 'queued': return 'Queued offline — will retry from History';
      case 'not_configured': return 'Cloud upload not configured';
      default: return 'Saved locally';
    }
  }

  function tryAgain() {
    const S = R.Store;
    // keep current as "previous" for comparison on the next attempt
    if (S.result && S.result.summary && !S.result.error) {
      S.previous = S.result;
      S.attemptNo = (S.attemptNo || 1) + 1;
    }
    S.reset();
    R.go('setup');
  }

  R.register('results', render);
})(typeof window !== 'undefined' ? window : globalThis);
