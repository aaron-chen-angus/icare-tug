/* =============================================================================
 * TUG//LAB — charts.js
 * Dependency-free canvas charts. Fluid width; legible at 320 px (min font 11).
 * Each builder returns a <canvas class="chart"> ready to insert.
 * ========================================================================== */
(function (global) {
  'use strict';

  const COL = { blue: '#00d4ff', orange: '#ff6a00', orangeSoft: '#ff8c3a', gold: '#ffd700', green: '#4cdf7c', red: '#ff3b30', dim: '#8fa6c8', text: '#dfe9ff', grid: 'rgba(0,212,255,.12)' };
  const PHASE_COL = { SIT_TO_STAND: 'rgba(255,106,0,.18)', WALK_OUT: 'rgba(0,212,255,.12)', TURN_1: 'rgba(255,215,0,.16)', WALK_BACK: 'rgba(0,212,255,.12)', TURN_2: 'rgba(255,215,0,.16)', STAND_TO_SIT: 'rgba(255,106,0,.18)' };

  function makeCanvas(h) {
    const c = document.createElement('canvas');
    c.className = 'chart';
    const w = 640;
    c.width = w; c.height = h || 220;
    c.style.width = '100%';
    return c;
  }

  function setup(c, pad) {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const p = pad || { l: 42, r: 12, t: 14, b: 26 };
    const plot = { x: p.l, y: p.t, w: c.width - p.l - p.r, h: c.height - p.t - p.b };
    return { ctx, plot };
  }

  function axes(ctx, plot, xr, yr, xlabel, ylabel) {
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y); ctx.lineTo(plot.x, plot.y + plot.h); ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
    ctx.stroke();
    ctx.fillStyle = COL.dim; ctx.font = '11px Rajdhani, sans-serif';
    // y ticks
    for (let i = 0; i <= 4; i++) {
      const v = yr[0] + (yr[1] - yr[0]) * i / 4;
      const y = plot.y + plot.h - plot.h * i / 4;
      ctx.fillText(v.toFixed(1), 4, y + 3);
      ctx.strokeStyle = COL.grid; ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke();
    }
    if (ylabel) { ctx.save(); ctx.translate(10, plot.y + plot.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, -20, 0); ctx.restore(); }
    if (xlabel) ctx.fillText(xlabel, plot.x + plot.w - 40, plot.y + plot.h + 20);
  }

  function sx(plot, xr, v) { return plot.x + (v - xr[0]) / (xr[1] - xr[0] || 1) * plot.w; }
  function sy(plot, yr, v) { return plot.y + plot.h - (v - yr[0]) / (yr[1] - yr[0] || 1) * plot.h; }

  function rangeOf(arr, pad) {
    const v = arr.filter((x) => x != null && isFinite(x));
    if (!v.length) return [0, 1];
    let mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
    if (mn === mx) { mn -= 1; mx += 1; }
    const p = (mx - mn) * (pad || 0.08);
    return [mn - p, mx + p];
  }

  function phaseShade(ctx, plot, grid, xr) {
    if (!grid || !grid.phase) return;
    let start = 0;
    for (let i = 1; i <= grid.phase.length; i++) {
      if (i === grid.phase.length || grid.phase[i] !== grid.phase[start]) {
        const ph = grid.phase[start];
        if (PHASE_COL[ph]) {
          const x0 = sx(plot, xr, grid.t[start]), x1 = sx(plot, xr, grid.t[Math.min(i, grid.t.length - 1)]);
          ctx.fillStyle = PHASE_COL[ph];
          ctx.fillRect(x0, plot.y, Math.max(1, x1 - x0), plot.h);
        }
        start = i;
      }
    }
  }

  function line(ctx, plot, xr, yr, xs, ys, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    let started = false;
    for (let i = 0; i < xs.length; i++) {
      if (ys[i] == null || !isFinite(ys[i])) { started = false; continue; }
      const X = sx(plot, xr, xs[i]), Y = sy(plot, yr, ys[i]);
      if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
  }

  /* ---- (a) hip height + path vs time with phase shading + events -------- */
  function hipPathChart(grid, ev) {
    const c = makeCanvas(220);
    const { ctx, plot } = setup(c);
    const xr = [grid.t[0], grid.t[grid.t.length - 1]];
    phaseShade(ctx, plot, grid, xr);
    const yrP = rangeOf(grid.pathS);
    axes(ctx, plot, xr, yrP, 's', 'path m');
    line(ctx, plot, xr, yrP, grid.t, grid.pathS, COL.blue);
    // hip progress on same panel scaled to path range
    const pr = rangeOf(grid.p);
    const pScaled = grid.p.map((v) => (v - pr[0]) / (pr[1] - pr[0] || 1) * (yrP[1] - yrP[0]) + yrP[0]);
    line(ctx, plot, xr, yrP, grid.t, pScaled, COL.orangeSoft);
    // event markers
    ['SEAT_OFF', 'STANDING', 'TURN1_START', 'TURN1_END', 'TURN2_START', 'SIT_DESCENT_START', 'SEAT_CONTACT'].forEach((k) => {
      if (!ev[k]) return;
      const X = sx(plot, xr, ev[k].t);
      ctx.strokeStyle = COL.gold; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X, plot.y); ctx.lineTo(X, plot.y + plot.h); ctx.stroke(); ctx.setLineDash([]);
    });
    legend(ctx, plot, [['path', COL.blue], ['hip progress', COL.orangeSoft]]);
    return c;
  }

  /* ---- (b) stride length & time per stride, L vs R ---------------------- */
  function strideChart(steps) {
    const c = makeCanvas(200);
    const { ctx, plot } = setup(c);
    const strides = steps.filter((s) => s.stride_length_m != null);
    if (!strides.length) { noData(ctx, plot); return c; }
    const yr = rangeOf(strides.map((s) => s.stride_length_m), 0.2);
    const xr = [0, strides.length];
    axes(ctx, plot, xr, yr, 'stride #', 'len m');
    const bw = plot.w / strides.length * 0.7;
    strides.forEach((s, i) => {
      const X = sx(plot, xr, i + 0.5);
      const Y = sy(plot, yr, s.stride_length_m);
      ctx.fillStyle = s.foot === 'left' ? COL.blue : COL.orangeSoft;
      ctx.fillRect(X - bw / 2, Y, bw, plot.y + plot.h - Y);
    });
    legend(ctx, plot, [['left', COL.blue], ['right', COL.orangeSoft]]);
    return c;
  }

  /* ---- (c) knee flexion L/R vs time ------------------------------------- */
  function kneeChart(grid) {
    const c = makeCanvas(200);
    const { ctx, plot } = setup(c);
    const xr = [grid.t[0], grid.t[grid.t.length - 1]];
    phaseShade(ctx, plot, grid, xr);
    const yr = rangeOf(grid.knee_l.concat(grid.knee_r));
    axes(ctx, plot, xr, yr, 's', 'deg');
    line(ctx, plot, xr, yr, grid.t, grid.knee_l, COL.blue);
    line(ctx, plot, xr, yr, grid.t, grid.knee_r, COL.orangeSoft);
    legend(ctx, plot, [['knee L', COL.blue], ['knee R', COL.orangeSoft]]);
    return c;
  }

  /* ---- (d) trunk inclination + torso yaw rate --------------------------- */
  function trunkYawChart(grid) {
    const c = makeCanvas(200);
    const { ctx, plot } = setup(c);
    const xr = [grid.t[0], grid.t[grid.t.length - 1]];
    phaseShade(ctx, plot, grid, xr);
    const DSP = global.DSP;
    const yawRate = DSP.derivative(grid.yawUnwrapped, grid.fs);
    const yr = rangeOf(grid.trunk.concat(yawRate.map((v) => v / 20)));
    axes(ctx, plot, xr, yr, 's', 'deg / (°/s)/20');
    line(ctx, plot, xr, yr, grid.t, grid.trunk, COL.green);
    line(ctx, plot, xr, yr, grid.t, yawRate.map((v) => v / 20), COL.gold);
    legend(ctx, plot, [['trunk°', COL.green], ['yaw rate/20', COL.gold]]);
    return c;
  }

  /* ---- (e) side-view path map with foot-strike markers ------------------ */
  function pathMapChart(grid, steps) {
    const c = makeCanvas(160);
    const { ctx, plot } = setup(c);
    const xr = [grid.t[0], grid.t[grid.t.length - 1]];
    const yr = rangeOf(grid.pathS, 0.1);
    axes(ctx, plot, xr, yr, 's', 'path m');
    line(ctx, plot, xr, yr, grid.t, grid.pathS, COL.blue);
    (steps || []).forEach((s) => {
      if (s.t_hs_s == null) return;
      const X = sx(plot, xr, s.t_hs_s), Y = sy(plot, yr, s.heel_x_m_path);
      ctx.fillStyle = s.foot === 'left' ? COL.blue : COL.orangeSoft;
      ctx.beginPath(); ctx.arc(X, Y, 4, 0, Math.PI * 2); ctx.fill();
    });
    return c;
  }

  function legend(ctx, plot, items) {
    let x = plot.x + 6; const y = plot.y + 12;
    ctx.font = '11px Rajdhani, sans-serif';
    items.forEach(([label, color]) => {
      ctx.fillStyle = color; ctx.fillRect(x, y - 8, 10, 10);
      ctx.fillStyle = COL.text; ctx.fillText(label, x + 14, y);
      x += 18 + ctx.measureText(label).width + 10;
    });
  }
  function noData(ctx, plot) { ctx.fillStyle = COL.dim; ctx.font = '12px Rajdhani'; ctx.fillText('No stride data', plot.x + 10, plot.y + plot.h / 2); }

  /* ---- phase timeline (segmented bar) ----------------------------------- */
  function phaseTimeline(ev, total) {
    const segs = [
      ['SIT_TO_STAND', 'SEAT_OFF', 'STANDING', 'c-orange'],
      ['WALK_OUT', 'STANDING', 'TURN1_START', 'c-blue'],
      ['TURN_1', 'TURN1_START', 'TURN1_END', 'c-gold'],
      ['WALK_BACK', 'TURN1_END', 'TURN2_START', 'c-blue'],
      ['TURN_2', 'TURN2_START', 'SIT_DESCENT_START', 'c-gold'],
      ['STAND_TO_SIT', 'SIT_DESCENT_START', 'SEAT_CONTACT', 'c-orange'],
    ];
    const bar = document.createElement('div');
    bar.className = 'phase-timeline';
    const tot = total || (ev.SEAT_CONTACT ? ev.SEAT_CONTACT.t : 1);
    segs.forEach(([label, a, b, cls]) => {
      if (!ev[a] || !ev[b]) return;
      const d = ev[b].t - ev[a].t;
      if (d <= 0) return;
      const seg = document.createElement('div');
      seg.className = 'seg ' + cls;
      seg.style.flex = String(d);
      seg.title = label + ': ' + d.toFixed(2) + ' s';
      const sp = document.createElement('span');
      sp.textContent = (d / tot * 100).toFixed(0) + '%';
      seg.appendChild(sp);
      seg.addEventListener('click', () => alert(label.replace(/_/g, ' ') + ': ' + d.toFixed(2) + ' s (' + (d / tot * 100).toFixed(0) + '% of total)'));
      bar.appendChild(seg);
    });
    return bar;
  }

  global.Charts = { hipPathChart, strideChart, kneeChart, trunkYawChart, pathMapChart, phaseTimeline, makeCanvas };
})(typeof window !== 'undefined' ? window : globalThis);
