// Flat 2D art, drawn entirely with canvas paths. Every function draws one
// tile-sized object at pixel position (px, py) with tile size s.
(function (root) {
  'use strict';

  const PALETTE = {
    board: '#26313d',
    grassA: '#55705a',
    grassB: '#506a55',
    grassTuft: '#617d63',
    shadow: 'rgba(12, 18, 26, 0.28)',
    hill: ['#5f7d55', '#6f8d61', '#83a070', '#97b281'],
    wallTop: '#9aa0a8',
    wallFront: '#6c727c',
    wallEdge: '#b2b7be',
    trunk: '#5a4636',
    canopy: '#3f5f48',
    canopyLight: '#4c6f53',
    roofLight: '#c47a5a',
    roofDark: '#a5604a',
    houseWall: '#e6dccb',
    houseTrim: '#c9bca6',
    door: '#7a5a44',
    windowOff: '#3a4552',
    windowOn: '#ffd27a',
    towerBase: '#d5d9df',
    towerRim: '#a9b0ba',
    towerMast: '#e8ebef',
    towerDark: '#8d95a1',
    signal: '#7fe0d0',
    danger: '#e86a5f',
    hint: '#ffd27a',
  };

  // Deterministic per-tile randomness so decoration never flickers.
  function hash(x, y, salt = 0) {
    let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function ellipse(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }

  function grass(ctx, px, py, s, x, y) {
    ctx.fillStyle = (x + y) % 2 ? PALETTE.grassA : PALETTE.grassB;
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = PALETTE.grassTuft;
    const tufts = 2 + Math.floor(hash(x, y) * 2);
    for (let i = 0; i < tufts; i++) {
      const tx = px + s * (0.15 + 0.7 * hash(x, y, i + 1));
      const ty = py + s * (0.15 + 0.7 * hash(x, y, i + 7));
      const w = s * 0.035;
      ctx.fillRect(tx, ty, w, s * 0.08);
      ctx.fillRect(tx + w * 1.6, ty + s * 0.02, w, s * 0.06);
    }
  }

  // Blobs that merge with same-kind neighbours: each side is inset only
  // where the neighbour is a different kind.
  function mergedRect(ctx, px, py, s, inset, n, radius) {
    const l = n.l ? 0 : inset, r = n.r ? 0 : inset, t = n.t ? 0 : inset, b = n.b ? 0 : inset;
    const rad = [
      n.t || n.l ? 0 : radius, n.t || n.r ? 0 : radius,
      n.b || n.r ? 0 : radius, n.b || n.l ? 0 : radius,
    ];
    ctx.beginPath();
    ctx.roundRect(px + l, py + t, s - l - r, s - t - b, rad);
  }

  // Hills: layered contour shapes, darker at the base, lighter at the crest.
  function hillLayer(ctx, px, py, s, n, layer) {
    const insets = [0.06, 0.16, 0.27, 0.37];
    ctx.fillStyle = PALETTE.hill[layer];
    mergedRect(ctx, px, py, s, s * insets[layer], n, s * (0.42 - layer * 0.07));
    ctx.fill();
  }

  function hillShadow(ctx, px, py, s, n) {
    ctx.fillStyle = PALETTE.shadow;
    mergedRect(ctx, px + s * 0.04, py + s * 0.08, s, s * 0.06, n, s * 0.42);
    ctx.fill();
  }

  // Walls: solid blocks with a lit top face and a darker front face.
  // Neighbouring walls merge into one block. Call wallShadow for every wall
  // before drawing any wall so shadows never cover a block.
  function wallShadow(ctx, px, py, s, n) {
    if (n.b) return;
    const l = n.l ? 0 : s * 0.03, r = n.r ? 0 : s * 0.03;
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(px + l + s * 0.06, py + s * 0.9, s - l - r, s * 0.2);
  }

  function wall(ctx, px, py, s, n) {
    const R = s * 0.1;
    const front = n.b ? 0 : s * 0.24;
    const l = n.l ? 0 : s * 0.03, r = n.r ? 0 : s * 0.03, t = n.t ? 0 : s * 0.03;
    const x0 = px + l, w = s - l - r;
    if (front) {
      ctx.fillStyle = PALETTE.wallFront;
      ctx.beginPath();
      ctx.roundRect(x0, py + s - front - R, w, front + R - s * 0.02, [0, 0, n.r ? 0 : R, n.l ? 0 : R]);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.wallTop;
    ctx.beginPath();
    ctx.roundRect(x0, py + t, w, s - t - front - (front ? s * 0.02 : 0),
      [n.t || n.l ? 0 : R, n.t || n.r ? 0 : R, 0, 0]);
    ctx.fill();
    if (!n.t) {
      ctx.fillStyle = PALETTE.wallEdge;
      ctx.fillRect(x0 + (n.l ? 0 : R * 0.6), py + t, w - (n.l ? 0 : R * 0.6) - (n.r ? 0 : R * 0.6), s * 0.05);
    }
    // Mortar seam for a little texture.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(x0, py + t + (s - t - front) * 0.55, w, Math.max(1, s * 0.025));
  }

  function tree(ctx, px, py, s, x, y) {
    const cx = px + s * (0.46 + 0.08 * hash(x, y, 3));
    const cy = py + s * (0.44 + 0.06 * hash(x, y, 4));
    const r = s * (0.27 + 0.05 * hash(x, y, 5));
    ctx.fillStyle = PALETTE.shadow;
    ellipse(ctx, cx + s * 0.06, cy + r * 0.85, r * 1.05, r * 0.5);
    ctx.fill();
    ctx.fillStyle = PALETTE.trunk;
    roundRect(ctx, cx - s * 0.04, cy + r * 0.3, s * 0.08, r * 0.7, s * 0.02);
    ctx.fill();
    ctx.fillStyle = PALETTE.canopy;
    ellipse(ctx, cx, cy, r, r * 0.95);
    ctx.fill();
    ellipse(ctx, cx - r * 0.55, cy + r * 0.25, r * 0.6, r * 0.55);
    ctx.fill();
    ellipse(ctx, cx + r * 0.55, cy + r * 0.2, r * 0.62, r * 0.55);
    ctx.fill();
    ctx.fillStyle = PALETTE.canopyLight;
    ellipse(ctx, cx - r * 0.25, cy - r * 0.3, r * 0.5, r * 0.42);
    ctx.fill();
  }

  // House: roof seen from above with a front wall below it. `light` is
  // 0 (dark windows) to 1 (fully lit). `alert` tints the house red.
  function house(ctx, px, py, s, light, alert) {
    ctx.fillStyle = PALETTE.shadow;
    ellipse(ctx, px + s * 0.54, py + s * 0.86, s * 0.4, s * 0.09);
    ctx.fill();
    // Front wall.
    const wx = px + s * 0.17, ww = s * 0.66, wy = py + s * 0.5, wh = s * 0.34;
    ctx.fillStyle = PALETTE.houseWall;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = PALETTE.houseTrim;
    ctx.fillRect(wx, wy + wh - s * 0.04, ww, s * 0.04);
    // Door and windows.
    ctx.fillStyle = PALETTE.door;
    roundRect(ctx, px + s * 0.45, wy + wh * 0.38, s * 0.1, wh * 0.62, [s * 0.04, s * 0.04, 0, 0]);
    ctx.fill();
    const winColor = mix(PALETTE.windowOff, PALETTE.windowOn, light);
    for (const wxp of [0.24, 0.62]) {
      if (light > 0) {
        ctx.fillStyle = `rgba(255, 210, 122, ${0.35 * light})`;
        roundRect(ctx, px + s * (wxp - 0.04), wy + wh * 0.18, s * 0.22, wh * 0.56, s * 0.05);
        ctx.fill();
      }
      ctx.fillStyle = winColor;
      roundRect(ctx, px + s * wxp, wy + wh * 0.28, s * 0.14, wh * 0.36, s * 0.02);
      ctx.fill();
    }
    // Roof: two planes split by the ridge, with a little overhang.
    const rx = px + s * 0.1, rw = s * 0.8, ry = py + s * 0.12, rh = s * 0.42;
    ctx.fillStyle = PALETTE.roofLight;
    roundRect(ctx, rx, ry, rw, rh * 0.5, [s * 0.06, s * 0.06, 0, 0]);
    ctx.fill();
    ctx.fillStyle = PALETTE.roofDark;
    roundRect(ctx, rx, ry + rh * 0.5, rw, rh * 0.5, [0, 0, s * 0.03, s * 0.03]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(rx + s * 0.04, ry + rh * 0.5 - s * 0.012, rw - s * 0.08, s * 0.024);
    // Chimney.
    ctx.fillStyle = PALETTE.roofDark;
    ctx.fillRect(px + s * 0.66, py + s * 0.08, s * 0.08, s * 0.12);
    if (alert > 0) {
      ctx.strokeStyle = `rgba(232, 106, 95, ${alert})`;
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      roundRect(ctx, px + s * 0.06, py + s * 0.05, s * 0.88, s * 0.88, s * 0.14);
      ctx.stroke();
    }
  }

  // Tower: a lattice mast on a base plate. `pulse` (0..1) drives the
  // antenna light. `ghost` draws a translucent placement preview.
  function tower(ctx, px, py, s, pulse, ghost) {
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.55;
    const cx = px + s * 0.5;
    ctx.fillStyle = PALETTE.shadow;
    ellipse(ctx, cx + s * 0.06, py + s * 0.82, s * 0.3, s * 0.1);
    ctx.fill();
    ctx.fillStyle = PALETTE.towerRim;
    roundRect(ctx, px + s * 0.22, py + s * 0.66, s * 0.56, s * 0.18, s * 0.06);
    ctx.fill();
    ctx.fillStyle = PALETTE.towerBase;
    roundRect(ctx, px + s * 0.22, py + s * 0.64, s * 0.56, s * 0.14, s * 0.06);
    ctx.fill();
    // Lattice legs and cross braces.
    const top = py + s * 0.2, foot = py + s * 0.7;
    const lw = Math.max(1.2, s * 0.045);
    ctx.strokeStyle = PALETTE.towerMast;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.17, foot); ctx.lineTo(cx - s * 0.03, top);
    ctx.moveTo(cx + s * 0.17, foot); ctx.lineTo(cx + s * 0.03, top);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.towerDark;
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    for (const [a, b] of [[0.62, 0.48], [0.48, 0.34]]) {
      const ya = py + s * a, yb = py + s * b;
      const wa = s * (0.03 + 0.14 * (ya - top) / (foot - top));
      const wb = s * (0.03 + 0.14 * (yb - top) / (foot - top));
      ctx.moveTo(cx - wa, ya); ctx.lineTo(cx + wb, yb);
      ctx.moveTo(cx + wa, ya); ctx.lineTo(cx - wb, yb);
    }
    ctx.stroke();
    // Antenna and pulsing light.
    ctx.strokeStyle = PALETTE.towerMast;
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, top); ctx.lineTo(cx, py + s * 0.1);
    ctx.stroke();
    if (!ghost) {
      ctx.fillStyle = `rgba(127, 224, 208, ${0.15 + 0.3 * pulse})`;
      ellipse(ctx, cx, py + s * 0.1, s * (0.08 + 0.08 * pulse), s * (0.08 + 0.08 * pulse));
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.signal;
    ellipse(ctx, cx, py + s * 0.1, s * 0.05, s * 0.05);
    ctx.fill();
    ctx.restore();
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (p, sh) => (p >> sh) & 255;
    const c = (sh) => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * t);
    return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
  }

  root.SignalArt = { PALETTE, hash, grass, hillLayer, hillShadow, wallShadow, wall, tree, house, tower, roundRect, ellipse };
})(window);
