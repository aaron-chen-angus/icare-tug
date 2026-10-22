/* =============================================================================
 * TUG//LAB — util.js
 * Small shared helpers: formatting, validation, BMR, storage, misc.
 * ========================================================================== */
(function (global) {
  'use strict';

  const Util = {
    uuid() {
      if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
    },

    clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); },

    // Round to n decimals, returning a Number (or null passthrough)
    round(v, n) {
      if (v == null || !isFinite(v)) return null;
      const p = Math.pow(10, n == null ? 2 : n);
      return Math.round(v * p) / p;
    },

    fmt(v, n, dash) {
      if (v == null || !isFinite(v)) return dash || '—';
      return Number(v).toFixed(n == null ? 2 : n);
    },

    // Mifflin–St Jeor BMR. sex: 'male'|'female'. Returns null for other/missing.
    bmr(sex, massKg, heightCm, ageYears) {
      if (!massKg || !heightCm || !ageYears) return null;
      if (sex === 'male') return Math.round(10 * massKg + 6.25 * heightCm - 5 * ageYears + 5);
      if (sex === 'female') return Math.round(10 * massKg + 6.25 * heightCm - 5 * ageYears - 161);
      return null; // 'other' -> no silent default
    },

    nowStamp() {
      const d = new Date();
      const z = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
    },

    // localStorage JSON helpers (namespaced)
    lsGet(key, def) {
      try { const v = localStorage.getItem('tug.' + key); return v == null ? def : JSON.parse(v); }
      catch (e) { return def; }
    },
    lsSet(key, val) {
      try { localStorage.setItem('tug.' + key, JSON.stringify(val)); return true; }
      catch (e) { return false; }
    },
    lsDel(key) { try { localStorage.removeItem('tug.' + key); } catch (e) {} },

    mean(arr) {
      const v = arr.filter((x) => x != null && isFinite(x));
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    },
    sd(arr) {
      const v = arr.filter((x) => x != null && isFinite(x));
      if (v.length < 2) return null;
      const m = Util.mean(v);
      return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1));
    },
    median(arr) {
      const v = arr.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
      if (!v.length) return null;
      const m = Math.floor(v.length / 2);
      return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    },
    // symmetry %: |L-R| / (0.5(L+R)) * 100
    asymPct(l, r) {
      if (l == null || r == null || !isFinite(l) || !isFinite(r)) return null;
      const denom = 0.5 * (l + r);
      if (denom === 0) return null;
      return Math.abs(l - r) / denom * 100;
    },
  };

  global.Util = Util;
})(typeof window !== 'undefined' ? window : globalThis);
