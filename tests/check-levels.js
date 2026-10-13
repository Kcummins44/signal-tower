// Brute-force check: every level is solvable with its tower budget,
// and reports the fewest towers that solve it. Run: node tests/check-levels.js
const L = require('../logic.js');
const LEVELS = require('../levels.js');

function combos(items, k, start = 0, acc = [], out = (c) => {}) {
  if (acc.length === k) return out(acc);
  for (let i = start; i < items.length; i++) {
    acc.push(items[i]);
    if (combos(items, k, i + 1, acc, out) === true) return true;
    acc.pop();
  }
}

let ok = true;
LEVELS.forEach((level, i) => {
  const grid = L.parseLevel(level);
  const spots = [];
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) if (L.canPlace(grid, x, y)) spots.push([x, y]);
  // Precompute house coverage per spot as bitmasks for speed.
  const hs = L.houses(grid);
  const idx = new Map(hs.map(([x, y], j) => [x + ',' + y, j]));
  const full = (1 << hs.length) - 1;
  const masks = spots.map(([x, y]) =>
    L.towerCoverage(grid, x, y).reduce((m, [cx, cy]) =>
      idx.has(cx + ',' + cy) ? m | (1 << idx.get(cx + ',' + cy)) : m, 0));
  const ids = spots.map((_, j) => j);
  let min = null, count = 0;
  for (let k = 1; k <= level.towers && min === null; k++) {
    combos(ids, k, 0, [], (c) => {
      if ((c.reduce((m, j) => m | masks[j], 0)) === full) {
        if (min === null) min = k;
        count++;
      }
    });
  }
  const solved = min !== null;
  if (!solved || min < level.towers) ok = false;
  console.log(`Level ${i + 1} "${level.name}": budget ${level.towers}, ` +
    (solved ? `min ${min}, ${count} solution(s) at min` : 'UNSOLVABLE'));
});
process.exit(ok ? 0 : 1);
