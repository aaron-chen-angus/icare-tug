/* =============================================================================
 * TUG//LAB — strings.js
 * UI text dictionary. English now; keys are namespaced so Mandarin (zh) and
 * Cantonese (yue) UI can be dropped in later without touching app.js.
 *
 * Usage:  T('entry.title')   ->  "Timed Up and Go"
 *         T('risk.atRisk', {t: 12.4})  (supports {placeholder} interpolation)
 * ========================================================================== */
(function (global) {
  'use strict';

  const STRINGS = {
    en: {
      'app.subtitle': 'Timed Up and Go · Biomechanics Lab',
      'app.notDevice': 'Research / screening instrument — not a medical device.',

      // S1 entry
      'entry.panel1': '1 · Choose instruction video language',
      'entry.lang.en': 'ENGLISH',
      'entry.lang.zh': '普通话 / MANDARIN',
      'entry.lang.yue': '粤语 / CANTONESE',
      'entry.openYouTube': 'Open on YouTube',
      'entry.panel2': '2 · Participant & session',
      'entry.panel3': '3 · Pre-test checks',
      'entry.proceed': 'PROCEED',
      'entry.unable': 'PARTICIPANT UNABLE TO PERFORM',
      'entry.history': 'HISTORY',
      'entry.missing': 'Complete these first:',

      // form fields
      'f.participantId': 'Participant ID',
      'f.age': 'Age (years)',
      'f.sex': 'Sex',
      'f.height': 'Height (cm)',
      'f.mass': 'Body mass (kg)',
      'f.bodyFat': 'Body fat (%)',
      'f.chairSeat': 'Chair seat height (cm)',
      'f.assist': 'Assistive device',
      'f.site': 'Site / session label',
      'f.notes': 'Operator notes',
      'f.camera': 'Camera',
      'f.poseModel': 'Pose model',
      'f.optional': 'optional',
      'f.required': 'required',

      // pre-test checks
      'chk.safety': 'Participant is fit to test; operator will stay beside them.',
      'chk.chair': 'Sturdy armchair (~46 cm seat), not against a wall, will not slide or tip.',
      'chk.course': 'Floor marker / cone placed 3 m (10 ft) from the front of the chair.',
      'chk.footwear': 'Usual footwear; usual walking aid if needed; no physical assistance.',
      'chk.practice': 'One untimed practice trial completed.',
      'chk.consent': 'Consent for pseudonymous data upload.',

      // S2 setup
      'setup.title': 'Setup & calibrate',
      'setup.start': 'START TEST',
      'setup.permission': 'Camera permission needed. Tap to allow.',
      'setup.follow': 'Hold the phone in portrait and follow the participant as they move. Keep their whole body in frame.',
      'setup.markHeight': 'Stand the participant still, side-on, to calibrate scale.',

      // S3 live
      'live.go': 'GO',
      'live.stop': 'STOP',
      'live.complete': 'COMPLETE TEST',
      'live.getReady': 'GET READY',

      // phases
      'phase.SEATED_PRE': 'Seated',
      'phase.SIT_TO_STAND': 'Sit → Stand',
      'phase.WALK_OUT': 'Walk out',
      'phase.TURN_1': 'Turn (cone)',
      'phase.WALK_BACK': 'Walk back',
      'phase.TURN_2': 'Turn (chair)',
      'phase.STAND_TO_SIT': 'Stand → Sit',
      'phase.SEATED_END': 'Seated',

      // S4
      'analysing.title': 'Analysing',
      'analysing.filter': 'Filtering signals…',
      'analysing.phases': 'Detecting phases…',
      'analysing.gait': 'Computing gait…',

      // S5 results
      'results.seconds': 'SECONDS',
      'results.submit': 'SUBMIT THIS RESULT',
      'results.tryAgain': 'TRY AGAIN',
      'results.download': 'DOWNLOAD ZIP',
      'results.back': 'BACK TO START',
      'results.keepPrev': 'KEEP PREVIOUS',
      'results.useCurrent': 'USE CURRENT',
      'results.notice.title': 'Important notice',
      'results.notice.body': 'Screening estimate from camera analysis — not a diagnosis. TUG is one component of fall-risk assessment (CDC STEADI). Observed postural or gait changes may signal problems needing further evaluation; consult a clinician.',

      // risk labels
      'risk.atRisk': 'AT RISK',
      'risk.notAtRisk': 'NOT AT RISK',
      'risk.low': 'LOW',
      'risk.moderate': 'MODERATE',
      'risk.high': 'HIGH',
      'risk.cdcNote': 'CDC cut-point ≥ 12.0 s',

      // norms
      'norm.faster': 'FASTER than age norm',
      'norm.within': 'WITHIN age norm',
      'norm.slower': 'SLOWER than age norm',

      // QC
      'qc.pass': 'PASS',
      'qc.review': 'REVIEW',

      // history
      'hist.title': 'History & outbox',
      'hist.empty': 'No local sessions yet.',
      'hist.testConn': 'Test connection',
      'hist.retry': 'Retry upload',
      'hist.deleteAll': 'Delete all local data',

      // misc
      'common.cancel': 'Cancel',
      'common.confirm': 'Confirm',
      'common.ok': 'OK',
      'common.leaveTest': 'Leave test? Progress will be lost.',
      'rotate.msg': 'ROTATE TO PORTRAIT',
    },
  };

  function T(key, vars, lang) {
    const L = lang || (global.CONFIG && global.CONFIG._lang) || 'en';
    const dict = STRINGS[L] || STRINGS.en;
    let s = (dict[key] != null ? dict[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key));
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    }
    return s;
  }

  global.STRINGS = STRINGS;
  global.T = T;
})(typeof window !== 'undefined' ? window : globalThis);
