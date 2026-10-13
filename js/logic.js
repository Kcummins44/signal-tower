// Signal Tower game rules. Pure functions, shared by the browser game and the
// Node tools in tools/. Coordinates: tile (x, y) covers [x, x+1] x [y, y+1].
(function (root) {
  'use strict';

  const TILE = { GRASS: '.', HOUSE: 'H', WALL: '#', HILL: '^', TREE: 'T' };
  const HILL_BONUS = 1;
  // Lines that only graze a blocking tile's corner or edge pass through.
  const GRAZE = 0.04;

  function parseLevel(level) {
    const rows = level.map.map((row) => row.split(''));
    const width = rows[0].length;
    if (rows.some((r) => r.length !== width)) throw new Error(`Ragged map in "${level.name}"`);
    return { ...level, rows, width, height: rows.length };
  }

  function tileAt(grid, x, y) {
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
    return grid.rows[y][x];
  }

  function canPlace(grid, x, y) {
    const t = tileAt(grid, x, y);
    return t === TILE.GRASS || t === TILE.HILL;
  }

  function onHill(grid, x, y) {
    return tileAt(grid, x, y) === TILE.HILL;
  }

  function towerRadius(grid, x, y) {
    return grid.radius + (onHill(grid, x, y) ? HILL_BONUS : 0);
  }

  // Walls block every tower. Hills block towers on the ground; a tower
  // standing on a hill sees over them.
  function blocks(grid, x, y, elevated) {
    const t = tileAt(grid, x, y);
    return t === TILE.WALL || (t === TILE.HILL && !elevated);
  }

  // Does segment p0->p1 pass through the interior of box [x0,x1]x[y0,y1]?
  function segmentHitsBox(px, py, qx, qy, x0, y0, x1, y1) {
    let t0 = 0, t1 = 1;
    const dx = qx - px, dy = qy - py;
    const clip = (p, q) => {
      if (p === 0) return q > 0;
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
      return true;
    };
    return clip(-dx, px - x0) && clip(dx, x1 - px) && clip(-dy, py - y0) && clip(dy, y1 - py) && t0 < t1;
  }

  // Line of sight between tile centres. The end tiles never block.
  function hasLineOfSight(grid, tx, ty, x, y) {
    const elevated = onHill(grid, tx, ty);
    const px = tx + 0.5, py = ty + 0.5, qx = x + 0.5, qy = y + 0.5;
    const minX = Math.min(tx, x), maxX = Math.max(tx, x);
    const minY = Math.min(ty, y), maxY = Math.max(ty, y);
    for (let by = minY; by <= maxY; by++) {
      for (let bx = minX; bx <= maxX; bx++) {
        if ((bx === tx && by === ty) || (bx === x && by === y)) continue;
        if (!blocks(grid, bx, by, elevated)) continue;
        if (segmentHitsBox(px, py, qx, qy, bx + GRAZE, by + GRAZE, bx + 1 - GRAZE, by + 1 - GRAZE)) return false;
      }
    }
    // A line squeezing exactly between two diagonal blockers is blocked too.
    const dx = qx - px, dy = qy - py;
    if (dx !== 0 && dy !== 0) {
      for (let cx = minX + 1; cx <= maxX; cx++) {
        const t = (cx - px) / dx;
        const cy = py + dy * t;
        if (Math.abs(cy - Math.round(cy)) > 1e-9) continue;
        const ry = Math.round(cy);
        const same = Math.sign(dx) === Math.sign(dy);
        const a = same ? [cx, ry - 1] : [cx - 1, ry - 1];
        const b = same ? [cx - 1, ry] : [cx, ry];
        if (blocks(grid, a[0], a[1], elevated) && blocks(grid, b[0], b[1], elevated)) return false;
      }
    }
    return true;
  }

  // For one tower: covered tiles, and tiles in range but hidden (shadow).
  function towerReach(grid, tx, ty) {
    const r = towerRadius(grid, tx, ty);
    const covered = [], shadow = [];
    for (let y = Math.max(0, ty - r); y <= Math.min(grid.height - 1, ty + r); y++) {
      for (let x = Math.max(0, tx - r); x <= Math.min(grid.width - 1, tx + r); x++) {
        if ((x - tx) ** 2 + (y - ty) ** 2 > r * r) continue;
        if (tileAt(grid, x, y) === TILE.WALL) continue;
        if (hasLineOfSight(grid, tx, ty, x, y)) covered.push([x, y]);
        else shadow.push([x, y]);
      }
    }
    return { radius: r, covered, shadow };
  }

  function houses(grid) {
    const list = [];
    grid.rows.forEach((row, y) => row.forEach((t, x) => { if (t === TILE.HOUSE) list.push([x, y]); }));
    return list;
  }

  // Map of "x,y" house key -> index of the nearest tower that covers it.
  function connections(grid, towers) {
    const out = new Map();
    const reach = towers.map(([tx, ty]) => towerReach(grid, tx, ty));
    for (const [hx, hy] of houses(grid)) {
      let best = -1, bestD = Infinity;
      reach.forEach((r, i) => {
        if (!r.covered.some(([x, y]) => x === hx && y === hy)) return;
        const d = (towers[i][0] - hx) ** 2 + (towers[i][1] - hy) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) out.set(hx + ',' + hy, best);
    }
    return out;
  }

  function isSolved(grid, towers) {
    return connections(grid, towers).size === houses(grid).length;
  }

  // Exhaustive search for every tower set of the smallest size that lights
  // all houses. Branches on the first unlit house, so it stays fast.
  function solve(grid, maxTowers = 8, maxSolutions = 500) {
    const spots = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++) if (canPlace(grid, x, y)) spots.push([x, y]);
    const hs = houses(grid);
    const index = new Map(hs.map(([x, y], i) => [x + ',' + y, i]));
    const full = 2n ** BigInt(hs.length) - 1n;
    const masks = spots.map(([x, y]) => towerReach(grid, x, y).covered.reduce(
      (m, [cx, cy]) => (index.has(cx + ',' + cy) ? m | (1n << BigInt(index.get(cx + ',' + cy))) : m), 0n));
    for (let size = 1; size <= maxTowers; size++) {
      const found = new Map();
      let capped = false;
      const rec = (mask, picked) => {
        if (capped) return;
        if (mask === full) {
          const key = [...picked].sort((a, b) => a - b).join(',');
          if (!found.has(key)) found.set(key, key.split(',').map((i) => spots[+i]));
          if (found.size >= maxSolutions) capped = true;
          return;
        }
        if (picked.length === size) return;
        let h = 0n;
        while (mask & (1n << h)) h++;
        for (let i = 0; i < spots.length; i++) {
          if (masks[i] & (1n << h)) { picked.push(i); rec(mask | masks[i], picked); picked.pop(); }
        }
      };
      rec(0n, []);
      if (found.size) return { min: size, solutions: [...found.values()], capped, spots: spots.length };
    }
    return { min: null, solutions: [], capped: false, spots: spots.length };
  }

  const api = { TILE, HILL_BONUS, parseLevel, tileAt, canPlace, onHill, towerRadius, blocks,
    hasLineOfSight, towerReach, houses, connections, isSolved, solve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SignalLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
