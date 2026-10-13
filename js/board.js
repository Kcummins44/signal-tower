// Canvas board renderer. Static terrain and the coverage overlay are cached
// in offscreen canvases; each frame only draws the animated parts.
(function (root) {
  'use strict';
  const L = root.SignalLogic;
  const A = root.SignalArt;
  const P = A.PALETTE;

  const WAVE_PERIOD = 2.4; // seconds for one ring to travel out
  const WAVE_RINGS = 3;
  const key = (x, y) => x + ',' + y;
  const reducedMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Unit vector for a facing (0 north, clockwise).
  const facingVec = (f) => [[0, -1], [1, 0], [0, 1], [-1, 0]][f];

  class Board {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.grid = null;
      this.towers = [];
      this.skip = null;        // index of a tower being dragged (hidden from the board)
      this.slot = null;        // [x, y] dashed origin slot while moving a tower
      this.preview = null;     // [x, y] tile under the pointer, or null
      this.previewSpec = null; // { tower: [x, y(, f)] } placement being previewed, or null
      this.ghost = false;      // draw the ghost tower at the preview tile
      this.hint = null;        // { x, y, kind: 'place' | 'remove' | 'turn', tower }
      this.focusDish = null;   // index of a dish under the mouse or keyboard cursor
      this.badgeUntil = 0;     // show rotate badges until this time (seconds)
      this.callout = null;     // [x, y] tile with an onboarding pulse ring
      this.vis = new Map();    // per-tower animation state, keyed by tile
      this.targetVis = new Map();
      this.lastTime = 0;
      this.time = 0;
      this.cssW = 0; this.cssH = 0; this.dpr = 1;
      this.shadowPattern = null;
      this.ev = null;
      this.waves = [];
    }

    setLevel(grid) {
      this.grid = grid;
      this.towers = [];
      this.skip = null;
      this.slot = null;
      this.preview = null;
      this.previewSpec = null;
      this.hint = null;
      this.focusDish = null;
      this.callout = null;
      this.vis = new Map();
      this.targetList = L.targets(grid);
      this.busyKeys = new Set(this.targetList.filter((g) => g.need === 2).map((g) => key(g.x, g.y)));
      this.targetVis = new Map(this.targetList.map((t) => [key(t.x, t.y), { light: 0, lamps: [0, 0], delay: 0 }]));
      this.layout();
    }

    // towers: the placed towers. opts.skip: index of a tower being moved;
    // it is left out of the board as if it had been picked up.
    setTowers(towers, opts = {}) {
      this.towers = towers.map((t) => t.slice());
      this.skip = opts.skip ?? null;
      this.shown = this.towers.map((_, i) => i).filter((i) => i !== this.skip);
      const shown = this.shown;
      this.ev = L.evaluate(this.grid, shown.map((i) => this.towers[i]));
      const next = new Map();
      shown.forEach((i, k) => {
        const t = this.towers[i];
        const id = key(t[0], t[1]);
        const old = this.vis.get(id);
        const live = this.ev.live[k];
        const dish = L.isDish(t);
        const v = old && old.dish === dish ? old : {
          age: 0, dish, live: live ? 1 : 0, angle: dish ? t[2] * Math.PI / 2 : 0, target: dish ? t[2] * Math.PI / 2 : 0,
          facing: dish ? t[2] : null, wasLive: false, delay: 0,
        };
        if (dish && v.facing !== t[2]) {
          let d = (t[2] - v.facing + 4) % 4;
          if (d === 3) d = -1;
          v.target += d * Math.PI / 2;
          v.facing = t[2];
        }
        if (live && !v.wasLive) v.delay = old ? (this.ev.depth[k] > 0 ? (this.ev.depth[k] - 1) * 0.08 : 0) : 0;
        v.wasLive = live;
        v.k = k;
        next.set(id, v);
      });
      this.vis = next;
      this.buildOverlay();
      this.buildWaves();
    }

    shownTowers() {
      return this.shown || [];
    }

    // Highlight the tile under the pointer. With a spec, also preview what
    // placing that tower there would do.
    setPreview(tile, spec = null) {
      const same = (a, b) => (a && b ? a.join(',') === b.join(',') : a === b);
      const specKey = spec ? spec.tower.join(',') : '';
      if (same(tile, this.preview) && specKey === this.previewKey) return;
      this.preview = tile;
      this.previewSpec = spec;
      this.previewKey = specKey;
      this.pv = null;
      if (spec && this.grid) {
        const shown = this.shownTowers().map((i) => this.towers[i]);
        const ev = L.evaluate(this.grid, shown.concat([spec.tower]), this.ev ? this.ev.reach.concat([null]) : null);
        const k = shown.length;
        this.pv = { ev, live: ev.live[k], parent: ev.parent[k], reach: ev.reach[k], tower: spec.tower };
      }
      this.buildOverlay();
    }

    // ---------- layout ----------
    resize(cssW, cssH) {
      this.cssW = cssW; this.cssH = cssH;
      this.dpr = Math.min(root.devicePixelRatio || 1, 3);
      this.canvas.width = Math.round(cssW * this.dpr);
      this.canvas.height = Math.round(cssH * this.dpr);
      this.layout();
    }

    layout() {
      if (!this.grid || !this.cssW) return;
      const pad = Math.max(10, Math.min(this.cssW, this.cssH) * 0.03);
      this.tile = Math.floor(Math.min((this.cssW - pad * 2) / this.grid.width, (this.cssH - pad * 2) / this.grid.height, 88));
      this.boardW = this.tile * this.grid.width;
      this.boardH = this.tile * this.grid.height;
      this.ox = Math.round((this.cssW - this.boardW) / 2);
      this.oy = Math.round((this.cssH - this.boardH) / 2);
      this.makeShadowPattern();
      this.buildTerrain();
      this.setTowers(this.towers, { skip: this.skip });
    }

    // Tile under a client point. With loose, points just outside the board
    // (up to 0.3 tile) snap to the nearest edge tile.
    tileAtPoint(clientX, clientY, loose = false) {
      if (!this.grid || !this.tile) return null;
      const rect = this.canvas.getBoundingClientRect();
      const fx = (clientX - rect.left - this.ox) / this.tile;
      const fy = (clientY - rect.top - this.oy) / this.tile;
      const m = loose ? 0.3 : 0;
      if (fx < -m || fy < -m || fx >= this.grid.width + m || fy >= this.grid.height + m) return null;
      const x = Math.max(0, Math.min(this.grid.width - 1, Math.floor(fx)));
      const y = Math.max(0, Math.min(this.grid.height - 1, Math.floor(fy)));
      return [x, y];
    }

    // Client-space rectangle of a tile.
    tileRect(x, y) {
      const rect = this.canvas.getBoundingClientRect();
      return { left: rect.left + this.ox + x * this.tile, top: rect.top + this.oy + y * this.tile, size: this.tile };
    }

    offscreen() {
      const c = document.createElement('canvas');
      c.width = this.canvas.width; c.height = this.canvas.height;
      const ctx = c.getContext('2d');
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      return [c, ctx];
    }

    makeShadowPattern() {
      const size = Math.max(6, Math.round(this.tile * 0.16)) * this.dpr;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = 'rgba(14, 20, 30, 0.42)';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(8, 12, 20, 0.5)';
      ctx.lineWidth = size * 0.28;
      ctx.beginPath();
      ctx.moveTo(-size, size * 2); ctx.lineTo(size * 2, -size);
      ctx.moveTo(-size, size); ctx.lineTo(size, -size);
      ctx.moveTo(0, size * 2); ctx.lineTo(size * 2, 0);
      ctx.stroke();
      this.shadowPattern = this.ctx.createPattern(c, 'repeat');
      this.shadowPattern.setTransform(new DOMMatrix().scale(1 / this.dpr));
    }

    // ---------- cached layers ----------
    neighbours(x, y, kind) {
      const is = (dx, dy) => L.tileAt(this.grid, x + dx, y + dy) === kind;
      return { l: is(-1, 0), r: is(1, 0), t: is(0, -1), b: is(0, 1) };
    }

    buildTerrain() {
      const [c, ctx] = this.offscreen();
      const { grid, tile: s, ox, oy } = this;
      // Board plate with a soft drop shadow.
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = s * 0.4;
      ctx.shadowOffsetY = s * 0.12;
      ctx.fillStyle = P.board;
      A.roundRect(ctx, ox - s * 0.12, oy - s * 0.12, this.boardW + s * 0.24, this.boardH + s * 0.24, s * 0.22);
      ctx.fill();
      ctx.restore();
      ctx.save();
      A.roundRect(ctx, ox, oy, this.boardW, this.boardH, s * 0.14);
      ctx.clip();
      const each = (fn) => {
        for (let y = 0; y < grid.height; y++)
          for (let x = 0; x < grid.width; x++) fn(x, y, L.tileAt(grid, x, y), ox + x * s, oy + y * s);
      };
      each((x, y, t, px, py) => A.grass(ctx, px, py, s, x, y));
      each((x, y, t, px, py) => { if (t === L.TILE.HILL) A.hillShadow(ctx, px, py, s, this.neighbours(x, y, t)); });
      for (let layer = 0; layer < 4; layer++)
        each((x, y, t, px, py) => { if (t === L.TILE.HILL) A.hillLayer(ctx, px, py, s, this.neighbours(x, y, t), layer); });
      each((x, y, t, px, py) => { if (t === L.TILE.WALL) A.wallShadow(ctx, px, py, s, this.neighbours(x, y, t)); });
      each((x, y, t, px, py) => {
        if (t === L.TILE.WALL) A.wall(ctx, px, py, s, this.neighbours(x, y, t));
        if (t === L.TILE.TREE) A.tree(ctx, px, py, s, x, y);
      });
      ctx.restore();
      this.terrain = c;
    }

    // Coverage tint, shadow zones and the placement preview.
    buildOverlay() {
      if (!this.grid || !this.tile || !this.ev) return;
      const [c, ctx] = this.offscreen();
      const { tile: s, ox, oy, ev } = this;
      A.roundRect(ctx, ox, oy, this.boardW, this.boardH, s * 0.14);
      ctx.clip();
      const quiet = new Set(this.grid.quiet.map(([x, y]) => key(x, y)));
      const covered = new Set();
      const shadow = new Set();
      const sources = this.liveReaches(ev);
      for (const r of sources) {
        r.covered.forEach(([x, y]) => covered.add(key(x, y)));
        r.shadow.forEach(([x, y]) => shadow.add(key(x, y)));
      }
      const fillTiles = (keys, style) => {
        ctx.fillStyle = style;
        for (const k of keys) {
          const [x, y] = k.split(',').map(Number);
          ctx.fillRect(ox + x * s, oy + y * s, s, s);
        }
      };
      fillTiles([...covered].filter((k) => !quiet.has(k)), 'rgba(127, 224, 208, 0.13)');
      fillTiles([...covered].filter((k) => quiet.has(k)), 'rgba(232, 106, 95, 0.18)');
      fillTiles([...shadow].filter((k) => !covered.has(k)), this.shadowPattern);

      const pv = this.pv;
      if (pv && this.preview) {
        const [px, py] = pv.tower;
        const cx = ox + (px + 0.5) * s, cy = oy + (py + 0.5) * s;
        const r = pv.reach;
        ctx.save();
        ctx.lineWidth = Math.max(1, s * 0.03);
        if (pv.live) {
          fillTiles(r.covered.map(([x, y]) => key(x, y)).filter((k) => !covered.has(k) && !quiet.has(k)), 'rgba(127, 224, 208, 0.16)');
          fillTiles(r.shadow.map(([x, y]) => key(x, y)).filter((k) => !covered.has(k) && !shadow.has(k)), this.shadowPattern);
          ctx.setLineDash([s * 0.12, s * 0.1]);
          ctx.strokeStyle = 'rgba(127, 224, 208, 0.55)';
        } else {
          // Would be dead: no tint, only a dotted grey outline.
          ctx.setLineDash([s * 0.03, s * 0.08]);
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(154, 167, 181, 0.45)';
        }
        this.rangePath(ctx, cx, cy, r.radius, r.facing);
        ctx.stroke();
        // Bounce preview: the mirror tower and its range, faintly.
        if (pv.live) for (const b of r.bounces) {
          if (!b.tiles.length) continue;
          const ix = ox + (b.image[0] + 0.5) * s, iy = oy + (b.image[1] + 0.5) * s;
          ctx.setLineDash([s * 0.08, s * 0.11]);
          ctx.strokeStyle = 'rgba(233, 237, 241, 0.30)';
          A.ellipse(ctx, ix, iy, (r.radius + 0.5) * s, (r.radius + 0.5) * s);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(233, 237, 241, 0.30)';
          A.ellipse(ctx, ix, iy, s * 0.3, s * 0.3);
          ctx.stroke();
        }
        ctx.restore();
      }
      this.overlay = c;
    }

    // Reaches of every live source (the station included).
    liveReaches(ev) {
      const out = [];
      if (ev.stationReach) out.push(ev.stationReach);
      ev.reach.forEach((r, k) => { if (ev.live[k]) out.push(r); });
      return out;
    }

    // Circle for a mast, wedge for a dish.
    rangePath(ctx, cx, cy, radius, facing) {
      const R = (radius + 0.5) * this.tile;
      ctx.beginPath();
      if (facing === null || facing === undefined) { ctx.arc(cx, cy, R, 0, Math.PI * 2); return; }
      const mid = -Math.PI / 2 + facing * Math.PI / 2;
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, mid - Math.PI / 4, mid + Math.PI / 4);
      ctx.closePath();
    }

    // One wave layer per live source, plus one per bounce. Each layer is a
    // mask of the tiles it covers, clipped to its circle, wedge or panel side.
    buildWaves() {
      const s = this.tile, ev = this.ev;
      if (!ev || !s) { this.waves = []; return; }
      const quiet = new Set(this.grid.quiet.map(([x, y]) => key(x, y)));
      const layers = [];
      const make = (cx, cy, r, tiles, clip, owner, ringFrom) => {
        // cx, cy: range centre in tile units; r: reach in tiles. The layer
        // is cropped to the tiles it covers, so sparse cones stay cheap.
        const shown = tiles.filter(([x, y]) => !quiet.has(key(x, y)));
        if (!shown.length) return;
        const xs = shown.map((q) => q[0]), ys = shown.map((q) => q[1]);
        const x0 = Math.min(...xs), y0 = Math.min(...ys);
        const w = (Math.max(...xs) - x0 + 1) * s, h = (Math.max(...ys) - y0 + 1) * s;
        const c = document.createElement('canvas');
        c.width = Math.ceil(w * this.dpr); c.height = Math.ceil(h * this.dpr);
        const ctx = c.getContext('2d');
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = '#fff';
        for (const [x, y] of shown) ctx.fillRect((x - x0) * s, (y - y0) * s, s, s);
        ctx.globalCompositeOperation = 'destination-in';
        clip(ctx, x0, y0);
        ctx.fill();
        const scratch = document.createElement('canvas');
        scratch.width = c.width; scratch.height = c.height;
        layers.push({ mask: c, scratch, sctx: scratch.getContext('2d'), w, h, x0, y0,
          rcx: (ringFrom[0] - x0) * s, rcy: (ringFrom[1] - y0) * s, maxR: (r + 0.5) * s, owner });
      };
      const addSource = (t, reach, owner) => {
        const cx = t[0] + 0.5, cy = t[1] + 0.5;
        const f = reach.facing;
        const from = f === null ? [cx, cy] : [cx + facingVec(f)[0] * 0.3, cy + facingVec(f)[1] * 0.3];
        make(cx, cy, reach.radius, reach.direct, (ctx, x0, y0) => this.rangePath(ctx, (cx - x0) * s, (cy - y0) * s, reach.radius, f), owner, from);
        for (const b of reach.bounces) {
          if (!b.tiles.length) continue;
          const ix = b.image[0] + 0.5, iy = b.image[1] + 0.5;
          make(ix, iy, reach.radius, b.tiles, (ctx, x0, y0) => {
            ctx.beginPath();
            ctx.arc((ix - x0) * s, (iy - y0) * s, (reach.radius + 0.5) * s, 0, Math.PI * 2);
          }, owner, [ix, iy]);
        }
      };
      if (ev.stationReach) addSource(this.grid.station, ev.stationReach, -1);
      const shown = this.shownTowers();
      shown.forEach((i, k) => addSource(this.towers[i], ev.reach[k], k));
      this.waves = layers;
    }

    // ---------- per frame ----------
    frame(now) {
      const dt = Math.min(0.05, (now - (this.lastTime || now)) / 1000);
      this.lastTime = now;
      const t = now / 1000;
      this.time = t;
      const { ctx, grid } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!grid || !this.terrain || !this.ev) return;
      ctx.drawImage(this.terrain, 0, 0);
      ctx.drawImage(this.overlay, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const { tile: s, ox, oy, ev } = this;
      const still = reducedMotion();

      // Advance tower animations.
      for (const v of this.vis.values()) {
        v.age += dt;
        const liveTarget = ev.live[v.k] ? 1 : 0;
        if (liveTarget && v.delay > 0) v.delay -= dt;
        else v.live += (liveTarget - v.live) * Math.min(1, dt * 10);
        if (v.dish) v.angle += (v.target - v.angle) * Math.min(1, still ? 1 : dt * 18);
      }
      const liveOf = (owner) => (owner === -1 ? 1 : this.visAt(owner).live);

      this.drawWaves(t, liveOf);
      this.drawStatics(t, still);
      this.drawSlot();
      this.drawHover();
      this.drawRelayLinks(t, liveOf);
      this.drawLinks(t, liveOf);
      this.drawTargets(t, dt);
      this.drawTowers(t);
      this.drawPreviewGhost(t);
      this.drawFocusCone();
      this.drawHint(t);
      this.drawCallout(t);
    }

    visAt(k) {
      const i = this.shown[k];
      const tw = this.towers[i];
      return this.vis.get(key(tw[0], tw[1]));
    }

    // Tile pixel helpers.
    px(x) { return this.ox + x * this.tile; }
    py(y) { return this.oy + y * this.tile; }

    // Antenna tip of a source, in pixels.
    tip(owner) {
      const s = this.tile;
      if (owner === -1) { const [x, y] = this.grid.station; return [this.px(x) + s * 0.5, this.py(y) + s * 0.08]; }
      const i = this.shownTowers()[owner];
      const tw = this.towers[i];
      if (!L.isDish(tw)) return [this.px(tw[0]) + s * 0.5, this.py(tw[1]) + s * 0.12];
      const a = this.vis.get(key(tw[0], tw[1])).angle;
      return [this.px(tw[0]) + s * (0.5 + Math.sin(a) * 0.3), this.py(tw[1]) + s * (0.45 - Math.cos(a) * 0.3)];
    }

    drawStatics(t, still) {
      const { ctx, grid, tile: s, ev } = this;
      const violated = new Set(ev.violations.map(([x, y]) => key(x, y)));
      const pvViol = this.pv && this.pv.live ? new Set(this.pv.ev.violations.map(([x, y]) => key(x, y))) : new Set();
      for (const [x, y] of grid.quiet) {
        const k = key(x, y);
        const state = violated.has(k) ? 'violated' : pvViol.has(k) ? 'preview' : 'ok';
        A.observatory(ctx, this.px(x), this.py(y), s, state, still ? 0 : t);
      }
      for (const [x, y, kind] of grid.panels) {
        A.reflector(ctx, this.px(x), this.py(y), s, kind, ev.litPanels.has(key(x, y)) ? 1 : 0, t, still);
      }
      if (grid.station) A.station(ctx, this.px(grid.station[0]), this.py(grid.station[1]), s, still ? 0.4 : t);
    }

    drawWaves(t, liveOf) {
      const { ctx, tile: s, dpr } = this;
      this.waves.forEach((w, i) => {
        const alive = liveOf(w.owner);
        if (alive < 0.02) return;
        const age = w.owner === -1 ? 9 : this.visAt(w.owner).age;
        const sctx = w.sctx;
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
        sctx.clearRect(0, 0, w.scratch.width, w.scratch.height);
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const g = sctx.createRadialGradient(w.rcx, w.rcy, 0, w.rcx, w.rcy, w.maxR);
        g.addColorStop(0, 'rgba(127, 224, 208, 0.22)');
        g.addColorStop(1, 'rgba(127, 224, 208, 0.04)');
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, w.w, w.h);
        const grow = Math.min(1, age / 0.6);
        for (let k = 0; k < WAVE_RINGS; k++) {
          const phase = ((t + i * 0.37) / WAVE_PERIOD + k / WAVE_RINGS) % 1;
          const rr = phase * w.maxR * grow;
          if (rr < 2) continue;
          sctx.strokeStyle = `rgba(160, 240, 228, ${0.75 * (1 - phase) ** 1.3})`;
          sctx.lineWidth = Math.max(1.5, s * 0.06) * (1 - phase * 0.5);
          sctx.beginPath();
          sctx.arc(w.rcx, w.rcy, rr, 0, Math.PI * 2);
          sctx.stroke();
        }
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalCompositeOperation = 'destination-in';
        sctx.drawImage(w.mask, 0, 0);
        ctx.globalAlpha = alive;
        ctx.drawImage(w.scratch, this.px(w.x0), this.py(w.y0), w.w, w.h);
        ctx.globalAlpha = 1;
      });
    }

    // Relay links: one per live tower, to its parent in the station tree.
    drawRelayLinks(t, liveOf) {
      if (!this.grid.station) return;
      const { ctx, tile: s, ev } = this;
      ctx.save();
      ctx.lineCap = 'round';
      ev.parent.forEach((p, k) => {
        if (p === null || !ev.live[k]) return;
        const prog = Math.min(1, liveOf(k) * 1.4);
        if (prog < 0.02) return;
        const [ax, ay] = this.tip(p), [bx, by] = this.tip(k);
        const ex = ax + (bx - ax) * prog, ey = ay + (by - ay) * prog;
        ctx.strokeStyle = 'rgba(127, 224, 208, 0.12)';
        ctx.lineWidth = s * 0.12;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(127, 224, 208, 0.6)';
        ctx.lineWidth = Math.max(1.2, s * 0.045);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ex, ey); ctx.stroke();
        if (prog >= 1) {
          // Two packets travelling opposite ways: links are two-way.
          const q = (t / 1.8 + k * 0.21) % 1;
          ctx.fillStyle = '#d8fff9';
          A.ellipse(ctx, ax + (bx - ax) * q, ay + (by - ay) * q, s * 0.04, s * 0.04); ctx.fill();
          A.ellipse(ctx, bx + (ax - bx) * q, by + (ay - by) * q, s * 0.04, s * 0.04); ctx.fill();
        }
      });
      // Would-be link of the preview tower, dashed.
      if (this.pv && this.pv.live && this.pv.parent !== null && this.pv.parent !== undefined) {
        const [x, y] = this.pv.tower;
        const [ax, ay] = this.tip(this.pv.parent);
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([s * 0.1, s * 0.08]);
        ctx.strokeStyle = P.signal;
        ctx.lineWidth = Math.max(1.2, s * 0.04);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(this.px(x) + s * 0.5, this.py(y) + s * 0.12); ctx.stroke();
      }
      ctx.restore();
    }

    // House links: dashed, with a one-way packet. Office blocks get two,
    // anchored on the lamps. A bounced link bends at the panel.
    drawLinks(t, liveOf) {
      const { ctx, tile: s, ev } = this;
      const busy = this.busyKeys;
      ctx.save();
      ctx.lineCap = 'round';
      for (const [k, list] of ev.connections) {
        const [hx, hy] = k.split(',').map(Number);
        const isBusy = busy.has(k);
        const tv = this.targetVis.get(k);
        list.slice(0, isBusy ? 2 : 1).forEach((owner, n) => {
          const reach = owner === -1 ? ev.stationReach : ev.reach[owner];
          const [ax, ay] = this.tip(owner);
          const bx = this.px(hx) + s * (isBusy ? (n === 0 ? 0.36 : 0.64) : 0.5);
          const by = this.py(hy) + s * (isBusy ? 0.22 : 0.38);
          const age = owner === -1 ? 9 : this.visAt(owner).age;
          const light = isBusy ? tv.lamps[n] : tv.light;
          const fade = Math.min(1, age / 0.5) * Math.min(1, light) * liveOf(owner);
          if (fade < 0.02) return;
          let pts = [[ax, ay], [bx, by]];
          if (!reach.direct.some(([x, y]) => x === hx && y === hy)) {
            const b = reach.bounces.find((bb) => bb.tiles.some(([x, y]) => x === hx && y === hy));
            if (b) pts = [[ax, ay], [this.px(b.panel[0]) + s * 0.5, this.py(b.panel[1]) + s * 0.5], [bx, by]];
          }
          ctx.globalAlpha = 0.85 * fade;
          ctx.strokeStyle = P.signal;
          ctx.lineWidth = Math.max(1, s * 0.025);
          ctx.setLineDash([s * 0.08, s * 0.08]);
          ctx.lineDashOffset = -t * s * 0.8;
          ctx.beginPath();
          ctx.moveTo(...pts[0]);
          for (const p of pts.slice(1)) ctx.lineTo(...p);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#d8fff9';
          if (pts.length === 3) { A.ellipse(ctx, pts[1][0], pts[1][1], s * 0.035, s * 0.035); ctx.fill(); }
          // Packet travels each segment in order.
          const segs = pts.length - 1;
          const p = ((t * 0.7 + (hx * 7 + hy * 3 + n) * 0.13) % 1) * segs;
          const si = Math.min(segs - 1, Math.floor(p)), f = p - si;
          const [x0, y0] = pts[si], [x1, y1] = pts[si + 1];
          A.ellipse(ctx, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, s * 0.035, s * 0.035);
          ctx.fill();
        });
      }
      ctx.restore();
    }

    // Houses and office blocks ease toward lit or dark.
    drawTargets(t, dt) {
      const { ctx, tile: s, ev } = this;
      const pvConn = this.pv && this.pv.live ? this.pv.ev.connections : null;
      for (const tg of this.targetList) {
        const k = key(tg.x, tg.y);
        const v = this.targetVis.get(k);
        const n = (ev.connections.get(k) || []).length;
        const px = this.px(tg.x), py = this.py(tg.y);
        if (tg.need === 1) {
          const target = n ? 1 : 0;
          v.light += (target - v.light) * Math.min(1, dt * 6);
          if (v.light > 0.02) {
            const g = ctx.createRadialGradient(px + s / 2, py + s / 2, 0, px + s / 2, py + s / 2, s * 0.75);
            g.addColorStop(0, `rgba(255, 210, 122, ${0.42 * v.light})`);
            g.addColorStop(1, 'rgba(255, 210, 122, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(px - s * 0.25, py - s * 0.25, s * 1.5, s * 1.5);
          }
          const alert = target ? 0 : (0.35 + 0.35 * Math.sin(t * 4 + tg.x + tg.y)) * (1 - v.light);
          A.house(ctx, px, py, s, v.light, alert);
        } else {
          // Lamps: on over 180 ms (drawn with an overshoot), off over 200 ms.
          // A second lamp lighting on the same move waits 120 ms.
          const want = [n >= 1 ? 1 : 0, n >= 2 ? 1 : 0];
          if (want[1] && v.lamps[1] === 0 && v.lamps[0] < 0.5 && want[0] && !v.delay) v.delay = 0.12;
          for (let i = 0; i < 2; i++) {
            if (i === 1 && v.delay > 0) { v.delay = Math.max(0, v.delay - dt); if (v.delay > 0) continue; }
            const rate = want[i] ? dt / 0.18 : dt / 0.2;
            v.lamps[i] = want[i] ? Math.min(1, v.lamps[i] + rate) : Math.max(0, v.lamps[i] - rate);
          }
          const pn = pvConn ? (pvConn.get(k) || []).length : n;
          const preview = [pn >= 1 && n < 1, pn >= 2 && n < 2];
          A.office(ctx, px, py, s, v.lamps, t, preview);
        }
      }
    }

    drawTowers(t) {
      const { ctx, tile: s } = this;
      const showBadge = Math.max(0, Math.min(1, (this.badgeUntil - t) * 3));
      this.shownTowers().forEach((i, k) => {
        const tw = this.towers[i];
        const v = this.vis.get(key(tw[0], tw[1]));
        const pop = Math.min(1, v.age / 0.25);
        const scale = 0.6 + 0.4 * A.easeOutBack(pop);
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);
        const badge = v.dish ? Math.max(showBadge, this.focusDish === i ? 1 : 0) : 0;
        ctx.save();
        ctx.translate(this.px(tw[0]) + 0.5 * s, this.py(tw[1]) + 0.85 * s);
        ctx.scale(scale, scale);
        const draw = (dead) => (v.dish ? A.dish(ctx, -s / 2, -s * 0.85, s, v.angle, pulse, false, dead, badge)
          : A.tower(ctx, -s / 2, -s * 0.85, s, pulse, false, dead));
        // Cross-fade between the dead and live palettes.
        if (v.live < 0.98) draw(true);
        if (v.live > 0.02) { ctx.globalAlpha = v.live; draw(false); }
        ctx.restore();
      });
    }

    drawPreviewGhost() {
      if (!this.preview || !this.ghost || !this.pv) return;
      const { ctx, tile: s } = this;
      const [x, y, f] = this.pv.tower;
      if (L.isDish(this.pv.tower)) A.dish(ctx, this.px(x), this.py(y), s, f * Math.PI / 2, 0, true, !this.pv.live, 0);
      else A.tower(ctx, this.px(x), this.py(y), s, 0, true, !this.pv.live);
    }

    // Hovered dish: its cone, and a faint dashed cone for the next facing.
    drawFocusCone() {
      if (this.focusDish === null || this.focusDish === undefined) return;
      const tw = this.towers[this.focusDish];
      if (!tw || !L.isDish(tw) || this.focusDish === this.skip) return;
      const { ctx, tile: s } = this;
      const r = L.towerRadius(this.grid, tw[0], tw[1], tw[2]);
      const cx = this.px(tw[0]) + s / 2, cy = this.py(tw[1]) + s / 2;
      ctx.save();
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.setLineDash([s * 0.12, s * 0.1]);
      ctx.strokeStyle = 'rgba(127, 224, 208, 0.55)';
      this.rangePath(ctx, cx, cy, r, tw[2]);
      ctx.stroke();
      ctx.setLineDash([s * 0.015, s * 0.025]);
      ctx.strokeStyle = 'rgba(233, 237, 241, 0.25)';
      this.rangePath(ctx, cx, cy, r, (tw[2] + 1) % 4);
      ctx.stroke();
      ctx.restore();
    }

    // Dashed slot on the tile a tower is being moved from.
    drawSlot() {
      if (!this.slot) return;
      const { ctx, tile: s } = this;
      const [x, y] = this.slot;
      ctx.save();
      ctx.setLineDash([s * 0.09, s * 0.07]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = Math.max(1.2, s * 0.03);
      A.roundRect(ctx, this.px(x) + s * 0.08, this.py(y) + s * 0.08, s * 0.84, s * 0.84, s * 0.14);
      ctx.stroke();
      ctx.restore();
    }

    drawHover() {
      if (!this.preview) return;
      const { ctx, tile: s } = this;
      const [x, y] = this.preview;
      const ok = this.previewSpec ? true : this.hoverOk !== undefined ? this.hoverOk : L.canPlace(this.grid, x, y);
      ctx.save();
      const path = () => A.roundRect(ctx, this.px(x) + s * 0.04, this.py(y) + s * 0.04, s * 0.92, s * 0.92, s * 0.14);
      if (!ok) {
        ctx.strokeStyle = A.UNDERLAY;
        ctx.lineWidth = Math.max(2.5, s * 0.07);
        path(); ctx.stroke();
      }
      ctx.strokeStyle = ok ? 'rgba(255, 255, 255, 0.75)' : P.danger;
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      path(); ctx.stroke();
      ctx.restore();
    }

    drawHint(t) {
      if (!this.hint) return;
      const { ctx, tile: s } = this;
      const { x, y, kind } = this.hint;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.save();
      ctx.strokeStyle = kind === 'remove' ? P.danger : P.hint;
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      const g = s * (0.02 + 0.06 * pulse);
      A.roundRect(ctx, this.px(x) - g, this.py(y) - g, s + g * 2, s + g * 2, s * 0.2);
      ctx.stroke();
      ctx.restore();
      // A placement hint for a dish shows its facing.
      if (kind === 'place' && this.hint.tower && L.isDish(this.hint.tower)) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.25 * pulse;
        A.dish(ctx, this.px(x), this.py(y), s, this.hint.tower[2] * Math.PI / 2, 0, true, false, 0);
        ctx.restore();
      }
    }

    drawCallout(t) {
      if (!this.callout) return;
      const { ctx, tile: s } = this;
      const [x, y] = this.callout;
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.save();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = Math.max(2, s * 0.05);
      ctx.globalAlpha = 0.5 + 0.5 * pulse;
      const g = s * (0.02 + 0.05 * pulse);
      A.roundRect(ctx, this.px(x) - g, this.py(y) - g, s + g * 2, s + g * 2, s * 0.2);
      ctx.stroke();
      ctx.restore();
    }
  }

  root.SignalBoard = Board;
})(window);
