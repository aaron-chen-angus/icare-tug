/* =============================================================================
 * TUG//LAB — screen-entry.js  (S1 Entry)
 * Language → instruction video → participant form → pre-test checks → PROCEED.
 * Also: "participant unable to perform" path.
 * Depends on: Router (app.js), T (strings.js), CONFIG, Util.
 * ========================================================================== */
(function (global) {
  'use strict';

  const R = global.Router;
  const CFG = global.CONFIG;
  const T = global.T;
  const Util = global.Util;
  const el = R.el;

  // Field spec for the participant form (key, label, type, required, extra)
  const SEX_OPTS = [['', '—'], ['male', 'Male'], ['female', 'Female'], ['other', 'Other']];
  const ASSIST_OPTS = [['none', 'None'], ['cane', 'Cane'], ['walker', 'Walker'], ['other', 'Other']];
  const CAM_OPTS = [['environment', 'Rear (recommended)'], ['user', 'Front']];
  const MODEL_OPTS = [['lite', 'Lite (fastest)'], ['full', 'Full (default)'], ['heavy', 'Heavy (most accurate)']];

  const CHECKS = [
    ['safety', 'chk.safety'],
    ['chair', 'chk.chair'],
    ['course', 'chk.course'],
    ['footwear', 'chk.footwear'],
    ['practice', 'chk.practice'],
  ];

  function ytEmbed(id) { return CFG.video.embedTemplate.replace('{ID}', id); }
  function ytLink(id) { return CFG.video.linkTemplate.replace('{ID}', id); }

  function render() {
    const S = R.Store;
    const wrap = el('div');
    wrap.appendChild(R.header());

    // ---- Panel 1: language + video --------------------------------------
    const p1 = el('div', { class: 'panel' });
    p1.appendChild(el('div', { class: 'brackets' }));
    p1.appendChild(el('h2', {}, [T('entry.panel1')]));

    const langGrid = el('div', { class: 'lang-grid' });
    const videoHolder = el('div', { id: 'videoHolder' });
    const langs = [['en', 'entry.lang.en'], ['zh', 'entry.lang.zh'], ['yue', 'entry.lang.yue']];

    function selectLang(code) {
      S.language = code;
      CFG._lang = code;
      R.$$('.lang-btn', langGrid).forEach((b) => b.classList.toggle('sel', b.dataset.lang === code));
      renderVideo(code);
      revealRest();
    }

    function renderVideo(code) {
      const id = CFG.video[code];
      videoHolder.innerHTML = '';
      const frame = el('div', { class: 'video-frame reveal' });
      const iframe = el('iframe', {
        src: ytEmbed(id),
        title: 'TUG instruction video',
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        allowfullscreen: 'true',
        referrerpolicy: 'strict-origin-when-cross-origin',
      });
      frame.appendChild(iframe);
      videoHolder.appendChild(frame);

      const sw = el('div', { class: 'lang-switch' });
      langs.forEach(([c, key]) => {
        sw.appendChild(el('button', {
          class: 'btn' + (c === code ? ' sel' : ''),
          onclick: () => selectLang(c),
        }, [T(key).split(' / ')[0]]));
      });
      videoHolder.appendChild(sw);
      videoHolder.appendChild(el('a', { href: ytLink(id), target: '_blank', rel: 'noopener', class: 'more-info' }, [T('entry.openYouTube') + ' ↗']));
    }

    langs.forEach(([code, key]) => {
      const b = el('button', { class: 'btn lang-btn', 'data-lang': code, onclick: () => selectLang(code) }, [T(key)]);
      langGrid.appendChild(b);
    });
    p1.appendChild(langGrid);
    p1.appendChild(videoHolder);
    wrap.appendChild(p1);

    // ---- Panel 2: participant form (hidden until language chosen) --------
    const p2 = el('div', { class: 'panel hidden', id: 'panel2' });
    p2.appendChild(el('div', { class: 'brackets' }));
    p2.appendChild(el('h2', {}, [T('entry.panel2')]));
    const form = el('form', { class: 'form', onsubmit: (e) => e.preventDefault() });

    function field(key, labelKey, required, inputNode, optNote) {
      const fg = el('div', { class: 'fg' });
      const lab = el('label', { for: 'f_' + key });
      lab.appendChild(document.createTextNode(T(labelKey) + ' '));
      if (required) lab.appendChild(el('span', { class: 'req' }, ['*']));
      else lab.appendChild(el('span', { class: 'opt' }, ['(' + T('f.optional') + ')']));
      fg.appendChild(lab);
      inputNode.id = 'f_' + key;
      inputNode.dataset.key = key;
      fg.appendChild(inputNode);
      fg.appendChild(el('div', { class: 'err', id: 'err_' + key }));
      if (optNote) fg.appendChild(el('div', { class: 'opt' }, [optNote]));
      return fg;
    }
    function textInput(key, attrs) { return el('input', Object.assign({ type: 'text', oninput: validate }, attrs || {})); }
    function numInput(key, attrs) { return el('input', Object.assign({ type: 'number', inputmode: 'decimal', oninput: validate }, attrs || {})); }
    function selectInput(key, opts, val) {
      const s = el('select', { onchange: validate });
      opts.forEach(([v, lbl]) => {
        const o = el('option', { value: v }, [lbl]);
        if (v === val) o.selected = true;
        s.appendChild(o);
      });
      return s;
    }

    const grid = el('div', { class: 'grid2' });
    grid.appendChild(field('participant_id', 'f.participantId', true, textInput('participant_id', { autocomplete: 'off', placeholder: 'e.g. P001' }), 'Never enter real names.'));
    grid.appendChild(field('age_years', 'f.age', true, numInput('age_years', { min: 1, max: 120, step: 1 })));
    grid.appendChild(field('sex', 'f.sex', true, selectInput('sex', SEX_OPTS)));
    grid.appendChild(field('height_cm', 'f.height', true, numInput('height_cm', { min: 100, max: 230, step: 0.5 })));
    grid.appendChild(field('body_mass_kg', 'f.mass', false, numInput('body_mass_kg', { min: 20, max: 300, step: 0.1 })));
    grid.appendChild(field('body_fat_pct', 'f.bodyFat', false, numInput('body_fat_pct', { min: 1, max: 70, step: 0.1 })));
    grid.appendChild(field('chair_seat_height_cm', 'f.chairSeat', false, numInput('chair_seat_height_cm', { min: 20, max: 80, step: 1, value: CFG.protocol.chairSeatHeightCm })));
    grid.appendChild(field('assistive_device', 'f.assist', false, selectInput('assistive_device', ASSIST_OPTS, 'none')));
    grid.appendChild(field('camera_facing', 'f.camera', false, selectInput('camera_facing', CAM_OPTS, 'environment')));
    grid.appendChild(field('pose_model', 'f.poseModel', false, selectInput('pose_model', MODEL_OPTS, CFG.pose.defaultModel)));
    form.appendChild(grid);
    form.appendChild(field('site', 'f.site', false, textInput('site', { placeholder: 'e.g. RP SSH lab' })));
    form.appendChild(field('operator_notes', 'f.notes', false, el('textarea', { oninput: validate })));
    p2.appendChild(form);
    wrap.appendChild(p2);

    // ---- Panel 3: pre-test checks ---------------------------------------
    const p3 = el('div', { class: 'panel hidden', id: 'panel3' });
    p3.appendChild(el('div', { class: 'brackets' }));
    p3.appendChild(el('h2', {}, [T('entry.panel3')]));
    CHECKS.forEach(([key, labelKey]) => {
      const lab = el('label', { class: 'check' });
      const cb = el('input', { type: 'checkbox', 'data-chk': key, onchange: validate });
      lab.appendChild(cb);
      lab.appendChild(el('span', {}, [T(labelKey)]));
      p3.appendChild(lab);
    });
    // consent only if webhook configured
    if (CFG.sheets.webhookUrl) {
      const lab = el('label', { class: 'check' });
      lab.appendChild(el('input', { type: 'checkbox', 'data-chk': 'consent', onchange: validate }));
      lab.appendChild(el('span', {}, [T('chk.consent')]));
      p3.appendChild(lab);
    }
    wrap.appendChild(p3);

    // ---- PROCEED + secondary buttons ------------------------------------
    const actions = el('div', { class: 'panel hidden', id: 'actionsPanel' });
    const missing = el('div', { class: 'err', id: 'missingList', style: 'min-height:0' });
    actions.appendChild(missing);
    const proceed = el('button', { class: 'btn btn-primary btn-large', id: 'proceedBtn', disabled: 'true', onclick: onProceed }, [T('entry.proceed')]);
    actions.appendChild(proceed);
    wrap.appendChild(actions);

    const secondary = el('div', { class: 'btn-row', style: 'margin-top:12px' });
    secondary.appendChild(el('button', { class: 'btn btn-danger', onclick: () => R.go('unable') }, [T('entry.unable')]));
    secondary.appendChild(el('button', { class: 'btn', onclick: () => R.go('history') }, [T('entry.history')]));
    wrap.appendChild(secondary);

    // ---- privacy + disclaimer -------------------------------------------
    const more = el('details', { class: 'more-info' });
    more.appendChild(el('summary', {}, ['Privacy & data']));
    more.appendChild(el('p', {}, ['All video and pose processing happens on this device. Video and raw landmarks never leave the phone. Only pseudonymous numeric results are uploaded, and only if cloud upload is configured and consent is given. Use participant IDs, never real names.']));
    wrap.appendChild(more);

    // ---- Advanced: replay mode (analyse a video file) -------------------
    const adv = el('details', { class: 'more-info', open: (CFG.debug.dev ? 'open' : null) });
    adv.appendChild(el('summary', {}, ['Advanced — analyse a video file (replay)']));
    adv.appendChild(el('p', { class: 'opt' }, ['Select a phone video of a TUG trial to analyse it through the same pose + analysis pipeline. Fill in participant data above first (at least ID, age, sex, height). Marked source = replay.']));
    const fileIn = el('input', { type: 'file', accept: 'video/*', onchange: onReplayFile });
    adv.appendChild(fileIn);
    wrap.appendChild(adv);

    function onReplayFile(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const data = readForm();
      if (!data.participant_id || !data.age_years || !data.sex || !data.height_cm) {
        alert('Enter at least Participant ID, Age, Sex and Height before replay.');
        e.target.value = '';
        return;
      }
      S.form = {
        participant_id: data.participant_id, age_years: parseInt(data.age_years, 10), sex: data.sex,
        height_cm: parseFloat(data.height_cm), body_mass_kg: data.body_mass_kg ? parseFloat(data.body_mass_kg) : null,
        body_fat_pct: data.body_fat_pct ? parseFloat(data.body_fat_pct) : null,
        chair_seat_height_cm: data.chair_seat_height_cm ? parseFloat(data.chair_seat_height_cm) : CFG.protocol.chairSeatHeightCm,
        assistive_device: data.assistive_device || 'none', camera_facing: 'environment',
        pose_model: data.pose_model || CFG.pose.defaultModel, site: data.site || '', operator_notes: data.operator_notes || '',
        instruction_language: S.language,
      };
      S.form.bmr_kcal_day = Util.bmr(S.form.sex, S.form.body_mass_kg, S.form.height_cm, S.form.age_years);
      S.checks = { safety: true, chair: true, course: true, footwear: true, practice: true };
      S.attemptNo = 1; S.reset();
      S.replayFile = file;
      R.go('replay');
    }
    wrap.appendChild(el('p', { class: 'footer-limits' }, [T('app.notDevice') + ' TUG is one component of fall-risk assessment (CDC STEADI).']));

    // ---- reveal + validation --------------------------------------------
    function revealRest() {
      ['panel2', 'panel3', 'actionsPanel'].forEach((id) => {
        const n = R.$('#' + id, wrap);
        if (n.classList.contains('hidden')) { n.classList.remove('hidden'); n.classList.add('reveal'); }
      });
      validate();
    }

    function readForm() {
      const data = {};
      R.$$('[data-key]', form).forEach((n) => { data[n.dataset.key] = n.value.trim(); });
      return data;
    }

    function validate() {
      const data = readForm();
      const errs = {};
      const miss = [];

      if (!data.participant_id) { errs.participant_id = 'Required'; miss.push('Participant ID'); }
      const age = parseFloat(data.age_years);
      if (!data.age_years || !(age >= CFG.inputs.ageMinYears && age <= CFG.inputs.ageMaxYears)) { errs.age_years = 'Enter a valid age'; miss.push('Age'); }
      if (!data.sex) { errs.sex = 'Required'; miss.push('Sex'); }
      const h = parseFloat(data.height_cm);
      if (!data.height_cm || !(h >= CFG.inputs.heightHardMinCm && h <= CFG.inputs.heightHardMaxCm)) {
        errs.height_cm = `Height must be ${CFG.inputs.heightHardMinCm}–${CFG.inputs.heightHardMaxCm} cm`; miss.push('Height');
      } else if (h < CFG.inputs.heightSoftMinCm || h > CFG.inputs.heightSoftMaxCm) {
        errs.height_cm = `Warning: outside typical calibration range (${CFG.inputs.heightSoftMinCm}–${CFG.inputs.heightSoftMaxCm} cm)`;
      }
      // optional fields: validate only if present
      if (data.body_mass_kg) { const m = parseFloat(data.body_mass_kg); if (!(m >= CFG.inputs.massMinKg && m <= CFG.inputs.massMaxKg)) errs.body_mass_kg = `Mass ${CFG.inputs.massMinKg}–${CFG.inputs.massMaxKg} kg`; }
      if (data.body_fat_pct) { const bf = parseFloat(data.body_fat_pct); if (!(bf >= CFG.inputs.bodyFatMinPct && bf <= CFG.inputs.bodyFatMaxPct)) errs.body_fat_pct = `Body fat ${CFG.inputs.bodyFatMinPct}–${CFG.inputs.bodyFatMaxPct}%`; }

      // show field errors
      R.$$('[data-key]', form).forEach((n) => {
        const e = R.$('#err_' + n.dataset.key, form);
        if (e) e.textContent = errs[n.dataset.key] || '';
      });

      // checks
      const checkNodes = R.$$('[data-chk]', wrap);
      const uncheckedBlocking = checkNodes.filter((c) => c.dataset.chk !== 'consent' && !c.checked);
      if (CFG.sheets.webhookUrl) {
        const consent = checkNodes.find((c) => c.dataset.chk === 'consent');
        if (consent && !consent.checked) miss.push('Data upload consent');
      }
      uncheckedBlocking.forEach((c) => {
        const labelKey = (CHECKS.find((x) => x[0] === c.dataset.chk) || [])[1];
        if (labelKey) miss.push('Pre-test check: ' + T(labelKey).split('.')[0].slice(0, 40));
      });

      const hardErr = ['participant_id', 'age_years', 'sex', 'height_cm', 'body_mass_kg', 'body_fat_pct']
        .some((k) => errs[k] && !errs[k].startsWith('Warning'));

      const ok = !hardErr && miss.length === 0;
      R.$('#proceedBtn', wrap).disabled = !ok;
      const ml = R.$('#missingList', wrap);
      ml.textContent = ok ? '' : (T('entry.missing') + ' ' + miss.slice(0, 6).join(' · '));
      return ok;
    }

    function onProceed() {
      if (!validate()) return;
      const data = readForm();
      // normalise types
      S.form = {
        participant_id: data.participant_id,
        age_years: parseInt(data.age_years, 10),
        sex: data.sex,
        height_cm: parseFloat(data.height_cm),
        body_mass_kg: data.body_mass_kg ? parseFloat(data.body_mass_kg) : null,
        body_fat_pct: data.body_fat_pct ? parseFloat(data.body_fat_pct) : null,
        chair_seat_height_cm: data.chair_seat_height_cm ? parseFloat(data.chair_seat_height_cm) : CFG.protocol.chairSeatHeightCm,
        assistive_device: data.assistive_device || 'none',
        camera_facing: data.camera_facing || 'environment',
        pose_model: data.pose_model || CFG.pose.defaultModel,
        site: data.site || '',
        operator_notes: data.operator_notes || '',
        instruction_language: S.language,
      };
      S.form.bmr_kcal_day = Util.bmr(S.form.sex, S.form.body_mass_kg, S.form.height_cm, S.form.age_years);
      S.checks = {};
      R.$$('[data-chk]', wrap).forEach((c) => { S.checks[c.dataset.chk] = c.checked; });
      S.attemptNo = 1;
      S.reset();
      R.go('setup');
    }

    return wrap;
  }

  // ---- Unable-to-perform screen -----------------------------------------
  function renderUnable() {
    const S = R.Store;
    const wrap = el('div');
    wrap.appendChild(R.header());
    const p = el('div', { class: 'panel' });
    p.appendChild(el('div', { class: 'brackets' }));
    p.appendChild(el('h2', {}, [T('entry.unable')]));
    const reason = el('select', {}, []);
    [['medical', 'Medical'], ['safety', 'Safety'], ['refused', 'Refused'], ['other', 'Other']]
      .forEach(([v, l]) => reason.appendChild(el('option', { value: v }, [l])));
    const fg1 = el('div', { class: 'fg' });
    fg1.appendChild(el('label', {}, ['Reason']));
    fg1.appendChild(reason);
    p.appendChild(fg1);
    const note = el('textarea', { placeholder: 'Details (optional)' });
    const fg2 = el('div', { class: 'fg' });
    fg2.appendChild(el('label', {}, ['Notes']));
    fg2.appendChild(note);
    p.appendChild(fg2);

    p.appendChild(el('button', {
      class: 'btn btn-primary btn-large', onclick: () => {
        S.form = S.form || {};
        S.unable = { reason: reason.value, note: note.value.trim() };
        R.go('resultsLite', { outcome: 'unable' });
      },
    }, ['RECORD UNABLE']));
    p.appendChild(el('button', { class: 'btn', style: 'margin-top:10px', onclick: () => R.go('entry') }, ['← BACK']));
    wrap.appendChild(p);
    return wrap;
  }

  // Records an 'unable' / 'aborted' Sessions row with EMPTY metrics (never zero)
  // then offers to submit/upload it, matching the brief (§2 finding #2, §14).
  function renderResultsLite(opts) {
    const S = R.Store;
    const outcome = (opts && opts.outcome) || 'unable';
    const wrap = el('div');
    wrap.appendChild(R.header());
    const p = el('div', { class: 'panel' });
    p.appendChild(el('div', { class: 'brackets' }));
    p.appendChild(el('h2', {}, ['Recorded: ' + outcome.toUpperCase()]));

    // Build an empty-metric Sessions row (schema keys default to null).
    const now = new Date();
    const Ex = global.Exporter;
    const base = {};
    global.SCHEMA.keysOf('Sessions').forEach((k) => { base[k] = null; });
    Object.assign(base, {
      session_id: Util.uuid(), timestamp_utc: now.toISOString(), utc_offset_min: -now.getTimezoneOffset(),
      app_version: CFG.app.version, analysis_version: CFG.app.analysisVersion, schema_version: CFG.app.schemaVersion,
      participant_id: (S.form && S.form.participant_id) || null, age_years: (S.form && S.form.age_years) || null,
      sex: (S.form && S.form.sex) || null, height_cm: (S.form && S.form.height_cm) || null,
      instruction_language: (S.form && S.form.instruction_language) || S.language,
      attempt_no: 1, attempts_total: 1, selected_attempt: true,
      test_outcome: outcome, unable_reason: S.unable ? (S.unable.reason + (S.unable.note ? ': ' + S.unable.note : '')) : null,
      source: 'live', panning_mode: CFG.panning.enabled,
      course_length_m: CFG.protocol.courseLengthM, max_duration_s: CFG.protocol.maxDurationS,
      manual_stop: outcome === 'aborted', qc_flags: outcome === 'aborted' ? 'MANUAL_STOP' : '', qc_pass: false,
      fall_probability: null, valid_for_norm: false,
    });

    p.appendChild(el('p', {}, ['Stored with empty metrics (never zeros). Participant: ' + (base.participant_id || '—') + '.']));
    const status = el('p', { class: 'opt', id: 'liteStatus' }, [CFG.sheets.webhookUrl ? '' : 'Cloud upload not configured — kept on device.']);

    const row = el('div', { class: 'btn-row' });
    row.appendChild(el('button', {
      class: 'btn btn-primary', onclick: async () => {
        Ex.historyAdd(base);
        if (CFG.sheets.webhookUrl) {
          R.$('#liteStatus').textContent = 'Uploading…';
          const r = await Ex.upload({ summary: base, steps: [], events: [] });
          R.$('#liteStatus').textContent = r.status === 'sent' ? 'Saved to cloud ✓' : r.status === 'queued' ? 'Queued offline' : 'Saved';
        }
        setTimeout(() => R.go('history'), 600);
      },
    }, ['SUBMIT & FINISH']));
    row.appendChild(el('button', { class: 'btn', onclick: () => R.go('entry') }, ['DISCARD']));
    p.appendChild(row);
    p.appendChild(status);
    wrap.appendChild(p);
    return wrap;
  }

  R.register('entry', render);
  R.register('unable', renderUnable);
  R.register('resultsLite', renderResultsLite);
})(typeof window !== 'undefined' ? window : globalThis);
