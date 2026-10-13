// Canvas board renderer. Static terrain and the coverage overlay are cached
// in offscreen canvases; each frame only draws the animated parts.
(function (root) {
  'use strict';
  const L = root.SignalLogic;
  const A = root.SignalArt;
  const P = A.PALETTE;

  const WAVE_PERIOD = 2.4; // seconds for one ring to travel out
  const WAVE_RINGS = 3;

  class Board {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.grid = null;
      this.towers = [];
      this.preview = null;     // [x, y] tile under the pointer, or null
      this.hint = null;        // { x, y, kind: 'place' | 'remove' }
      this.houseLight = new Map();
      this.towerAge = [];      // seconds since each tower was placed
      this.lastTime = 0;
      this.cssW = 0; this.cssH = 0; this.dpr = 1;
      this.shadowPattern = null;
      this.reach = [];
      this.links = new Map();
      this.waveMasks = [];
    }

    setLevel(grid) {
      this.grid = grid;
      this.towers = [];
      this.towerAge = [];
      this.preview = null;
      this.hint = null;
      this.houseLight = new Map(L.houses(grid).map(([x, y]) => [x + ',' + y, 0]));
      this.layout();
    }

    setTowers(towers) {
      const old = new Set(this.towers.map((t) => t.join(',')));
      const ages = new Map(this.towers.map((t, i) => [t.join(','), this.towerAge[i]]));
      this.towers = towers.map((t) => t.slice());
      this.towerAge = this.towers.map((t) => (old.has(t.join(',')) ? ages.get(t.join(',')) : 0));
      this.reach = this.towers.map(([x, y]) => L.towerReach(this.grid, x, y));
      this.links = L.connections(this.grid, this.towers);
      this.buildOverlay();
      this.buildWaveMasks();
    }

    // Highlight the tile under the pointer. With showReach, also preview the
    // coverage and shadow a tower placed there would have.
    setPreview(tile, showReach = false) {
      const same = (a, b) => (a && b ? a[0] === b[0] && a[1] === b[1] : a === b);
      if (same(tile, this.preview) && showReach === this.previewShowsReach) return;
      this.preview = tile;
      this.previewShowsReach = showReach;
      this.previewReach = tile && showReach ? L.towerReach(this.grid, tile[0], tile[1]) : null;
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
      this.setTowers(this.towers);
    }

    tileAtPoint(clientX, clientY) {
      if (!this.grid) return null;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.floor((clientX - rect.left - this.ox) / this.tile);
      const y = Math.floor((clientY - rect.top - this.oy) / this.tile);
      if (x < 0 || y < 0 || x >= this.grid.width || y >= this.grid.height) return null;
      return [x, y];
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
      if (!this.grid || !this.tile) return;
      const [c, ctx] = this.offscreen();
      const { tile: s, ox, oy } = this;
      A.roundRect(ctx, ox, oy, this.boardW, this.boardH, s * 0.14);
      ctx.clip();
      const key = ([x, y]) => x + ',' + y;
      const covered = new Set();
      const shadow = new Set();
      for (const r of this.reach) {
        r.covered.forEach((t) => covered.add(key(t)));
        r.shadow.forEach((t) => shadow.add(key(t)));
      }
      const fillTiles = (keys, style) => {
        ctx.fillStyle = style;
        for (const k of keys) {
          const [x, y] = k.split(',').map(Number);
          ctx.fillRect(ox + x * s, oy + y * s, s, s);
        }
      };
      fillTiles(covered, 'rgba(127, 224, 208, 0.13)');
      fillTiles([...shadow].filter((k) => !covered.has(k)), this.shadowPattern);

      const pr = this.previewReach;
      if (pr && this.preview && L.canPlace(this.grid, ...this.preview)) {
        fillTiles(pr.covered.map(key).filter((k) => !covered.has(k)), 'rgba(127, 224, 208, 0.16)');
        fillTiles(pr.shadow.map(key).filter((k) => !covered.has(k) && !shadow.has(k)), this.shadowPattern);
        // Dashed range circle.
        const [px, py] = this.preview;
        ctx.save();
        ctx.setLineDash([s * 0.12, s * 0.1]);
        ctx.strokeStyle = 'rgba(127, 224, 208, 0.55)';
        ctx.lineWidth = Math.max(1, s * 0.03);
        A.ellipse(ctx, ox + (px + 0.5) * s, oy + (py + 0.5) * s, (pr.radius + 0.5) * s, (pr.radius + 0.5) * s);
        ctx.stroke();
        ctx.restore();
      }
      this.overlay = c;
    }

    // One mask per tower: the tiles it covers, clipped to its range circle.
    buildWaveMasks() {
      const s = this.tile;
      this.waveMasks = this.towers.map(([tx, ty], i) => {
        const r = this.reach[i].radius;
        const span = (r * 2 + 1) * s;
        const c = document.createElement('canvas');
        c.width = c.height = Math.ceil(span * this.dpr);
        const ctx = c.getContext('2d');
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = '#fff';
        for (const [x, y] of this.reach[i].covered) ctx.fillRect((x - tx + r) * s, (y - ty + r) * s, s, s);
        ctx.globalCompositeOperation = 'destination-in';
        A.ellipse(ctx, span / 2, span / 2, (r + 0.5) * s, (r + 0.5) * s);
        ctx.fill();
        const scratch = document.createElement('canvas');
        scratch.width = scratch.height = c.width;
        return { mask: c, scratch, sctx: scratch.getContext('2d'), span, r };
      });
    }

    // ---------- per frame ----------
    frame(now) {
      const dt = Math.min(0.05, (now - (this.lastTime || now)) / 1000);
      this.lastTime = now;
      const t = now / 1000;
      const { ctx, grid } = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      if (!grid || !this.terrain) return;
      ctx.drawImage(this.terrain, 0, 0);
      ctx.drawImage(this.overlay, 0, 0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const { tile: s, ox, oy } = this;
      this.towerAge = this.towerAge.map((a) => a + dt);

      this.drawWaves(t);
      this.drawHover(t);
      this.drawLinks(t);

      // Houses ease toward lit or dark.
      for (const [hx, hy] of L.houses(grid)) {
        const k = hx + ',' + hy;
        const target = this.links.has(k) ? 1 : 0;
        const cur = this.houseLight.get(k);
        const next = cur + (target - cur) * Math.min(1, dt * 6);
        this.houseLight.set(k, next);
        const px = ox + hx * s, py = oy + hy * s;
        if (next > 0.02) {
          const g = ctx.createRadialGradient(px + s / 2, py + s / 2, 0, px + s / 2, py + s / 2, s * 0.75);
          g.addColorStop(0, `rgba(255, 210, 122, ${0.42 * next})`);
          g.addColorStop(1, 'rgba(255, 210, 122, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(px - s * 0.25, py - s * 0.25, s * 1.5, s * 1.5);
        }
        const alert = target ? 0 : (0.35 + 0.35 * Math.sin(t * 4 + hx + hy)) * (1 - next);
        A.house(ctx, px, py, s, next, alert);
      }

      // Towers, with a short pop-in when placed.
      this.towers.forEach(([x, y], i) => {
        const age = this.towerAge[i];
        const pop = Math.min(1, age / 0.25);
        const scale = 0.6 + 0.4 * easeOutBack(pop);
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 + i);
        ctx.save();
        ctx.translate(ox + (x + 0.5) * s, oy + (y + 0.85) * s);
        ctx.scale(scale, scale);
        A.tower(ctx, -s / 2, -s * 0.85, s, pulse, false);
        ctx.restore();
      });

      if (this.preview && this.ghost && !this.towers.some(([x, y]) => x === this.preview[0] && y === this.preview[1])) {
        const [x, y] = this.preview;
        A.tower(ctx, ox + x * s, oy + y * s, s, 0, true);
      }

      this.drawHint(t);
    }

    drawWaves(t) {
      const { ctx, tile: s, ox, oy, dpr } = this;
      this.towers.forEach(([tx, ty], i) => {
        const w = this.waveMasks[i];
        const sctx = w.sctx;
        const span = w.span, maxR = (w.r + 0.5) * s;
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalCompositeOperation = 'source-over';
        sctx.clearRect(0, 0, w.scratch.width, w.scratch.height);
        sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cx = span / 2, cy = span / 2;
        // Soft fill so the reach reads even between rings.
        const g = sctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
        g.addColorStop(0, 'rgba(127, 224, 208, 0.22)');
        g.addColorStop(1, 'rgba(127, 224, 208, 0.04)');
        sctx.fillStyle = g;
        sctx.fillRect(0, 0, span, span);
        const grow = Math.min(1, this.towerAge[i] / 0.6);
        for (let k = 0; k < WAVE_RINGS; k++) {
          const phase = ((t + i * 0.37) / WAVE_PERIOD + k / WAVE_RINGS) % 1;
          const rr = phase * maxR * grow;
          if (rr < 2) continue;
          sctx.strokeStyle = `rgba(160, 240, 228, ${0.75 * (1 - phase) ** 1.3})`;
          sctx.lineWidth = Math.max(1.5, s * 0.06) * (1 - phase * 0.5);
          sctx.beginPath();
          sctx.arc(cx, cy, rr, 0, Math.PI * 2);
          sctx.stroke();
        }
        sctx.setTransform(1, 0, 0, 1, 0, 0);
        sctx.globalCompositeOperation = 'destination-in';
        sctx.drawImage(w.mask, 0, 0);
        ctx.drawImage(w.scratch, ox + (tx - w.r) * s, oy + (ty - w.r) * s, span, span);
      });
    }

    drawLinks(t) {
      const { ctx, tile: s, ox, oy } = this;
      ctx.save();
      ctx.lineCap = 'round';
      for (const [k, ti] of this.links) {
        const [hx, hy] = k.split(',').map(Number);
        const [tx, ty] = this.towers[ti];
        const ax = ox + (tx + 0.5) * s, ay = oy + (ty + 0.12) * s;
        const bx = ox + (hx + 0.5) * s, by = oy + (hy + 0.38) * s;
        const fade = Math.min(1, this.towerAge[ti] / 0.5) * this.houseLight.get(k);
        ctx.globalAlpha = 0.85 * fade;
        ctx.strokeStyle = P.signal;
        ctx.lineWidth = Math.max(1, s * 0.025);
        ctx.setLineDash([s * 0.08, s * 0.08]);
        ctx.lineDashOffset = -t * s * 0.8;
        ctx.beginPath();
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.stroke();
        // A small packet travelling down the line.
        const p = (t * 0.7 + (hx * 7 + hy * 3) * 0.13) % 1;
        ctx.setLineDash([]);
        ctx.fillStyle = '#d8fff9';
        A.ellipse(ctx, ax + (bx - ax) * p, ay + (by - ay) * p, s * 0.035, s * 0.035);
        ctx.fill();
      }
      ctx.restore();
    }

    drawHover(t) {
      if (!this.preview) return;
      const { ctx, tile: s, ox, oy } = this;
      const [x, y] = this.preview;
      const ok = L.canPlace(this.grid, x, y);
      ctx.save();
      ctx.strokeStyle = ok ? 'rgba(255, 255, 255, 0.75)' : 'rgba(232, 106, 95, 0.7)';
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      A.roundRect(ctx, ox + x * s + s * 0.04, oy + y * s + s * 0.04, s * 0.92, s * 0.92, s * 0.14);
      ctx.stroke();
      ctx.restore();
    }

    drawHint(t) {
      if (!this.hint) return;
      const { ctx, tile: s, ox, oy } = this;
      const { x, y, kind } = this.hint;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.save();
      ctx.strokeStyle = kind === 'remove' ? P.danger : P.hint;
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      const g = s * (0.02 + 0.06 * pulse);
      A.roundRect(ctx, ox + x * s - g, oy + y * s - g, s + g * 2, s + g * 2, s * 0.2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function easeOutBack(x) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
  }

  root.SignalBoard = Board;
})(window);
