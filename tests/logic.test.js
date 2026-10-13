// Unit tests for the rules in js/logic.js. Run: node tests/logic.test.js
const L = require('../js/logic.js');
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const grid = (map, radius = 2) => L.parseLevel({ name: 't', radius, map });
const covers = (g, t, x, y) => L.towerReach(g, t[0], t[1], t[2]).set.has(x + ',' + y);

// ---------- Classic rules still hold ----------
{
  const g = grid(['.....', '..#..', '.....']);
  check(!covers(g, [2, 0], 2, 2), 'wall blocks straight down');
  check(covers(g, [0, 0], 0, 2), 'open column is covered');
  const h = grid(['^.^..', '.....']);
  check(L.towerRadius(h, 0, 0) === 3, 'hill tower gets +1 range');
}

// ---------- Quiet Zones ----------
{
  const g = grid(['H.Q', '...']);
  check(!L.isSolved(g, [[1, 1]]), 'quiet: covering the observatory fails the level');
  const s = grid(['H#Q', '.#.']);
  check(L.isSolved(s, [[0, 1]]), 'quiet: a wall shields the observatory');
  const e = L.evaluate(g, [[1, 1]]);
  check(e.violations.length === 1 && e.lit === 1, 'quiet: violation is reported while the house is lit');
  check(L.canPlace(g, 2, 0) === false, 'quiet: no tower on an observatory');
  check(covers(grid(['.QH']), [0, 0], 2, 0), 'quiet: observatory does not block signal');
}

// ---------- Busy Buildings ----------
{
  const g = grid(['.B.', '...']);
  check(!L.isSolved(g, [[0, 0]]), 'busy: one tower is not enough');
  check(L.isSolved(g, [[0, 0], [2, 0]]), 'busy: two towers light it');
  const e = L.evaluate(g, [[0, 0], [2, 1]]);
  check(e.connections.get('1,0').length === 2, 'busy: connections list both towers');
  check(L.targets(g)[0].need === 2, 'busy: needs two');
  const r = L.solve(g, 4, 50);
  check(r.min === 2, `busy: solver needs 2 towers (got ${r.min})`);
}

// ---------- Dish Towers ----------
{
  const g = grid(['.......', '.......', '.......', '.......', '.......']);
  const d = [2, 2, 1]; // facing east
  check(L.towerRadius(g, 2, 2, 1) === 4, 'dish: reach is radius + 2');
  check(covers(g, d, 6, 2), 'dish east: covers 4 tiles east');
  check(covers(g, d, 4, 4), 'dish east: 45 degree edge counts');
  check(!covers(g, d, 2, 0), 'dish east: nothing north');
  check(!covers(g, d, 1, 2), 'dish east: nothing behind');
  check(covers(g, [2, 2, 0], 2, 0) && !covers(g, [2, 2, 0], 2, 4), 'dish north covers north only');
  const lv = { name: 't', radius: 1, map: ['H.....H'] };
  const r = L.solve(L.parseLevel(lv), 4, 50, { towers: 0, dishes: 2 });
  check(r.min === 2, `dish: solver uses two dishes (got ${r.min})`);
  const one = L.solve(L.parseLevel({ name: 't', radius: 1, map: ['.....H'] }), 4, 50, { towers: 0, dishes: 1 });
  check(one.min === 1 && one.solutions[0][0].length === 3, 'dish: solutions carry the facing');
}

// ---------- Relay Chain ----------
{
  // Station at the left, house far right; the middle tower is a pure relay.
  const g = grid(['S......H']);
  check(!L.evaluate(g, [[6, 0]]).live[0], 'relay: a tower out of reach of the station is dead');
  check(!L.isSolved(g, [[6, 0]]), 'relay: dead towers light nothing');
  const e = L.evaluate(g, [[2, 0], [4, 0], [6, 0]]);
  check(e.live.every(Boolean) && e.parent[2] === 1 && e.depth[2] === 3, 'relay: a chain carries power');
  check(L.isSolved(g, [[2, 0], [4, 0], [6, 0]]), 'relay: chain lights the house');
  const r = L.solve(g, 6, 50);
  check(r.min === 3, `relay: solver finds the 3-tower chain (got ${r.min})`);
  // Two-way: a hill tower reaches the station, the station cannot reach it.
  const h = grid(['S..^...H']);
  const ev = L.evaluate(h, [[3, 0]]);
  check(!L.towerReach(h, 0, 0).set.has('3,0') && L.towerReach(h, 3, 0).set.has('0,0'), 'relay: one-sided reach set up');
  check(ev.live[0], 'relay: links are two-way (hill tower is live)');
  // Station lights houses itself.
  check(L.isSolved(grid(['SH']), []), 'relay: the station lights nearby houses');
}

// ---------- Reflector Panels ----------
{
  // "/" panel at (2,1). A tower right below it at (2,2) bounces east.
  const g = grid(['.....', '../..', '.....']);
  check(L.blocks(g, 2, 1, true), 'panel blocks direct signal, even from a hill');
  const reach = L.towerReach(g, 2, 2);
  check(reach.bounces.length === 1, 'panel: one bounce found');
  check(reach.set.has('3,1'), 'panel: signal going up bounces east');
  check(!reach.direct.some(([x, y]) => x === 2 && y === 0), 'panel: tile behind the panel is not covered directly');
  const b = reach.bounces[0];
  check(Math.abs(b.image[0] - 1) < 1e-9 && Math.abs(b.image[1] - 1) < 1e-9, 'panel: image point is the mirrored tower');
  // Whole-path range: tower 2 below the panel reaches nothing past it at radius 2.
  const far = L.towerReach(grid(['.....', '../..', '.....', '.....']), 2, 3);
  check(!far.bounces.some((x) => x.tiles.some(([tx, ty]) => ty === 1 && tx >= 3)), 'panel: range counts the whole bounced path');
  const far3 = L.towerReach(grid(['.....', '../..', '.....', '.....'], 3), 2, 3);
  const ft = far3.bounces[0].tiles.map(String);
  check(ft.includes('3,1') && !ft.includes('4,1'), 'panel: radius 3 from 2 tiles away bounces 1 tile past');
  // "L" mirrors the other way: signal going up bounces west.
  const gl = grid(['.....', '..L..', '.....']);
  const lt = L.towerReach(gl, 2, 2).bounces[0].tiles.map(String);
  check(lt.includes('1,1') && !lt.includes('3,1'), 'panel L: signal going up bounces west');
  // A wall on the second leg stops the bounce.
  const gw = grid(['.....', '../#.', '.....'], 3);
  check(!L.towerReach(gw, 2, 2).set.has('4,1'), 'panel: wall after the bounce blocks it');
  // A wall on the first leg stops it too.
  const gw2 = grid(['.....', '../..', '..#..', '.....'], 3);
  check(L.towerReach(gw2, 2, 3).bounces.length === 0, 'panel: wall before the bounce blocks it');
  // A sealed pocket reached only by the bounce: solver uses it.
  const pg = grid(['.##.', './H#', '..##']);
  const ps = L.solve(pg, 3, 10);
  check(ps.min === 1 && ps.solutions.length === 1 && String(ps.solutions[0][0]) === '1,2', 'panel: sealed pocket is lit only by the bounce');
  check(!L.towerReach(pg, 1, 2).direct.some(([x, y]) => x === 2 && y === 1), 'panel: the pocket house is not in direct view');
  // Dish bounce: the slab hit point must be inside the cone.
  check(!L.towerReach(g, 2, 2, 2).bounces.some((x) => x.tiles.length), 'panel: a dish facing away does not bounce');
  check(L.towerReach(g, 2, 2, 0).set.has('3,1'), 'panel: a dish facing the panel bounces');
}

// ---------- Mixed ----------
{
  const g = grid(['S.B..', '.....', '..Q#H'], 2);
  const r = L.solve(g, 6, 50);
  check(r.min !== null && r.solutions.every((s) => L.isSolved(g, s)), `mixed: every solver solution wins (min ${r.min})`);
}

console.log(failures ? `${failures} FAILED` : 'ALL LOGIC TESTS PASSED');
process.exit(failures ? 1 : 0);
