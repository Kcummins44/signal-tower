// Signal Tower game rules. Pure functions, shared by the browser game and the
// Node tools in tools/. Coordinates: tile (x, y) covers [x, x+1] x [y, y+1].
//
// A tower is an array: [x, y] is a standard tower (mast), and [x, y, f] is a
// dish facing f (0 north, 1 east, 2 south, 3 west).
(function (root) {
  'use strict';

  const TILE = {
    GRASS: '.', HOUSE: 'H', WALL: '#', HILL: '^', TREE: 'T',
    QUIET: 'Q', BUSY: 'B', STATION: 'S', PANEL_RISE: '/', PANEL_FALL: 'L',
  };
  const HILL_BONUS = 1;
  const DISH_BONUS = 2;
  const FACINGS = ['N', 'E', 'S', 'W'];
  // Lines that only graze a blocking tile's corner or edge pass through.
  const GRAZE = 0.04;
  // A bounce must hit the panel's slab, not its very ends.
  const PANEL_MARGIN = 0.05;
  const EPS = 1e-9;

  const isPanel = (t) => t === TILE.PANEL_RISE || t === TILE.PANEL_FALL;
  const isDish = (tower) => tower.length > 2 && tower[2] !== null && tower[2] !== undefined;
  const key = (x, y) => x + ',' + y;

  function parseLevel(level) {
    const rows = level.map.map((row) => row.split(''));
    const width = rows[0].length;
    if (rows.some((r) => r.length !== width)) throw new Error(`Ragged map in "${level.name}"`);
    const grid = { ...level, rows, width, height: rows.length, panels: [], quiet: [], station: null };
    rows.forEach((row, y) => row.forEach((t, x) => {
      if (isPanel(t)) grid.panels.push([x, y, t]);
      if (t === TILE.QUIET) grid.quiet.push([x, y]);
      if (t === TILE.STATION) {
        if (grid.station) throw new Error(`Two stations in "${level.name}"`);
        grid.station = [x, y];
      }
    }));
    return grid;
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

  function towerRadius(grid, x, y, facing) {
    const dish = facing !== undefined && facing !== null;
    return grid.radius + (onHill(grid, x, y) ? HILL_BONUS : 0) + (dish ? DISH_BONUS : 0);
  }

  // Walls and panels block every tower. Hills block towers on the ground; a
  // tower standing on a hill sees over them. Houses, office blocks,
  // observatories, trees and the station let signal through.
  function blocks(grid, x, y, elevated) {
    const t = tileAt(grid, x, y);
    return t === TILE.WALL || isPanel(t) || (t === TILE.HILL && !elevated);
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

  // Is the straight path between two points clear? `skip(bx, by)` names tiles
  // that never block (the end tiles, or the panel a bounce happens in).
  function clearPath(grid, px, py, qx, qy, elevated, skip) {
    const minX = Math.floor(Math.min(px, qx) + EPS), maxX = Math.floor(Math.max(px, qx) - EPS);
    const minY = Math.floor(Math.min(py, qy) + EPS), maxY = Math.floor(Math.max(py, qy) - EPS);
    for (let by = Math.min(minY, maxY); by <= Math.max(minY, maxY); by++) {
      for (let bx = Math.min(minX, maxX); bx <= Math.max(minX, maxX); bx++) {
        if (skip(bx, by) || !blocks(grid, bx, by, elevated)) continue;
        if (segmentHitsBox(px, py, qx, qy, bx + GRAZE, by + GRAZE, bx + 1 - GRAZE, by + 1 - GRAZE)) return false;
      }
    }
    // A line squeezing exactly between two diagonal blockers is blocked too.
    const dx = qx - px, dy = qy - py;
    if (dx !== 0 && dy !== 0) {
      const lo = Math.min(px, qx), hi = Math.max(px, qx);
      for (let cx = Math.floor(lo) + 1; cx < hi - EPS; cx++) {
        if (cx <= lo + EPS) continue;
        const cy = py + dy * ((cx - px) / dx);
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

  // Line of sight between tile centres. The end tiles never block.
  function hasLineOfSight(grid, tx, ty, x, y) {
    const skip = (bx, by) => (bx === tx && by === ty) || (bx === x && by === y);
    return clearPath(grid, tx + 0.5, ty + 0.5, x + 0.5, y + 0.5, onHill(grid, tx, ty), skip);
  }

  // Is the offset (dx, dy) inside a dish's 90 degree cone? Edges count.
  function inCone(facing, dx, dy) {
    switch (facing) {
      case 0: return -dy >= Math.abs(dx) - EPS;
      case 1: return dx >= Math.abs(dy) - EPS;
      case 2: return dy >= Math.abs(dx) - EPS;
      case 3: return -dx >= Math.abs(dy) - EPS;
      default: return true;
    }
  }

  // Mirror a point across a panel's slab line. "/" runs from the tile's
  // bottom-left corner to its top-right corner; "L" from top-left to
  // bottom-right.
  function panelLine(bx, by, kind) {
    return kind === TILE.PANEL_RISE
      ? { f: (x, y) => x + y - (bx + by + 1), mirror: (x, y) => [bx + by + 1 - y, bx + by + 1 - x] }
      : { f: (x, y) => x - y - (bx - by), mirror: (x, y) => [y + (bx - by), x - (bx - by)] };
  }

  // Every tile a reflection off one panel reaches. Kaden's rule: the range
  // counts the whole bounced path, which equals the distance from the
  // tower's mirror image to the tile.
  function bounce(grid, tx, ty, facing, r, panel) {
    const [bx, by, kind] = panel;
    const line = panelLine(bx, by, kind);
    const px = tx + 0.5, py = ty + 0.5;
    const fT = line.f(px, py);
    if (Math.abs(fT) < EPS) return null;
    const [ix, iy] = line.mirror(px, py);
    const elevated = onHill(grid, tx, ty);
    const tiles = [];
    let hitAny = false;
    for (let y = Math.max(0, Math.floor(iy - r)); y <= Math.min(grid.height - 1, Math.ceil(iy + r)); y++) {
      for (let x = Math.max(0, Math.floor(ix - r)); x <= Math.min(grid.width - 1, Math.ceil(ix + r)); x++) {
        const t = tileAt(grid, x, y);
        if (t === TILE.WALL || isPanel(t) || (x === tx && y === ty)) continue;
        const qx = x + 0.5, qy = y + 0.5;
        if ((qx - ix) ** 2 + (qy - iy) ** 2 > r * r + EPS) continue;
        const fQ = line.f(qx, qy);
        if (Math.sign(fQ) !== Math.sign(fT) || Math.abs(fQ) < EPS) continue; // tile must be on the tower's side
        // Where the path from the image to the tile crosses the slab line.
        const fI = -fT;
        const u = fI / (fI - fQ);
        const mx = ix + (qx - ix) * u, my = iy + (qy - iy) * u;
        if (mx < bx + PANEL_MARGIN || mx > bx + 1 - PANEL_MARGIN) continue;
        if (my < by + PANEL_MARGIN || my > by + 1 - PANEL_MARGIN) continue;
        if (!inCone(facing, mx - px, my - py)) continue;
        const inPanel = (cx, cy) => cx === bx && cy === by;
        if (!clearPath(grid, px, py, mx, my, elevated, (cx, cy) => inPanel(cx, cy) || (cx === tx && cy === ty))) continue;
        hitAny = true;
        if (!clearPath(grid, mx, my, qx, qy, elevated, (cx, cy) => inPanel(cx, cy) || (cx === x && cy === y))) continue;
        tiles.push([x, y]);
      }
    }
    if (!tiles.length && !hitAny) return null;
    return { panel: [bx, by], kind, image: [ix - 0.5, iy - 0.5], tiles };
  }

  // For one tower: covered tiles (direct and bounced), tiles in range but
  // hidden (shadow), and the bounces.
  function towerReach(grid, tx, ty, facing) {
    const dish = facing !== undefined && facing !== null;
    const r = towerRadius(grid, tx, ty, facing);
    const direct = [], shadowAll = [];
    for (let y = Math.max(0, ty - r); y <= Math.min(grid.height - 1, ty + r); y++) {
      for (let x = Math.max(0, tx - r); x <= Math.min(grid.width - 1, tx + r); x++) {
        if ((x - tx) ** 2 + (y - ty) ** 2 > r * r) continue;
        if (dish && !inCone(facing, x - tx, y - ty)) continue;
        const t = tileAt(grid, x, y);
        if (t === TILE.WALL || isPanel(t)) continue;
        if (hasLineOfSight(grid, tx, ty, x, y)) direct.push([x, y]);
        else shadowAll.push([x, y]);
      }
    }
    const set = new Set(direct.map(([x, y]) => key(x, y)));
    const bounces = [];
    for (const p of grid.panels || []) {
      const b = bounce(grid, tx, ty, dish ? facing : null, r, p);
      if (b) bounces.push(b);
    }
    const covered = direct.slice();
    for (const b of bounces) for (const [x, y] of b.tiles) {
      if (!set.has(key(x, y))) { set.add(key(x, y)); covered.push([x, y]); }
    }
    const shadow = shadowAll.filter(([x, y]) => !set.has(key(x, y)));
    return { radius: r, facing: dish ? facing : null, covered, direct, shadow, bounces, set };
  }

  function houses(grid) {
    const list = [];
    grid.rows.forEach((row, y) => row.forEach((t, x) => { if (t === TILE.HOUSE) list.push([x, y]); }));
    return list;
  }

  // Everything that needs signal: houses need one tower, office blocks two.
  function targets(grid) {
    const list = [];
    grid.rows.forEach((row, y) => row.forEach((t, x) => {
      if (t === TILE.HOUSE) list.push({ x, y, need: 1, kind: 'house' });
      if (t === TILE.BUSY) list.push({ x, y, need: 2, kind: 'busy' });
    }));
    return list;
  }

  // The whole board state for a set of towers.
  // - live[i]: tower i is powered. Without a station every tower is live.
  //   With a station, a tower is live when it links back to the station
  //   through a chain of links. Two towers link when either covers the
  //   other's tile (Kaden's call: links are two-way).
  // - parent[i]: the tower (or -1 for the station) that tower i hangs from
  //   in a breadth-first tree grown from the station; depth[i] its depth.
  // - connections: target key -> live sources covering it, nearest first.
  //   A source is a tower index, or -1 for the station.
  // - violations: observatory tiles covered by a live source.
  function evaluate(grid, towers, reachCache) {
    const reach = towers.map((t, i) => (reachCache && reachCache[i]) || towerReach(grid, t[0], t[1], t[2]));
    const st = grid.station;
    const stReach = st ? towerReach(grid, st[0], st[1]) : null;
    const n = towers.length;
    const live = new Array(n).fill(!st);
    const parent = new Array(n).fill(null);
    const depth = new Array(n).fill(st ? -1 : 0);
    if (st) {
      const linked = (ra, a, rb, b) => ra.set.has(key(b[0], b[1])) || rb.set.has(key(a[0], a[1]));
      let frontier = [];
      towers.forEach((t, i) => {
        if (linked(stReach, st, reach[i], t)) { live[i] = true; parent[i] = -1; depth[i] = 1; frontier.push(i); }
      });
      let d = 1;
      while (frontier.length) {
        const next = [];
        d++;
        for (const a of frontier) {
          towers.forEach((t, j) => {
            if (live[j] || !linked(reach[a], towers[a], reach[j], t)) return;
            live[j] = true; parent[j] = a; depth[j] = d; next.push(j);
          });
        }
        frontier = next;
      }
    }
    const sources = [];
    if (st) sources.push({ id: -1, x: st[0], y: st[1], reach: stReach });
    towers.forEach((t, i) => { if (live[i]) sources.push({ id: i, x: t[0], y: t[1], reach: reach[i] }); });

    const tg = targets(grid);
    const connections = new Map();
    let lit = 0;
    for (const { x, y, need } of tg) {
      const list = sources.filter((s) => s.reach.set.has(key(x, y)))
        .map((s) => ({ id: s.id, d: (s.x - x) ** 2 + (s.y - y) ** 2 }))
        .sort((a, b) => a.d - b.d || a.id - b.id)
        .map((s) => s.id);
      if (list.length) connections.set(key(x, y), list);
      if (list.length >= need) lit++;
    }
    const violations = grid.quiet.filter(([x, y]) => sources.some((s) => s.reach.set.has(key(x, y))));
    const litPanels = new Set();
    for (const s of sources) for (const b of s.reach.bounces) litPanels.add(key(b.panel[0], b.panel[1]));
    return {
      reach, stationReach: stReach, live, parent, depth, connections, lit, total: tg.length,
      violations, litPanels, solved: lit === tg.length && violations.length === 0,
    };
  }

  // Map of target key -> list of live sources that cover it (see evaluate).
  function connections(grid, towers) {
    return evaluate(grid, towers).connections;
  }

  function isSolved(grid, towers) {
    return evaluate(grid, towers).solved;
  }

  // ---------- Solver ----------
  // Exhaustive search for every tower set of the smallest size that wins.
  // budget = { towers, dishes }: per-type limits (towers = standard masts).
  //
  // Without a station it branches on the first target still short of
  // signal and tries only candidates that cover it. A candidate is a
  // (spot, type, facing). Office blocks are handled with two masks: "seen
  // once" and "seen twice".
  //
  // With a station (Relay Chain) a relay tower may light nothing, so that
  // branching alone would never pick it. The search first covers every
  // target, then grows the network: it adds only towers that link to the
  // live part, until every tower is live. A breadth-first distance bound
  // prunes branches whose dead towers are too far from the live part to
  // ever be reached with the towers left. Every minimal solution is found:
  // its covering towers are picked in the first phase and its relays in
  // the second, because a connected network always has a relay next to
  // the live part.
  function solve(grid, maxTowers = 8, maxSolutions = 500, budget = {}) {
    const mastCap = budget.towers ?? Infinity;
    const dishCap = budget.dishes ?? 0;
    const relay = !!grid.station;
    const tg = targets(grid);
    const tIndex = new Map(tg.map((t, i) => [key(t.x, t.y), i]));
    const bit = (i) => 1n << BigInt(i);
    let need1 = 0n, need2 = 0n;
    tg.forEach((t, i) => { need1 |= bit(i); if (t.need === 2) need2 |= bit(i); });
    const quiet = new Set(grid.quiet.map(([x, y]) => key(x, y)));
    const maskOf = (reach) => reach.covered.reduce((m, [x, y]) => (tIndex.has(key(x, y)) ? m | bit(tIndex.get(key(x, y))) : m), 0n);

    const spots = [];
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++) if (canPlace(grid, x, y)) spots.push([x, y]);
    const spotIndex = new Map(spots.map(([x, y], i) => [key(x, y), i]));
    const stReach = relay ? towerReach(grid, grid.station[0], grid.station[1]) : null;
    if (stReach && stReach.covered.some(([x, y]) => quiet.has(key(x, y)))) {
      return { min: null, solutions: [], capped: false, spots: spots.length, candidates: 0, nodes: 0 };
    }
    const spotMaskOf = (reach) => reach.covered.reduce((m, [x, y]) => (spotIndex.has(key(x, y)) ? m | bit(spotIndex.get(key(x, y))) : m), 0n);

    // Candidates. Facings of one dish that do exactly the same job are
    // merged, so a solution is counted once however the useless sides turn.
    const cands = [];
    spots.forEach(([x, y], si) => {
      const kinds = [];
      if (mastCap > 0) kinds.push(null);
      if (dishCap > 0) kinds.push(0, 1, 2, 3);
      const seen = new Set();
      for (const f of kinds) {
        const reach = towerReach(grid, x, y, f);
        if (reach.covered.some(([cx, cy]) => quiet.has(key(cx, cy)))) continue;
        const mask = maskOf(reach);
        const spotMask = relay ? spotMaskOf(reach) : 0n;
        const coversStation = relay && reach.set.has(key(grid.station[0], grid.station[1]));
        if (!relay && mask === 0n) continue;
        const sig = `${f === null ? 'm' : 'd'}|${mask}|${spotMask}|${coversStation}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        cands.push({ tower: f === null ? [x, y] : [x, y, f], spot: si, dish: f !== null, mask, spotMask, coversStation });
      }
    });

    // Relay links between candidates and the station.
    const stationSpots = relay ? spotMaskOf(stReach) : 0n;
    const linkStation = (c) => c.coversStation || !!(stationSpots & bit(c.spot));
    const linkPair = (a, b) => !!(a.spotMask & bit(b.spot)) || !!(b.spotMask & bit(a.spot));
    // Spot graph for the distance bound: two spots are adjacent when some
    // candidates there could link. Optimistic, so the bound stays valid.
    let spotAdj = null, stationAdj = null;
    if (relay) {
      spotAdj = spots.map(() => new Set());
      stationAdj = new Set();
      for (const a of cands) {
        if (linkStation(a)) stationAdj.add(a.spot);
        for (let si = 0; si < spots.length; si++) {
          if (si !== a.spot && (a.spotMask & bit(si))) { spotAdj[a.spot].add(si); spotAdj[si].add(a.spot); }
        }
      }
      spotAdj = spotAdj.map((s) => [...s]);
    }

    const coverBy = tg.map((_, h) => cands.map((c, i) => i).filter((i) => cands[i].mask & bit(h)));
    const start1 = stReach ? maskOf(stReach) : 0n;

    let nodes = 0;
    for (let size = 1; size <= maxTowers; size++) {
      const found = new Map();
      const seenStates = new Set();
      let capped = false;
      const picked = [];
      const usedSpots = new Set();
      let masts = 0, dishes = 0;

      const liveSet = () => {
        const live = new Array(picked.length).fill(false);
        let frontier = [];
        picked.forEach((ci, k) => { if (linkStation(cands[ci])) { live[k] = true; frontier.push(k); } });
        while (frontier.length) {
          const next = [];
          for (const a of frontier) picked.forEach((ci, k) => {
            if (!live[k] && linkPair(cands[picked[a]], cands[ci])) { live[k] = true; next.push(k); }
          });
          frontier = next;
        }
        return live;
      };
      // Fewest extra towers needed before the farthest dead tower is live.
      // 0-1 breadth-first search: stepping onto a spot that already holds a
      // tower is free, stepping onto an empty spot costs one new tower.
      const connectBound = (live) => {
        if (live.every(Boolean)) return 0;
        const dist = new Array(spots.length).fill(Infinity);
        const deque = [];
        picked.forEach((ci, k) => { if (live[k]) { dist[cands[ci].spot] = 0; deque.push(cands[ci].spot); } });
        const cost = (si) => (usedSpots.has(si) ? 0 : 1);
        for (const si of stationAdj) {
          const d = cost(si);
          if (d < dist[si]) { dist[si] = d; d ? deque.push(si) : deque.unshift(si); }
        }
        while (deque.length) {
          const si = deque.shift();
          for (const n of spotAdj[si]) {
            const d = dist[si] + cost(n);
            if (d < dist[n]) { dist[n] = d; d === dist[si] ? deque.unshift(n) : deque.push(n); }
          }
        }
        let worst = 0;
        picked.forEach((ci, k) => { if (!live[k]) worst = Math.max(worst, dist[cands[ci].spot]); });
        return worst;
      };

      const tryPick = (ci, m1, m2) => {
        const c = cands[ci];
        if (usedSpots.has(c.spot)) return;
        if (c.dish ? dishes >= dishCap : masts >= mastCap) return;
        picked.push(ci); usedSpots.add(c.spot);
        if (c.dish) dishes++; else masts++;
        rec(m1 | c.mask, m2 | (m1 & c.mask));
        picked.pop(); usedSpots.delete(c.spot);
        if (c.dish) dishes--; else masts--;
      };

      const rec = (m1, m2) => {
        if (capped) return;
        nodes++;
        const stateKey = [...picked].sort((a, b) => a - b).join(',');
        if (seenStates.has(stateKey)) return;
        seenStates.add(stateKey);
        const deficit = (need1 & ~m1) | (need2 & ~m2);
        const left = size - picked.length;
        const live = relay ? liveSet() : null;
        if (deficit === 0n && (!relay || live.every(Boolean))) {
          if (!found.has(stateKey)) found.set(stateKey, picked.map((ci) => cands[ci].tower).sort((a, b) => a[1] - b[1] || a[0] - b[0]));
          if (found.size >= maxSolutions) capped = true;
          return;
        }
        if (left === 0) return;
        if (relay && connectBound(live) > left) return;
        if (deficit) {
          let h = 0;
          while (!(deficit & bit(h))) h++;
          // An office block seen by nobody yet needs two more towers.
          if ((need2 & bit(h)) && !(m1 & bit(h)) && left < 2) return;
          for (const ci of coverBy[h]) tryPick(ci, m1, m2);
          return;
        }
        // Every target is covered; grow the network from its live part.
        for (let ci = 0; ci < cands.length; ci++) {
          const c = cands[ci];
          if (usedSpots.has(c.spot)) continue;
          if (linkStation(c) || picked.some((pi, k) => live[k] && linkPair(cands[pi], c))) tryPick(ci, m1, m2);
        }
      };
      rec(start1, 0n);
      if (found.size) {
        return { min: size, solutions: [...found.values()], capped, spots: spots.length, candidates: cands.length, nodes };
      }
    }
    return { min: null, solutions: [], capped: false, spots: spots.length, candidates: cands.length, nodes };
  }

  const api = { TILE, HILL_BONUS, DISH_BONUS, FACINGS, parseLevel, tileAt, canPlace, onHill, towerRadius, blocks,
    isPanel, isDish, inCone, clearPath, hasLineOfSight, towerReach, houses, targets, evaluate, connections,
    isSolved, solve };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SignalLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
