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
    warm: '#ffd27a',
    accent: '#7fe0d0',
    panel: '#26313d',
    // Mechanics v3 (Iris's spec).
    obsWall: '#dfe3e8',
    obsTrim: '#b9c1ca',
    obsDome: '#c3ccd6',
    obsSlit: '#5b6878',
    quiet: '#cbbff5',
    officeWall: '#c9d1da',
    officeSide: '#aeb8c4',
    officeRoof: '#8a97a6',
    officeParapet: '#a3afbd',
    officeDoor: '#5b6878',
    dishFace: '#e8ebef',
    dishInner: '#c3cad3',
    stationWall: '#d8cfc0',
    stationRoof: '#5b6b7c',
    deadBase: '#6b7480',
    deadRim: '#555e6a',
    deadMast: '#8d95a1',
    deadLight: '#9aa7b5',
    reflBase: '#4a5563',
    reflFace: '#dfe8ee',
    reflEdge: '#9fb3c2',
    reflBolt: '#9aa7b5',
  };
  const UNDERLAY = 'rgba(12, 18, 26, 0.45)';

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
  function tower(ctx, px, py, s, pulse, ghost, dead) {
    ctx.save();
    if (ghost) ctx.globalAlpha *= 0.55;
    const C = dead ? { rim: PALETTE.deadRim, base: PALETTE.deadBase, mast: PALETTE.deadMast, dark: PALETTE.deadRim }
      : { rim: PALETTE.towerRim, base: PALETTE.towerBase, mast: PALETTE.towerMast, dark: PALETTE.towerDark };
    const cx = px + s * 0.5;
    ctx.fillStyle = PALETTE.shadow;
    ellipse(ctx, cx + s * 0.06, py + s * 0.82, s * 0.3, s * 0.1);
    ctx.fill();
    basePlate(ctx, px, py, s, C);
    // Lattice legs and cross braces.
    const top = py + s * 0.2, foot = py + s * 0.7;
    const lw = Math.max(1.2, s * 0.045);
    ctx.strokeStyle = C.mast;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.17, foot); ctx.lineTo(cx - s * 0.03, top);
    ctx.moveTo(cx + s * 0.17, foot); ctx.lineTo(cx + s * 0.03, top);
    ctx.stroke();
    ctx.strokeStyle = C.dark;
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
    ctx.strokeStyle = C.mast;
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, top); ctx.lineTo(cx, py + s * 0.1);
    ctx.stroke();
    antennaLight(ctx, cx, py + s * 0.1, s, pulse, ghost, dead);
    if (dead) deadBadge(ctx, px, py, s);
    ctx.restore();
  }

  function basePlate(ctx, px, py, s, C) {
    ctx.fillStyle = C.rim;
    roundRect(ctx, px + s * 0.22, py + s * 0.66, s * 0.56, s * 0.18, s * 0.06);
    ctx.fill();
    ctx.fillStyle = C.base;
    roundRect(ctx, px + s * 0.22, py + s * 0.64, s * 0.56, s * 0.14, s * 0.06);
    ctx.fill();
  }

  // Live: a teal light with a pulsing halo. Dead: a hollow grey ring.
  function antennaLight(ctx, cx, cy, s, pulse, ghost, dead) {
    if (dead) {
      ctx.strokeStyle = PALETTE.deadLight;
      ctx.lineWidth = Math.max(1, s * 0.02);
      ellipse(ctx, cx, cy, s * 0.05, s * 0.05);
      ctx.stroke();
      return;
    }
    if (!ghost) {
      ctx.fillStyle = `rgba(127, 224, 208, ${0.15 + 0.3 * pulse})`;
      ellipse(ctx, cx, cy, s * (0.08 + 0.08 * pulse), s * (0.08 + 0.08 * pulse));
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.signal;
    ellipse(ctx, cx, cy, s * 0.05, s * 0.05);
    ctx.fill();
  }

  // Broken-link badge: a cut cable in a dark disc.
  function deadBadge(ctx, px, py, s) {
    const cx = px + s * 0.8, cy = py + s * 0.8;
    ctx.fillStyle = PALETTE.board;
    ellipse(ctx, cx, cy, s * 0.12, s * 0.12);
    ctx.fill();
    ctx.strokeStyle = PALETTE.deadLight;
    ctx.lineWidth = Math.max(1.2, s * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.075, cy + s * 0.04); ctx.lineTo(cx - s * 0.02, cy - s * 0.01);
    ctx.moveTo(cx + s * 0.02, cy + s * 0.01); ctx.lineTo(cx + s * 0.075, cy - s * 0.04);
    ctx.stroke();
  }

  // Dish tower. `angle` is the facing in radians (0 north, clockwise), so a
  // turn can tween smoothly. `badge` shows the rotate badge.
  function dish(ctx, px, py, s, angle, pulse, ghost, dead, badge) {
    ctx.save();
    if (ghost) ctx.globalAlpha *= 0.55;
    const C = dead ? { rim: PALETTE.deadRim, base: PALETTE.deadBase, mast: PALETTE.deadMast, inner: PALETTE.deadRim, face: PALETTE.deadMast, dark: PALETTE.deadRim }
      : { rim: PALETTE.towerRim, base: PALETTE.towerBase, mast: PALETTE.towerMast, inner: PALETTE.dishInner, face: PALETTE.dishFace, dark: PALETTE.towerDark };
    ctx.fillStyle = PALETTE.shadow;
    ellipse(ctx, px + s * 0.56, py + s * 0.82, s * 0.3, s * 0.1);
    ctx.fill();
    basePlate(ctx, px, py, s, C);
    ctx.fillStyle = C.mast;
    roundRect(ctx, px + s * 0.46, py + s * 0.42, s * 0.08, s * 0.28, s * 0.02);
    ctx.fill();
    ctx.fillStyle = C.inner;
    ctx.fillRect(px + s * 0.5, py + s * 0.42, s * 0.04, s * 0.28);
    // Dish assembly, rotating around the pivot.
    ctx.save();
    ctx.translate(px + s * 0.5, py + s * 0.45);
    ctx.rotate(angle);
    ctx.translate(-s * 0.5, -s * 0.45);
    ctx.fillStyle = C.rim;
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.4, s * 0.27, s * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.face;
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.38, s * 0.26, s * 0.11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.inner;
    ctx.beginPath(); ctx.ellipse(s * 0.5, s * 0.37, s * 0.18, s * 0.065, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.dark;
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.5, s * 0.38); ctx.lineTo(s * 0.5, s * 0.16); ctx.stroke();
    antennaLight(ctx, s * 0.5, s * 0.15, s * 0.9, pulse, ghost, dead);
    ctx.restore();
    // Facing arrow on the tile edge.
    ctx.save();
    ctx.translate(px + s * 0.5, py + s * 0.5);
    ctx.rotate(angle);
    ctx.globalAlpha *= dead ? 0.5 : 0.9;
    ctx.fillStyle = dead ? PALETTE.deadLight : PALETTE.accent;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.48); ctx.lineTo(-s * 0.07, -s * 0.4); ctx.lineTo(s * 0.07, -s * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    if (dead) deadBadge(ctx, px, py, s);
    else if (badge) rotateBadge(ctx, px, py, s, badge);
    ctx.restore();
  }

  function rotateBadge(ctx, px, py, s, alpha) {
    const cx = px + s * 0.82, cy = py + s * 0.84;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = PALETTE.panel;
    ellipse(ctx, cx, cy, s * 0.12, s * 0.12);
    ctx.fill();
    ctx.strokeStyle = PALETTE.accent;
    ctx.lineWidth = Math.max(1.2, s * 0.024);
    ctx.lineCap = 'round';
    const r = s * 0.065;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI);
    ctx.stroke();
    // Arrow head at the end of the 270 degree arc.
    ctx.fillStyle = PALETTE.accent;
    ctx.beginPath();
    ctx.moveTo(cx - r - s * 0.035, cy - s * 0.005);
    ctx.lineTo(cx - r + s * 0.035, cy - s * 0.005);
    ctx.lineTo(cx - r, cy + s * 0.04);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Warning badge: a triangle with an exclamation bar and dot.
  function warningBadge(ctx, px, py, s, outline) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px + s * 0.84, py + s * 0.05);
    ctx.lineTo(px + s * 0.97, py + s * 0.27);
    ctx.lineTo(px + s * 0.71, py + s * 0.27);
    ctx.closePath();
    ctx.lineJoin = 'round';
    if (outline) {
      ctx.strokeStyle = UNDERLAY; ctx.lineWidth = Math.max(2, s * 0.04); ctx.stroke();
      ctx.strokeStyle = PALETTE.danger; ctx.lineWidth = Math.max(1.2, s * 0.022); ctx.stroke();
    } else {
      ctx.strokeStyle = UNDERLAY; ctx.lineWidth = Math.max(1, s * 0.03); ctx.stroke();
      ctx.fillStyle = PALETTE.danger; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(px + s * 0.828, py + s * 0.11, s * 0.026, s * 0.09);
      ellipse(ctx, px + s * 0.841, py + s * 0.232, s * 0.016, s * 0.016);
      ctx.fill();
    }
    ctx.restore();
  }

  // Observatory (quiet zone). state: 'ok', 'violated' or 'preview'.
  function observatory(ctx, px, py, s, state, t) {
    ctx.save();
    if (state !== 'ok') {
      ctx.fillStyle = state === 'violated' ? 'rgba(232, 106, 95, 0.18)' : 'rgba(232, 106, 95, 0.22)';
      ctx.fillRect(px, py, s, s);
    }
    ctx.fillStyle = PALETTE.shadow;
    ellipse(ctx, px + s * 0.54, py + s * 0.85, s * 0.36, s * 0.08);
    ctx.fill();
    // Dome first; the building covers its lower half.
    ctx.fillStyle = PALETTE.obsDome;
    ctx.beginPath();
    ctx.arc(px + s * 0.5, py + s * 0.54, s * 0.26, Math.PI, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = state === 'violated' ? PALETTE.danger : PALETTE.obsSlit;
    roundRect(ctx, px + s * 0.47, py + s * 0.3, s * 0.06, s * 0.22, s * 0.02);
    ctx.fill();
    ctx.strokeStyle = 'rgba(233, 237, 241, 0.7)';
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(px + s * 0.5, py + s * 0.54, s * 0.2, Math.PI * 1.08, Math.PI * 1.35);
    ctx.stroke();
    ctx.fillStyle = PALETTE.obsWall;
    roundRect(ctx, px + s * 0.2, py + s * 0.52, s * 0.6, s * 0.3, s * 0.04);
    ctx.fill();
    ctx.fillStyle = PALETTE.obsTrim;
    ctx.fillRect(px + s * 0.2, py + s * 0.78, s * 0.6, s * 0.04);
    ctx.fillStyle = PALETTE.obsSlit;
    roundRect(ctx, px + s * 0.44, py + s * 0.64, s * 0.12, s * 0.18, [s * 0.03, s * 0.03, 0, 0]);
    ctx.fill();
    // Side dish.
    ctx.strokeStyle = PALETTE.towerRim;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath(); ctx.moveTo(px + s * 0.78, py + s * 0.52); ctx.lineTo(px + s * 0.82, py + s * 0.38); ctx.stroke();
    ctx.fillStyle = PALETTE.dishFace;
    ctx.beginPath(); ctx.ellipse(px + s * 0.82, py + s * 0.35, s * 0.1, s * 0.05, -Math.PI / 6, 0, Math.PI * 2); ctx.fill();
    // Quiet ring.
    const cx = px + s * 0.5, cy = py + s * 0.54, r = s * 0.43;
    const dash = state === 'violated' ? [s * 0.04, s * 0.06] : [s * 0.09, s * 0.07];
    const cycle = dash[0] + dash[1];
    ctx.setLineDash(dash);
    ctx.lineDashOffset = state === 'ok' ? -((t / 12) % 1) * cycle * 8 : 0;
    ctx.strokeStyle = UNDERLAY;
    ctx.lineWidth = Math.max(2, s * 0.06);
    ellipse(ctx, cx, cy, r, r); ctx.stroke();
    ctx.globalAlpha *= state === 'violated' ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4)) : state === 'preview' ? 0.8 : 1;
    ctx.strokeStyle = state === 'ok' ? PALETTE.quiet : PALETTE.danger;
    ctx.lineWidth = Math.max(1.2, s * 0.035);
    ellipse(ctx, cx, cy, r, r); ctx.stroke();
    ctx.restore();
    if (state !== 'ok') warningBadge(ctx, px, py, s, state === 'preview');
  }

  // Office block (needs two towers). lamps: [a, b], each 0 (off) to 1 (on).
  // preview: [bool, bool] lamps that a placement would light.
  function office(ctx, px, py, s, lamps, t, preview) {
    const on = lamps.filter((v) => v > 0.5).length;
    const glow = Math.min(lamps[0], lamps[1]);
    ctx.save();
    if (glow > 0.02) {
      const g = ctx.createRadialGradient(px + s / 2, py + s / 2, 0, px + s / 2, py + s / 2, s * 0.9);
      g.addColorStop(0, `rgba(255, 210, 122, ${0.42 * glow})`);
      g.addColorStop(1, 'rgba(255, 210, 122, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - s * 0.4, py - s * 0.4, s * 1.8, s * 1.8);
    }
    ctx.fillStyle = PALETTE.shadow;
    ellipse(ctx, px + s * 0.54, py + s * 0.88, s * 0.38, s * 0.08);
    ctx.fill();
    ctx.fillStyle = PALETTE.officeWall;
    ctx.fillRect(px + s * 0.2, py + s * 0.3, s * 0.6, s * 0.56);
    ctx.fillStyle = PALETTE.officeSide;
    ctx.fillRect(px + s * 0.7, py + s * 0.3, s * 0.1, s * 0.56);
    const level = (lamps[0] + lamps[1]) / 2;
    ctx.fillStyle = mix(PALETTE.windowOff, PALETTE.windowOn, level);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      if (row === 2 && col === 1) continue;
      roundRect(ctx, px + s * (0.27 + col * 0.17) - s * 0.0, py + s * (0.38 + row * 0.14), s * 0.12, s * 0.09, s * 0.015);
      ctx.fill();
    }
    ctx.fillStyle = PALETTE.officeDoor;
    ctx.fillRect(px + s * 0.44, py + s * 0.74, s * 0.12, s * 0.12);
    ctx.fillStyle = PALETTE.officeRoof;
    roundRect(ctx, px + s * 0.17, py + s * 0.12, s * 0.66, s * 0.2, s * 0.04);
    ctx.fill();
    ctx.fillStyle = PALETTE.officeParapet;
    roundRect(ctx, px + s * 0.17, py + s * 0.12, s * 0.66, s * 0.03, [s * 0.04, s * 0.04, 0, 0]);
    ctx.fill();
    [0.36, 0.64].forEach((lx, i) => {
      const v = lamps[i];
      const cx = px + s * lx, cy = py + s * 0.22;
      // Off lamp: dark fill with a hollow ring.
      ctx.fillStyle = PALETTE.windowOff;
      ellipse(ctx, cx, cy, s * 0.065, s * 0.065); ctx.fill();
      ctx.strokeStyle = 'rgba(233, 237, 241, 0.55)';
      ctx.lineWidth = Math.max(1, s * 0.02);
      ctx.stroke();
      if (v > 0.01) {
        const k = easeOutBack(Math.min(1, v));
        ctx.fillStyle = `rgba(255, 210, 122, ${0.45 * v})`;
        ellipse(ctx, cx, cy, s * 0.13 * k, s * 0.13 * k); ctx.fill();
        ctx.fillStyle = PALETTE.windowOn;
        ctx.globalAlpha = Math.min(1, v * 1.4);
        ellipse(ctx, cx, cy, s * 0.065 * (0.6 + 0.4 * k), s * 0.065 * (0.6 + 0.4 * k)); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (preview && preview[i]) {
        ctx.save();
        ctx.setLineDash([s * 0.04, s * 0.03]);
        ctx.strokeStyle = PALETTE.warm;
        ctx.lineWidth = Math.max(1, s * 0.022);
        ellipse(ctx, cx, cy, s * 0.11, s * 0.11); ctx.stroke();
        ctx.restore();
      }
    });
    // State ring: red pulse at 0, dashed warm ring at 1.
    if (on === 1) {
      ctx.setLineDash([s * 0.08, s * 0.06]);
      ctx.strokeStyle = 'rgba(255, 210, 122, 0.8)';
      ctx.lineWidth = Math.max(1.2, s * 0.03);
      roundRect(ctx, px + s * 0.06, py + s * 0.05, s * 0.88, s * 0.88, s * 0.14);
      ctx.stroke();
    } else if (on === 0) {
      const alert = 0.35 + 0.35 * Math.sin(t * 4 + px * 0.01);
      ctx.strokeStyle = `rgba(232, 106, 95, ${alert})`;
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      roundRect(ctx, px + s * 0.06, py + s * 0.05, s * 0.88, s * 0.88, s * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Relay station: a tall lattice mast over a hut. Always powered.
  function station(ctx, px, py, s, t) {
    ctx.save();
    ctx.fillStyle = PALETTE.shadow;
    ellipse(ctx, px + s * 0.55, py + s * 0.88, s * 0.4, s * 0.09);
    ctx.fill();
    const lw = Math.max(1.2, s * 0.045);
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.towerMast;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(px + s * 0.32, py + s * 0.6); ctx.lineTo(px + s * 0.47, py + s * 0.08);
    ctx.moveTo(px + s * 0.68, py + s * 0.6); ctx.lineTo(px + s * 0.53, py + s * 0.08);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.towerDark;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    const legX = (y) => 0.32 + (0.47 - 0.32) * (0.6 - y) / 0.52;
    for (const [a, b] of [[0.54, 0.42], [0.42, 0.3], [0.3, 0.18]]) {
      const wa = 0.5 - legX(a), wb = 0.5 - legX(b);
      ctx.moveTo(px + s * (0.5 - wa), py + s * a); ctx.lineTo(px + s * (0.5 + wb), py + s * b);
      ctx.moveTo(px + s * (0.5 + wa), py + s * a); ctx.lineTo(px + s * (0.5 - wb), py + s * b);
    }
    ctx.stroke();
    ctx.fillStyle = PALETTE.stationRoof;
    roundRect(ctx, px + s * 0.1, py + s * 0.52, s * 0.8, s * 0.14, s * 0.04);
    ctx.fill();
    ctx.fillStyle = PALETTE.stationWall;
    ctx.fillRect(px + s * 0.14, py + s * 0.64, s * 0.72, s * 0.22);
    ctx.fillStyle = PALETTE.houseTrim;
    ctx.fillRect(px + s * 0.14, py + s * 0.82, s * 0.72, s * 0.04);
    ctx.fillStyle = PALETTE.door;
    ctx.fillRect(px + s * 0.44, py + s * 0.7, s * 0.12, s * 0.16);
    ctx.fillStyle = PALETTE.windowOn;
    ctx.fillRect(px + s * 0.22, py + s * 0.7, s * 0.14, s * 0.08);
    ctx.fillRect(px + s * 0.64, py + s * 0.7, s * 0.14, s * 0.08);
    // Beacon with a slow breathing halo.
    const breathe = 0.5 + 0.5 * Math.sin((t / 1.6) * Math.PI * 2);
    const bx = px + s * 0.5, by = py + s * 0.08;
    ctx.fillStyle = `rgba(127, 224, 208, ${0.1 + 0.16 * breathe})`;
    ellipse(ctx, bx, by, s * (0.13 + 0.04 * breathe), s * (0.13 + 0.04 * breathe)); ctx.fill();
    ctx.strokeStyle = 'rgba(127, 224, 208, 0.7)';
    ctx.lineWidth = Math.max(1, s * 0.018);
    ellipse(ctx, bx, by, s * 0.095, s * 0.095); ctx.stroke();
    ctx.fillStyle = PALETTE.signal;
    ellipse(ctx, bx, by, s * 0.06, s * 0.06); ctx.fill();
    ctx.restore();
  }

  // Reflector panel. kind '/' or 'L' (L is '/' mirrored). lit: 0..1.
  function reflector(ctx, px, py, s, kind, lit, t, still) {
    ctx.save();
    ctx.fillStyle = PALETTE.shadow;
    roundRect(ctx, px + s * 0.14, py + s * 0.18, s * 0.76, s * 0.76, s * 0.12); ctx.fill();
    ctx.fillStyle = PALETTE.reflBase;
    roundRect(ctx, px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8, s * 0.12); ctx.fill();
    ctx.fillStyle = PALETTE.wallFront;
    roundRect(ctx, px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.04, [s * 0.12, s * 0.12, 0, 0]); ctx.fill();
    // Work in '/' coordinates and flip for 'L'.
    if (kind === 'L') { ctx.translate(px * 2 + s, 0); ctx.scale(-1, 1); }
    const line = (x0, y0, x1, y1, w, style) => {
      ctx.strokeStyle = style; ctx.lineWidth = s * w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px + s * x0, py + s * y0); ctx.lineTo(px + s * x1, py + s * y1); ctx.stroke();
    };
    if (lit > 0.01) line(0.22, 0.78, 0.78, 0.22, 0.24, `rgba(127, 224, 208, ${0.35 * lit})`);
    line(0.24, 0.82, 0.82, 0.24, 0.16, PALETTE.reflEdge);
    line(0.22, 0.78, 0.78, 0.22, 0.14, PALETTE.reflFace);
    line(0.26, 0.7, 0.7, 0.26, 0.03, 'rgba(255, 255, 255, 0.7)');
    ctx.fillStyle = PALETTE.reflBolt;
    ellipse(ctx, px + s * 0.22, py + s * 0.78, s * 0.05, s * 0.05); ctx.fill();
    ellipse(ctx, px + s * 0.78, py + s * 0.22, s * 0.05, s * 0.05); ctx.fill();
    if (lit > 0.01) {
      // Glint sliding along the slab every 1.8 s.
      const p = still ? 0.5 : (t / 1.8) % 1;
      const len = 0.16 / Math.SQRT2;
      const x0 = 0.22 + (0.56 - len) * p, y0 = 0.78 - (0.56 - len) * p;
      ctx.globalAlpha = lit;
      line(x0, y0, x0 + len, y0 - len, 0.05, 'rgba(255, 255, 255, 0.9)');
    }
    ctx.restore();
  }

  function easeOutBack(x) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (p, sh) => (p >> sh) & 255;
    const c = (sh) => Math.round(ch(pa, sh) + (ch(pb, sh) - ch(pa, sh)) * t);
    return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
  }

  root.SignalArt = { PALETTE, UNDERLAY, hash, grass, hillLayer, hillShadow, wallShadow, wall, tree, house, tower, dish,
    observatory, office, station, reflector, deadBadge, warningBadge, rotateBadge, roundRect, ellipse, mix, easeOutBack };
})(window);
