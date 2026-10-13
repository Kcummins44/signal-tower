// Level design helper: searches random maps for tight puzzles.
// Usage: node tools/generate.js --w 7 --h 7 --radius 2 --towers 3 --houses 6 [options]
//   --walls n --hills n --trees n   terrain amounts (wall runs, hill clusters, trees)
//   --quiet n      observatories (Q). Each one must change the puzzle.
//   --busy n       office blocks (B). They must make it harder than houses.
//   --dishes n     dishes offered. Without them the level must need more towers.
//   --station      add a relay station (S). Some solution must need a pure relay tower.
//   --panels n     reflector panels (/ and L). Every solution must use a bounce.
//   --maxsol n     most solutions allowed (default 2)
//   --seed n --count n --tries n
//   --needhill 0|1|2   0 off, 1 every solution builds on a hill, 2 hills must block
// Prints candidate maps; copy good ones into tools/levels-src.js, then run
// node tools/solve.js. The old positional form still works:
//   node tools/generate.js <w> <h> <radius> <towers> <houses> <walls> <hillClusters> <trees> <maxSolutions> <seed> [count] [needHill]
const L = require('../js/logic.js');

const argv = process.argv.slice(2);
const opt = { w: 7, h: 7, radius: 2, towers: 3, houses: 6, walls: 3, hills: 2, trees: 3, maxsol: 2, seed: 1, count: 3,
  needhill: 0, quiet: 0, busy: 0, dishes: 0, station: false, panels: 0, tries: 200000 };
if (!argv.length) {
  console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(1, 15).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
if (/^\d/.test(argv[0])) {
  const names = ['w', 'h', 'radius', 'towers', 'houses', 'walls', 'hills', 'trees', 'maxsol', 'seed', 'count', 'needhill'];
  argv.forEach((v, i) => { opt[names[i]] = Number(v); });
  if (argv.length < 12) opt.needhill = 1;
} else {
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (k === 'station') opt.station = true;
    else opt[k] = Number(argv[++i]);
  }
}
const { w: W, h: H, radius, towers } = opt;

let seed = opt.seed >>> 0;
function rnd() { // mulberry32
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (n) => Math.floor(rnd() * n);

function makeMap() {
  const g = Array.from({ length: H }, () => Array(W).fill('.'));
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y][x] === '.';
  for (let s = 0; s < opt.walls; s++) {
    let x = ri(W), y = ri(H), horiz = rnd() < 0.5;
    const len = 2 + ri(3);
    for (let i = 0; i < len; i++) {
      if (free(x, y)) g[y][x] = '#';
      if (i === 1 && rnd() < 0.25) horiz = !horiz; // occasional L-shape
      horiz ? x++ : y++;
    }
  }
  for (let c = 0; c < opt.hills; c++) {
    let x = ri(W), y = ri(H);
    const size = 1 + ri(3);
    for (let i = 0; i < size; i++) {
      if (free(x, y)) g[y][x] = '^';
      rnd() < 0.5 ? (x += 1) : (y += 1);
    }
  }
  const scatter = (ch, n) => {
    for (let c = 0, guard = 0; c < n && guard < 999; guard++) {
      const x = ri(W), y = ri(H);
      if (free(x, y)) { g[y][x] = typeof ch === 'function' ? ch() : ch; c++; }
    }
  };
  if (opt.station) {
    // Stations sit on the board edge so the chain has somewhere to go.
    for (let guard = 0; guard < 99; guard++) {
      const side = ri(4);
      const x = side === 0 ? 0 : side === 1 ? W - 1 : ri(W), y = side === 2 ? 0 : side === 3 ? H - 1 : ri(H);
      if (free(x, y)) { g[y][x] = 'S'; break; }
    }
  }
  scatter(() => (rnd() < 0.5 ? '/' : 'L'), opt.panels);
  scatter('Q', opt.quiet);
  scatter('B', opt.busy);
  scatter('H', opt.houses);
  scatter('T', opt.trees);
  return g.map((r) => r.join(''));
}

const swap = (map, from, to) => map.map((r) => r.split(from).join(to));
const budget = opt.dishes ? { towers: towers - opt.dishes, dishes: opt.dishes } : {};
const solveMap = (map, max, b = budget) => L.solve(L.parseLevel({ name: 'x', radius, map }), towers + 1, max, b);
// "Easier": fewer towers, or many more solutions.
const easier = (other, res) => other.min !== null && (other.min < res.min || (other.min === res.min && other.solutions.length > res.solutions.length * 2));

let shown = 0;
for (let tries = 0; tries < opt.tries && shown < opt.count; tries++) {
  const map = makeMap();
  const grid = L.parseLevel({ name: 'x', radius, map });
  if (!L.targets(grid).length) continue;
  const res = solveMap(map, opt.maxsol + 1);
  if (res.min !== towers || res.solutions.length > opt.maxsol) continue;
  // The station alone must not light everything nearby for free.
  if (grid.station && L.evaluate(grid, []).lit > 1) continue;
  if (opt.walls && !easier(solveMap(swap(map, '#', 'T'), opt.maxsol * 3), res)) continue;
  if (opt.needhill === 2 && !easier(solveMap(swap(map, '^', 'T'), opt.maxsol * 3), res)) continue;
  if (opt.needhill === 1 && !res.solutions.every((s) => s.some(([x, y]) => L.onHill(grid, x, y)))) continue;
  // Each mechanic must matter.
  if (opt.quiet && !easier(solveMap(swap(map, 'Q', 'T'), opt.maxsol * 3), res)) continue;
  if (opt.busy && !easier(solveMap(swap(map, 'B', 'H'), opt.maxsol * 3), res)) continue;
  if (opt.dishes) {
    const masts = solveMap(map, 1, { towers: towers + 1, dishes: 0 });
    if (masts.min !== null && masts.min <= towers) continue;
    if (!res.solutions.every((s) => s.filter((t) => t.length > 2).length === opt.dishes)) continue;
  }
  if (opt.station) {
    const relayOnly = (s) => s.some((t) => {
      const r = L.towerReach(grid, t[0], t[1], t[2]);
      return !L.targets(grid).some(({ x, y }) => r.set.has(x + ',' + y));
    });
    if (!res.solutions.every(relayOnly)) continue;
  }
  if (opt.panels) {
    const usesBounce = (s) => {
      const direct = new Set();
      if (grid.station) L.towerReach(grid, ...grid.station).direct.forEach(([x, y]) => direct.add(x + ',' + y));
      s.forEach((t) => L.towerReach(grid, t[0], t[1], t[2]).direct.forEach(([x, y]) => direct.add(x + ',' + y)));
      return L.targets(grid).some(({ x, y }) => !direct.has(x + ',' + y));
    };
    if (!res.solutions.every(usesBounce)) continue;
  }
  shown++;
  console.log(`--- min ${res.min}, ${res.solutions.length} solution(s), targets ${L.targets(grid).length}, try ${tries}`);
  console.log(map.map((r) => `      '${r}',`).join('\n'));
  console.log('    ' + JSON.stringify(res.solutions[0]));
}
if (!shown) console.log('nothing found');
