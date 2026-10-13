// Level design helper: searches random maps for tight puzzles.
// Usage: node tools/generate.js <w> <h> <radius> <towers> <houses> <walls> <hillClusters> <trees> <maxSolutions> <seed> [count] [needHill: 0 off, 1 every solution builds on a hill, 2 hills must block]
// Prints candidate maps; copy good ones into tools/levels-src.js.
const L = require('../js/logic.js');
if (process.argv.length < 12) {
  console.log('Usage: node tools/generate.js <w> <h> <radius> <towers> <houses> <walls> <hillClusters> <trees> <maxSolutions> <seed> [count] [needHill]');
  console.log('Example: node tools/generate.js 9 9 2 4 10 7 3 6 2 82 2 1');
  process.exit(0);
}
const [W, H, radius, towers, nHouses, nWalls, nHills, nTrees, maxSol, seed0, count = 3, needHill = 1] =
  process.argv.slice(2).map(Number);

let seed = seed0 >>> 0;
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
  for (let s = 0; s < nWalls; s++) {
    let x = ri(W), y = ri(H), horiz = rnd() < 0.5;
    const len = 2 + ri(3);
    for (let i = 0; i < len; i++) {
      if (free(x, y)) g[y][x] = '#';
      if (i === 1 && rnd() < 0.25) horiz = !horiz; // occasional L-shape
      horiz ? x++ : y++;
    }
  }
  for (let c = 0; c < nHills; c++) {
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
      if (free(x, y)) { g[y][x] = ch; c++; }
    }
  };
  scatter('H', nHouses);
  scatter('T', nTrees);
  return g.map((r) => r.join(''));
}

const swap = (map, from, to) => map.map((r) => r.split(from).join(to));
const minOf = (map) => L.solve(L.parseLevel({ name: 'x', radius, map }), towers, 1).min;

let shown = 0;
for (let tries = 0; tries < 300000 && shown < count; tries++) {
  const map = makeMap();
  const grid = L.parseLevel({ name: 'x', radius, map });
  const res = L.solve(grid, towers, maxSol + 1);
  if (res.min !== towers || res.solutions.length > maxSol) continue;
  // Walls must matter: treating them as trees (no blocking) makes it easier.
  const noWalls = !nWalls ? null : L.solve(L.parseLevel({ name: 'x', radius, map: swap(map, '#', 'T') }), towers, maxSol * 3);
  if (nWalls && noWalls.min === towers && noWalls.solutions.length <= res.solutions.length * 2) continue;
  if (needHill === 2) {
    // Hills must matter as blockers: flattening them to trees makes it easier.
    const flat = L.solve(L.parseLevel({ name: 'x', radius, map: swap(map, '^', 'T') }), towers, maxSol * 3);
    if (flat.min === towers && flat.solutions.length <= res.solutions.length * 2) continue;
  } else if (needHill === 1) {
    const usesHill = res.solutions.every((s) => s.some(([x, y]) => L.onHill(grid, x, y)));
    if (!usesHill) continue;
  }
  shown++;
  console.log(`--- min ${res.min}, ${res.solutions.length} solution(s), houses ${L.houses(grid).length}`);
  console.log(map.map((r) => `      '${r}',`).join('\n'));
}
if (!shown) console.log('nothing found');
