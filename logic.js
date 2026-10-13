// Pure game rules, shared by the browser game and tests/check-levels.js.
(function (root) {
  const TILE = { EMPTY: '.', HOUSE: 'H', WALL: '#', HILL: '^' };
  const HILL_BONUS = 1;

  function parseLevel(level) {
    const rows = level.map.map((row) => row.split(''));
    return { ...level, rows, height: rows.length, width: rows[0].length };
  }

  function tileAt(grid, x, y) {
    return grid.rows[y][x];
  }

  function canPlace(grid, x, y) {
    const t = tileAt(grid, x, y);
    return t === TILE.EMPTY || t === TILE.HILL;
  }

  function towerRadius(grid, x, y) {
    return grid.radius + (tileAt(grid, x, y) === TILE.HILL ? HILL_BONUS : 0);
  }

  // Walk the line between cell centres in small steps; any wall cell
  // the line passes through (other than the endpoints) blocks signal.
  function hasLineOfSight(grid, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.ceil(Math.hypot(dx, dy) * 20);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.round(x0 + dx * t);
      const cy = Math.round(y0 + dy * t);
      if ((cx === x0 && cy === y0) || (cx === x1 && cy === y1)) continue;
      if (tileAt(grid, cx, cy) === TILE.WALL) return false;
    }
    return true;
  }

  // Cells reached by a single tower at (tx, ty).
  function towerCoverage(grid, tx, ty) {
    const r = towerRadius(grid, tx, ty);
    const cells = [];
    for (let y = Math.max(0, ty - r); y <= Math.min(grid.height - 1, ty + r); y++) {
      for (let x = Math.max(0, tx - r); x <= Math.min(grid.width - 1, tx + r); x++) {
        const d2 = (x - tx) ** 2 + (y - ty) ** 2;
        if (d2 > r * r) continue;
        if (tileAt(grid, x, y) === TILE.WALL) continue;
        if (hasLineOfSight(grid, tx, ty, x, y)) cells.push([x, y]);
      }
    }
    return cells;
  }

  // Returns a Set of "x,y" keys covered by any tower.
  function coveredCells(grid, towers) {
    const covered = new Set();
    for (const [tx, ty] of towers) {
      for (const [x, y] of towerCoverage(grid, tx, ty)) covered.add(x + ',' + y);
    }
    return covered;
  }

  function houses(grid) {
    const list = [];
    grid.rows.forEach((row, y) =>
      row.forEach((t, x) => { if (t === TILE.HOUSE) list.push([x, y]); })
    );
    return list;
  }

  function isSolved(grid, towers) {
    const covered = coveredCells(grid, towers);
    return houses(grid).every(([x, y]) => covered.has(x + ',' + y));
  }

  const api = { TILE, HILL_BONUS, parseLevel, tileAt, canPlace, towerRadius,
    hasLineOfSight, towerCoverage, coveredCells, houses, isSolved };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SignalLogic = api;
})(this);
