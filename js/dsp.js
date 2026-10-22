/* =============================================================================
 * TUG//LAB — dsp.js
 * Signal processing: resample, zero-lag Butterworth (filtfilt), derivative,
 * peak finding, gap bridging, unwrap, basic stats. No dependencies.
 * ========================================================================== */
(function (global) {
  'use strict';

  const DSP = {};

  /* ---- resample a (t,y) series onto a uniform grid at fs Hz -------------
   * ts: ascending times (s). ys: values (may contain null/NaN for invalid).
   * Returns { t:[], y:[], gap:[] } where gap[i]=true if the sample came from a
   * bridged gap or had no nearby valid data.
   */
  DSP.resampleUniform = function (ts, ys, fs, t0, t1, maxGapS) {
    if (!ts.length) return { t: [], y: [], gap: [] };
    t0 = (t0 == null) ? ts[0] : t0;
    t1 = (t1 == null) ? ts[ts.length - 1] : t1;
    const dt = 1 / fs;
    const n = Math.max(1, Math.round((t1 - t0) / dt) + 1);
    const outT = new Array(n), outY = new Array(n), gap = new Array(n);
    // build list of valid (t,y)
    const vt = [], vy = [];
    for (let i = 0; i < ts.length; i++) {
      if (ys[i] != null && isFinite(ys[i])) { vt.push(ts[i]); vy.push(ys[i]); }
    }
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * dt;
      outT[i] = t;
      if (!vt.length) { outY[i] = null; gap[i] = true; continue; }
      while (j < vt.length - 1 && vt[j + 1] < t) j++;
      // find bracketing valid samples
      let lo = j, hi = j;
      while (lo > 0 && vt[lo] > t) lo--;
      hi = Math.min(vt.length - 1, lo + 1);
      if (vt[lo] <= t && vt[hi] >= t && hi !== lo) {
        const span = vt[hi] - vt[lo];
        const frac = span > 0 ? (t - vt[lo]) / span : 0;
        outY[i] = vy[lo] + frac * (vy[hi] - vy[lo]);
        gap[i] = (span > (maxGapS || Infinity));
      } else {
        // extrapolate with nearest
        const k = (Math.abs(vt[lo] - t) <= Math.abs(vt[hi] - t)) ? lo : hi;
        outY[i] = vy[k];
        gap[i] = Math.abs(vt[k] - t) > (maxGapS || Infinity);
      }
    }
    return { t: outT, y: outY, gap };
  };

  /* ---- 2nd-order Butterworth low-pass coefficients (bilinear) ------------ */
  function butter2(cutoffHz, fs) {
    const wc = Math.tan(Math.PI * cutoffHz / fs); // prewarped
    const k1 = Math.SQRT2 * wc;
    const k2 = wc * wc;
    const a0 = 1 + k1 + k2;
    const b0 = k2 / a0;
    const b1 = 2 * b0;
    const b2 = b0;
    const a1 = 2 * (k2 - 1) / a0;
    const a2 = (1 - k1 + k2) / a0;
    return { b: [b0, b1, b2], a: [1, a1, a2] };
  }

  function filterOnce(x, b, a) {
    const y = new Array(x.length).fill(0);
    for (let i = 0; i < x.length; i++) {
      let acc = 0;
      for (let k = 0; k < b.length; k++) if (i - k >= 0) acc += b[k] * x[i - k];
      for (let k = 1; k < a.length; k++) if (i - k >= 0) acc -= a[k] * y[i - k];
      y[i] = acc;
    }
    return y;
  }

  /* ---- zero-lag filtering: forward+backward with reflection padding ------ */
  DSP.filtfilt = function (x, cutoffHz, fs, pad) {
    if (!x || x.length < 4) return (x || []).slice();
    pad = Math.min(pad == null ? 30 : pad, x.length - 1);
    const { b, a } = butter2(cutoffHz, fs);
    // reflection pad both ends
    const head = [], tail = [];
    for (let i = 1; i <= pad; i++) {
      head.push(2 * x[0] - x[i]);
      tail.push(2 * x[x.length - 1] - x[x.length - 1 - i]);
    }
    head.reverse();
    const padded = head.concat(x, tail);
    let y = filterOnce(padded, b, a);
    y.reverse();
    y = filterOnce(y, b, a);
    y.reverse();
    return y.slice(pad, pad + x.length);
  };

  /* ---- central-difference derivative ------------------------------------ */
  DSP.derivative = function (y, fs) {
    const n = y.length, d = new Array(n).fill(0);
    const dt = 1 / fs;
    for (let i = 0; i < n; i++) {
      if (i === 0) d[i] = (y[1] - y[0]) / dt;
      else if (i === n - 1) d[i] = (y[n - 1] - y[n - 2]) / dt;
      else d[i] = (y[i + 1] - y[i - 1]) / (2 * dt);
    }
    return d;
  };

  /* ---- peak finding: local maxima with min separation & prominence ------ */
  DSP.findPeaks = function (y, opts) {
    opts = opts || {};
    const minSep = opts.minSep || 1;           // samples
    const minProm = opts.minProminence || 0;    // value units
    const peaks = [];
    for (let i = 1; i < y.length - 1; i++) {
      if (y[i] > y[i - 1] && y[i] >= y[i + 1]) {
        // prominence: drop to the lower of the two neighbouring valleys
        let l = i; while (l > 0 && y[l - 1] <= y[i]) l--;
        let r = i; while (r < y.length - 1 && y[r + 1] <= y[i]) r++;
        const leftMin = Math.min.apply(null, y.slice(l, i + 1));
        const rightMin = Math.min.apply(null, y.slice(i, r + 1));
        const prom = y[i] - Math.max(leftMin, rightMin);
        if (prom >= minProm) peaks.push({ index: i, value: y[i], prominence: prom });
      }
    }
    // enforce min separation, keep taller
    peaks.sort((p, q) => q.value - p.value);
    const kept = [];
    peaks.forEach((p) => {
      if (kept.every((k) => Math.abs(k.index - p.index) >= minSep)) kept.push(p);
    });
    kept.sort((p, q) => p.index - q.index);
    return kept;
  };

  DSP.findValleys = function (y, opts) {
    const neg = y.map((v) => -v);
    return DSP.findPeaks(neg, opts).map((p) => ({ index: p.index, value: -p.value, prominence: p.prominence }));
  };

  /* ---- unwrap angles (degrees) ------------------------------------------ */
  DSP.unwrapDeg = function (a) {
    const out = a.slice();
    for (let i = 1; i < out.length; i++) {
      let d = out[i] - out[i - 1];
      while (d > 180) { out[i] -= 360; d = out[i] - out[i - 1]; }
      while (d < -180) { out[i] += 360; d = out[i] - out[i - 1]; }
    }
    return out;
  };

  /* ---- majority-vote sign over a window, debounced ---------------------- */
  DSP.debounceSign = function (sign, fs, windowS, minHoldS) {
    const w = Math.max(1, Math.round((windowS || 0.3) * fs));
    const minHold = Math.max(1, Math.round((minHoldS || 0.25) * fs));
    const n = sign.length;
    const vote = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k++) s += (sign[k] > 0 ? 1 : (sign[k] < 0 ? -1 : 0));
      vote[i] = s >= 0 ? 1 : -1;
    }
    // debounce: suppress flips shorter than minHold
    const out = vote.slice();
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n && out[j] === out[i]) j++;
      if (j - i < minHold && i > 0) for (let k = i; k < j; k++) out[k] = out[i - 1];
      i = j;
    }
    return out;
  };

  DSP.movingAverage = function (y, win) {
    const n = y.length, out = new Array(n);
    const w = Math.max(1, win | 0);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w); k++) { if (y[k] != null && isFinite(y[k])) { s += y[k]; c++; } }
      out[i] = c ? s / c : null;
    }
    return out;
  };

  DSP.percentile = function (arr, p) {
    const v = arr.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const idx = global.Util ? global.Util.clamp(Math.round((p / 100) * (v.length - 1)), 0, v.length - 1)
      : Math.min(v.length - 1, Math.max(0, Math.round((p / 100) * (v.length - 1))));
    return v[idx];
  };

  global.DSP = DSP;
})(typeof window !== 'undefined' ? window : globalThis);
