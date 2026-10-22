/* =============================================================================
 * TUG//LAB — config.js
 * Single source of truth for ALL tunable parameters, thresholds, norms,
 * video IDs and the Google Sheets webhook.
 *
 * Markers:
 *   [TUNE]   value is a sensible default but not clinically validated — tune
 *            against real recordings before trusting it.
 *   [VERIFY] value is drawn from literature but MUST be re-checked against the
 *            primary source before publishing.
 *
 * A full snapshot of CONFIG is written into every *_session.json so any result
 * can be reproduced exactly from the parameters that produced it.
 * ========================================================================== */
(function (global) {
  'use strict';

  const CONFIG = {
    app: {
      version: '1.0.0',
      analysisVersion: '1.0.0',
      schemaVersion: '1.0',
      name: 'TUG//LAB',
    },

    /* --- Clinical / test protocol ------------------------------------------ */
    protocol: {
      courseLengthM: 3.0,          // chair front -> cone/line (CDC: 3 m / 10 ft)
      chairSeatHeightCm: 46,       // standard armchair
      countdownS: 3,
      preRollS: 1.5,               // seated baseline captured before GO
      tailS: 1.5,                  // analysis tail after seat contact
      maxDurationS: 60,            // hard stop
      autoFinish: true,            // auto-complete when seated + still
      fallRiskCdcS: 12.0,          // CDC STEADI cut-point
      altCutoffS: 13.5,            // Barry et al. (2014) most-used cut-point
    },

    /* --- Risk tiers (UI colouring convention, NOT a published scale) ------- */
    risk: {
      tierLowBelowS: 10.0,         // [TUNE] app convention built on CDC cut-point
      tierHighAtS: 12.0,           // [TUNE]
    },

    /* --- Normative reference (community-dwelling older adults) ------------- */
    norms: {
      // Bohannon (2006) descriptive meta-analysis  [VERIFY before publishing]
      // band: [mean, ciLow, ciHigh] seconds
      bohannon2006: {
        '60-69': { low: 60, high: 69, mean: 8.1, ciLow: 7.1, ciHigh: 9.0 },
        '70-79': { low: 70, high: 79, mean: 9.2, ciLow: 8.2, ciHigh: 10.2 },
        '80-99': { low: 80, high: 99, mean: 11.3, ciLow: 10.0, ciHigh: 12.7 },
      },
    },

    /* --- Signal processing ------------------------------------------------- */
    signal: {
      resampleHz: 30,
      cutoffHz: 6,                 // [TUNE] zero-lag Butterworth for body markers
      cutoffFootHz: 8,             // sharper cutoff preserves heel-strike timing
      maxGapS: 0.25,               // bridge gaps up to this; flag longer ones
      minVisibility: 0.5,
      padSamples: 30,              // reflection padding for filtfilt
      butterOrder: 2,
    },

    /* --- Phase / event detection ------------------------------------------- */
    events: {
      seatOffPct: 0.10,            // hip-progress threshold for movement onset
      standingPct: 0.90,           // hip-progress threshold for full extension
      sitContactPct: 0.10,
      standKneeToleranceDeg: 20,
      turnSpeedFrac: 0.5,          // [TUNE] fraction of median walk speed for turns
      seatContactMaxSpeedMs: 0.05, // [TUNE] near-zero vertical speed at contact
    },

    /* --- Gait event detection (Zeni 2008) ---------------------------------- */
    gait: {
      minHsIntervalS: 0.40,        // [TUNE] min separation between same-foot events
      minProminenceTrunk: 0.15,    // [TUNE] min peak prominence (trunk lengths)
      steadyStateOnly: false,      // [TUNE] drop first/last stride of each segment
      minWalkSpeedMs: 0.15,        // gait-initiation fallback speed
    },

    /* --- Quality control limits -------------------------------------------- */
    qc: {
      minFps: 15,
      minValidFramePct: 90,
      maxImputedPct: 10,
      maxGapS: 0.5,
      maxObliquity: 0.2,           // median hip-sep / trunk-len for side-on view
      maxScaleDiffPct: 15,
      maxDepthDriftPct: 10,
      maxKnee2D3D: 10,             // deg disagreement 2D vs 3D knee angle
      maxShankVerticalDeg: 5,      // standing shank deviation = camera tilt
      hipRiseMinM: 0.15,
      hipRiseMaxM: 0.65,
      courseCompletedFrac: 0.70,   // max path must reach >= 70% of course length
    },

    /* --- Camera ------------------------------------------------------------ */
    camera: {
      width: 720,                  // portrait: ideal capture width
      height: 1280,                // portrait: ideal capture height
      fps: 30,
    },

    /* --- Operator-following (panning) camera -------------------------------
     * This app follows the subject with a handheld phone in portrait, rather
     * than a static landscape camera. A moving camera breaks the classic
     * "image x = walking axis" assumption, so analysis is driven primarily by
     * MediaPipe WORLD landmarks (metric, pelvis-origin, camera-motion-invariant
     * for body-relative geometry). Path distance / gait velocity are
     * reconstructed by integrating the subject's world-frame step displacement.
     */
    panning: {
      enabled: true,              // operator-following mode (your requested change)
      // Primary scale source when panning: MediaPipe world landmarks are already
      // metric, so stride length / joint geometry need no pixel scale. We still
      // compute an image-pixel body scale for overlay sanity + QC cross-check.
      worldLandmarksPrimary: true,
      // Path reconstruction: integrate forward foot displacement in the world
      // frame (anterior-posterior axis derived from facing direction) between
      // successive stance feet to rebuild travelled distance without a fixed
      // image reference.
      pathFromSteps: true,
      // Max allowed camera-angle wobble before flagging; estimated from the
      // stability of the world vertical (gravity) axis across frames.
      maxCameraYawRateDegS: 220,  // [TUNE] panning faster than this = flag
      // Smoothing of the estimated camera pan (EMA alpha).
      panEmaAlpha: 0.3,
    },

    /* --- Live (causal) feedback -------------------------------------------- */
    live: {
      emaAlpha: 0.4,
      autoFinishStillS: 1.5,
      autoFinishJitter: 0.04,      // trunk-length jitter to count as "still"
    },

    /* --- Google Sheets ----------------------------------------------------- */
    sheets: {
      // Apps Script Web app /exec URL (deployed: execute as Me, access Anyone).
      webhookUrl: 'https://script.google.com/macros/s/AKfycby3DdObJuf1K2Zb1iWiXzw6_QrayqH9KgDnY-cbnewyiZvEiHkQ49dcoq4lqO5W4F9PHQ/exec',
      autoUpload: true,            // upload to Google Sheets automatically on test completion
      uploadFrames: false,         // also upload the 30 Hz Frames table
    },

    /* --- Instruction videos (YouTube Shorts IDs) --------------------------- */
    video: {
      en: 'IHfv93f8wk8',
      zh: 'hgNUROqcMcc',
      yue: 'EqbAyOtn3RQ',
      embedTemplate: 'https://www.youtube-nocookie.com/embed/{ID}?rel=0&playsinline=1&modestbranding=1',
      linkTemplate: 'https://www.youtube.com/shorts/{ID}',
    },

    /* --- MediaPipe pose ---------------------------------------------------- */
    pose: {
      // Pinned CDN version (same loading approach as STS pose-engine).
      visionBundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
      wasmBase: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
      models: {
        lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
        heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
      },
      defaultModel: 'full',
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      numPoses: 1,
    },

    /* --- UI flags ---------------------------------------------------------- */
    ui: {
      requireVideoPlayed: false,   // if true, PROCEED only after playback starts
      maxHistory: 50,
      maxRawAttemptsInDb: 10,
    },

    /* --- Validation input ranges ------------------------------------------- */
    inputs: {
      heightHardMinCm: 100,
      heightHardMaxCm: 230,
      heightSoftMinCm: 120,
      heightSoftMaxCm: 210,
      massMinKg: 20,
      massMaxKg: 300,
      bodyFatMinPct: 1,
      bodyFatMaxPct: 70,
      ageMinYears: 1,
      ageMaxYears: 120,
    },

    debug: {
      enabled: /[?&]debug=1/.test(global.location ? global.location.search : ''),
      dev: /[?&]dev=1/.test(global.location ? global.location.search : ''),
      erudaCdn: 'https://cdn.jsdelivr.net/npm/eruda@3/eruda.min.js',
    },
  };

  global.CONFIG = CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
