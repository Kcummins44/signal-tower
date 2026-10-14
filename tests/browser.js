// End-to-end browser test. Plays every level to 3 stars with the solver's
// solutions (towers dragged from the tray and tapped, dishes turned by
// tapping), tests tray drag and drop with mouse and touch (place, move,
// remove, cancel), long press, hold to place, the keyboard, undo, reset,
// locking, saving and sound, measures frame time, and saves screenshots.
// See README for how to run it.
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'test-results';
require('fs').mkdirSync(OUT, { recursive: true });
const URL = process.env.GAME_URL || 'http://127.0.0.1:8765/index.html';
const errors = [];
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// Pages start with story scenes off (a test-only flag the game reads for
// saves without a story setting), except where a test passes { story: true }.
async function open(browser, name, opts, { story = false } = {}) {
  const ctx = await browser.newContext(opts);
  if (!story) await ctx.addInitScript(() => { window.__signalStoryOff = true; });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(`[${name}] ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  // Wait for the game itself rather than the load event.
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__signalTest && window.__signalPerf.frames > 5);
  await page.waitForTimeout(200);
  return { ctx, page };
}
const tile = (page, x, y) => page.evaluate(([x, y]) => {
  const b = window.__signalTest.board, r = document.getElementById('board').getBoundingClientRect();
  return { x: r.left + b.ox + (x + 0.5) * b.tile, y: r.top + b.oy + (y + 0.5) * b.tile, size: b.tile };
}, [x, y]);
const chip = (page, type) => page.evaluate((type) => {
  const r = document.querySelector(`.chip[data-type="${type}"]`).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, type);
const st = (page) => page.evaluate(() => {
  const s = window.__signalTest.state;
  return s && { index: s.index, towers: s.towers.map((t) => t.slice()), n: s.towers.length, moves: s.moves, won: s.won, selected: s.selected, history: s.history.length };
});
const left = (page, type) => page.evaluate((type) => document.querySelector(`.chip[data-type="${type}"] .chip-badge`).textContent, type);
const typeOf = (t) => (t.length > 2 ? 'dish' : 'mast');

async function mouseDrag(page, from, to, { drop = true, steps = 10 } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y - 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.waitForTimeout(60);
  if (drop) { await page.mouse.up(); await page.waitForTimeout(60); }
}

// Touch drags go through CDP so Chrome fires real touch pointer events.
async function touch(cdp, type, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}
async function touchDrag(page, cdp, from, to, { hold = 0, drop = true } = {}) {
  await touch(cdp, 'touchStart', from.x, from.y);
  if (hold) await page.waitForTimeout(hold);
  const n = 10;
  for (let i = 1; i <= n; i++) await touch(cdp, 'touchMove', from.x + (to.x - from.x) * i / n, from.y + (to.y - from.y) * i / n);
  await page.waitForTimeout(80);
  if (drop) { await touch(cdp, 'touchEnd', to.x, to.y); await page.waitForTimeout(80); }
}
// Touch drops land on the tile under the finger (the ghost floats above it).

// Play the current level with the mouse: even towers dragged from the
// tray, odd towers tapped; dishes then turned by tapping.
async function playLevel(page, sol, useDrag = true) {
  for (let k = 0; k < sol.length; k++) {
    const t = sol[k];
    const p = await tile(page, t[0], t[1]);
    if (useDrag && k % 2 === 0) {
      await mouseDrag(page, await chip(page, typeOf(t)), p);
    } else {
      if ((await st(page)).selected !== typeOf(t)) await page.click(`.chip[data-type="${typeOf(t)}"]`);
      await page.mouse.click(p.x, p.y);
    }
    for (let f = 0; f < (t[2] || 0); f++) { await page.mouse.click(p.x, p.y); await page.waitForTimeout(30); }
    await page.waitForTimeout(40);
  }
}

(async () => {
  const browser = await chromium.launch();

  // ---------- Desktop: whole game with the mouse ----------
  const { page: d } = await open(browser, 'desktop', { viewport: { width: 1280, height: 800 } });
  const N = await d.evaluate(() => LEVELS.length);
  check(await d.locator('#title-progress').isHidden() && (await d.textContent('#title-play-label')) === 'Play' && (await d.textContent('#title-play-sub')) === 'Level 1, First Light',
    'fresh save: title says Play, Level 1, First Light, with no progress strip');
  await d.screenshot({ path: `${OUT}/title-fresh-desktop.png` });
  await d.click('#title-levels');
  await d.waitForTimeout(300);
  check(await d.locator('.map-node[data-level="1"].locked').count() === 1 && await d.locator('.map-node[data-level="0"].current').count() === 1, 'fresh save: level 1 is current and level 2 locked on the map');
  check((await d.locator('.map-banner').count()) === 7, `level map shows 7 chapter banners (${await d.locator('.map-banner').count()})`);
  check((await d.locator('.map-banner.locked').count()) === 6, 'fresh save: chapters 2 to 7 are locked');
  await d.click('.map-node[data-level="1"]', { force: true }); // aria-disabled, still tappable
  await d.waitForTimeout(150);
  check(!(await d.locator('#screen-levels').isHidden()) && (await d.textContent('#map-toast')) === 'Finish level 1 first.', 'tapping a locked node stays on the map and says "Finish level 1 first."');
  await d.screenshot({ path: `${OUT}/levels-fresh.png` });
  await d.click('#levels-back');
  await d.click('#title-play');
  await d.waitForTimeout(320); // board input waits 300ms after a screen change
  // Undo and reset on level 1.
  let p = await tile(d, 0, 1); await d.mouse.click(p.x, p.y);
  await d.click('#undo-btn');
  let s = await st(d);
  check(s.n === 0 && s.moves === 2, `undo removes the tower and counts a move (towers ${s.n}, moves ${s.moves})`);
  p = await tile(d, 2, 0); await d.mouse.click(p.x, p.y);   // house: invalid
  s = await st(d);
  check(s.n === 0 && s.moves === 2, 'tapping a house does nothing');
  await d.click('#reset-btn');
  s = await st(d);
  check(s.moves === 0 && s.n === 0, 'reset clears towers and moves');

  // ---------- Tray drag with the mouse (level 2: two towers) ----------
  await d.evaluate(() => window.__signalTest.startLevel(1));
  await d.waitForTimeout(200);
  const tw = await chip(d, 'mast');
  // Mid-drag screenshot over a valid tile.
  await mouseDrag(d, tw, await tile(d, 1, 2), { drop: false });
  const mid = await d.evaluate(() => window.__signalTest.drag);
  check(mid && mid.source === 'tray' && mid.valid && mid.target.join() === '1,2', 'mouse drag from the tray targets the tile under the cursor');
  check((await left(d, 'mast')) === '1', 'tray badge drops by one while a tower is held');
  await d.screenshot({ path: `${OUT}/drag-desktop.png` });
  await d.mouse.up(); await d.waitForTimeout(100);
  s = await st(d);
  check(s.n === 1 && s.moves === 1 && s.towers[0].join() === '1,2', 'mouse drop places the tower (1 move)');
  // Drop on a house: cancelled, no move.
  await mouseDrag(d, tw, await tile(d, 1, 0));
  s = await st(d);
  check(s.n === 1 && s.moves === 1 && (await left(d, 'mast')) === '1', 'drop on a house cancels with no move');
  // Drop back on the tray: cancelled.
  await mouseDrag(d, tw, { x: tw.x + 20, y: tw.y - 4 });
  s = await st(d);
  check(s.n === 1 && s.moves === 1, 'drop back on the tray cancels');
  // Move a placed tower.
  await mouseDrag(d, await tile(d, 1, 2), await tile(d, 0, 2));
  s = await st(d);
  check(s.n === 1 && s.moves === 2 && s.towers[0].join() === '0,2', 'dragging a placed tower moves it (1 move)');
  // Drop on its own tile: nothing.
  await mouseDrag(d, await tile(d, 0, 2), await tile(d, 0, 2), { steps: 3 });
  s = await st(d);
  check(s.moves === 2 && s.towers[0].join() === '0,2', 'dropping a tower on its own tile does nothing');
  // Moving onto an occupied or invalid tile flies back.
  await mouseDrag(d, await tile(d, 0, 2), await tile(d, 3, 0));
  s = await st(d);
  check(s.moves === 2 && s.towers[0].join() === '0,2', 'moving onto a wall is refused with no move');
  // Undo the move.
  await d.click('#undo-btn');
  s = await st(d);
  check(s.towers[0].join() === '1,2' && s.moves === 3, 'undo puts a moved tower back');
  // Mid-drag of a placed tower: the tray offers removal.
  await mouseDrag(d, await tile(d, 1, 2), { x: tw.x, y: tw.y }, { drop: false });
  check(await d.locator('#tray.removing.drop').count() === 1, 'dragging a placed tower over the tray shows "Drop here to remove"');
  await d.screenshot({ path: `${OUT}/drag-remove-desktop.png` });
  await d.mouse.up(); await d.waitForTimeout(100);
  s = await st(d);
  check(s.n === 0 && s.moves === 4 && (await left(d, 'mast')) === '2', 'dropping a placed tower on the tray removes it (1 move)');
  // Escape cancels a drag.
  await mouseDrag(d, tw, await tile(d, 1, 2), { drop: false });
  await d.keyboard.press('Escape');
  await d.mouse.up(); await d.waitForTimeout(100);
  s = await st(d);
  check(s.n === 0 && s.moves === 4, 'Escape cancels a drag');

  // ---------- Dish turning (level 24: dish only) ----------
  await d.evaluate(() => window.__signalTest.startLevel(23));
  await d.waitForTimeout(200);
  check(await d.locator('.chip').count() === 1 && (await d.getAttribute('.chip', 'data-type')) === 'dish', 'dish-only level shows just the Dish chip');
  await mouseDrag(d, await chip(d, 'dish'), await tile(d, 0, 0));
  s = await st(d);
  check(s.n === 1 && s.towers[0][2] === 0 && s.moves === 1, 'a dragged dish lands facing north (1 move)');
  p = await tile(d, 0, 0);
  for (let i = 0; i < 3; i++) await d.mouse.click(p.x, p.y);
  s = await st(d);
  check(s.towers[0][2] === 3 && s.moves === 1, `tapping a dish turns it and is free (facing ${s.towers[0][2]}, moves ${s.moves})`);
  await d.click('#undo-btn');
  s = await st(d);
  check(s.towers[0][2] === 2 && s.moves === 1, 'undoing a turn is free too');
  await d.mouse.move(p.x, p.y); await d.waitForTimeout(250);
  await d.screenshot({ path: `${OUT}/dish-hover-desktop.png` });
  // Keyboard: Delete removes, 2 selects the dish, arrows + Enter place and turn, M moves.
  await d.keyboard.press('ArrowLeft'); // cursor starts mid-board; walk it to (0,0)
  for (let i = 0; i < 4; i++) await d.keyboard.press('ArrowLeft');
  for (let i = 0; i < 3; i++) await d.keyboard.press('ArrowUp');
  await d.keyboard.press('Delete');
  s = await st(d);
  check(s.n === 0 && s.moves === 2, 'Delete removes the tower under the cursor');
  await d.keyboard.press('2');
  await d.keyboard.press('Enter');
  await d.keyboard.press('Enter');
  s = await st(d);
  check(s.n === 1 && s.towers[0][2] === 1 && s.moves === 3, 'keyboard: Enter places a dish, Enter again turns it for free');
  await d.keyboard.press('m');
  await d.keyboard.press('ArrowDown'); await d.keyboard.press('ArrowRight');
  await d.keyboard.press('Enter');
  s = await st(d);
  check(s.towers[0].join() === '1,1,1' && s.moves === 4, `keyboard: M picks up, Enter drops (moved to ${s.towers[0].join()})`);

  // ---------- Every level, to 3 stars ----------
  await d.evaluate(() => window.__signalTest.startLevel(0));
  await d.waitForTimeout(200);
  for (let i = 0; i < N; i++) {
    const sol = await d.evaluate(() => window.__signalTest.state.level.solutions[0]);
    await playLevel(d, sol);
    await d.waitForSelector('#screen-win:not([hidden])', { timeout: 4000 }).catch(() => {});
    await d.waitForTimeout(1300);
    const stars = await d.locator('#win-stars .star.on').count();
    const lit = await d.textContent('#houses-lit'), total = await d.textContent('#houses-total');
    const mv = (await st(d)).moves;
    const dishes = sol.filter((t) => t.length > 2).length;
    check(stars === 3 && lit === total && mv === sol.length,
      `level ${i + 1}: ${sol.length} towers${dishes ? ` (${dishes} dish)` : ''}, ${mv} moves, ${lit}/${total} lit, ${stars} stars`);
    if (i === N - 1) await d.screenshot({ path: `${OUT}/final-win.png` });
    if (i < N - 1) {
      // Next level goes by the map. Even levels: watch the road draw, then
      // click the highlighted circle. Odd levels: click to skip the road,
      // then press Enter on the focused circle.
      await d.click('#win-next');
      if (i % 2) { await d.waitForTimeout(350); await d.mouse.click(20, 400); await d.waitForTimeout(550); }
      await d.waitForSelector(`.map-node.arrive[data-level="${i + 1}"]`, { timeout: 4000 });
      await d.waitForFunction((n) => document.activeElement && document.activeElement.dataset.level === String(n), i + 1);
      if (i % 2) await d.keyboard.press('Enter');
      else await d.click(`.map-node.arrive[data-level="${i + 1}"]`);
      await d.waitForTimeout(350);
      const at = (await st(d))?.index;
      if (at !== i + 1) check(false, `Next level after level ${i + 1} goes by the map to level ${i + 2} (at ${at})`);
    }
  }
  check(await d.locator('#win-next').isHidden(), 'last level hides "Next level"');
  await d.click('#win-levels'); await d.waitForTimeout(3500);
  check((await d.textContent('#star-total')) === `${N * 3} / ${N * 3}`, `star total reads ${await d.textContent('#star-total')}`);
  check((await d.locator('.map-node.locked').count()) === 0 && (await d.locator('.map-banner.locked').count()) === 0 && (await d.locator('.map-node.perfect').count()) === N, 'all levels and chapters unlocked, every node shows 3 stars');
  check(await d.locator('#map-cta').isHidden(), 'all beaten: the map hides the Play button');
  await d.screenshot({ path: `${OUT}/levels-complete.png` });
  await d.evaluate(() => document.getElementById('map-scroll').scrollTo(0, 0));
  await d.waitForTimeout(150);
  await d.screenshot({ path: `${OUT}/levels-complete-bottom.png` });

  // Saved progress and mute survive a reload.
  await d.click('#levels-back');
  await d.click('#title-settings');
  await d.click('#sound-toggle');
  await d.reload({ waitUntil: 'domcontentloaded' }); await d.waitForFunction(() => window.__signalTest); await d.waitForTimeout(300);
  const saved = await d.evaluate(() => JSON.parse(localStorage.getItem('signal-tower-v2')));
  check(Object.values(saved.stars).filter((v) => v === 3).length === N && saved.sound === false, 'progress and sound setting persist after reload');
  check((await d.getAttribute('#mute-btn use', 'href')) === '#i-mute', 'mute icon shows muted state');
  check((await d.textContent('#title-play-label')) === 'Play again', 'all done, title says Play again: ' + `title button: "${await d.textContent('#title-play-label')}"`);
  // Old saves (15 levels, no "seen" field) still load.
  await d.evaluate(() => {
    const stars = {}; for (let i = 0; i < 15; i++) stars[i] = 3;
    localStorage.setItem('signal-tower-v2', JSON.stringify({ stars, best: {}, sound: false }));
  });
  await d.reload({ waitUntil: 'domcontentloaded' }); await d.waitForFunction(() => window.__signalTest); await d.waitForTimeout(300);
  const sub16 = await d.textContent('#title-play-sub');
  check((await d.textContent('#title-play-label')) === 'Continue' && sub16.startsWith('Level 16, '), `an old 15-level save continues at level 16 ("${sub16}")`);
  await d.screenshot({ path: `${OUT}/title-mid-desktop.png` });
  // The old save has no road counter: opening the map must not replay the road.
  await d.click('#title-levels'); await d.waitForTimeout(500);
  const oldMap = await d.evaluate(() => ({ packet: !!document.querySelector('.map-packet'), cur: document.querySelector('.map-node.current')?.dataset.level, road: JSON.parse(localStorage.getItem('signal-tower-v2')).road }));
  check(!oldMap.packet && oldMap.cur === '15' && oldMap.road === 15, `an old save shows the map with no road animation (${JSON.stringify(oldMap)})`);
  await d.screenshot({ path: `${OUT}/map-mid-desktop.png` });
  await d.click('#levels-back');
  // Sound on: playing every effect must not throw.
  await d.click('#title-settings'); await d.click('#sound-toggle');
  const soundOk = await d.evaluate(() => {
    try { ['click', 'place', 'remove', 'connect', 'invalid', 'undo', 'hint', 'win', 'lift', 'turn', 'chime'].forEach((n) => window.SignalAudio.play(n)); window.SignalAudio.play('star', 2); return true; }
    catch (e) { return e.message; }
  });
  check(soundOk === true, 'all sound effects play without errors');

  // Hints know about dishes: a wrong facing gets a "turn" hint.
  await d.evaluate(() => { const g = window.__signalTest; g.startLevel(23); g.selectType('dish'); const t = g.state.level.solutions[0][0]; g.act(t[0], t[1]); });
  await d.evaluate(() => { const g = window.__signalTest; const t = g.state.level.solutions[0][0]; if (t[2] === 0) g.act(t[0], t[1]); });
  await d.click('#hint-btn');
  const hk = await d.evaluate(() => window.__signalTest.board.hint && window.__signalTest.board.hint.kind);
  check(hk === 'turn', `hint asks to turn a wrongly aimed dish (${hk})`);

  // ---------- Mechanic screenshots, desktop ----------
  // [level index, towers to place (taps; a dish is placed then turned)]
  const showcase = async (page, name, index, towers, hover) => {
    await page.evaluate(([index, towers]) => {
      const g = window.__signalTest;
      g.startLevel(index);
      for (const t of towers) {
        g.selectType(t.length > 2 ? 'dish' : 'mast');
        g.act(t[0], t[1]);
        for (let f = 0; f < (t[2] || 0); f++) g.act(t[0], t[1]);
      }
    }, [index, towers]);
    if (hover) { const q = await tile(page, hover[0], hover[1]); await page.mouse.move(q.x, q.y); }
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };
  const shots = [
    ['quiet', 15, [[1, 3]]],                     // tower covering the observatory: violated
    ['busy', 19, [[3, 1]]],                       // office block with one lamp
    ['dish', 24, [[3, 2, 2]], [4, 1]],            // dish aimed south, mouse previewing a tower
    ['relay', 28, [[3, 2], [3, 5], [5, 6]]],      // chain with a dead tower at the end
    ['panel', 32, [[4, 2]]],                      // bounce round the corner
    ['mixed', 37, [[3, 7], [2, 6], [2, 4, 0], [7, 5]]], // live chain to a dish, one dead tower
  ];
  for (const [name, i, towers, hover] of shots) await showcase(d, `${name}-desktop`, i, towers, hover);
  const quietState = await d.evaluate(() => { const g = window.__signalTest; g.startLevel(15); g.act(1, 3); return document.querySelector('.stat-houses').classList.contains('violated'); });
  check(quietState, 'covering the observatory marks the houses counter');

  // ---------- Phone: touch ----------
  const { page: m, ctx: mctx } = await open(browser, 'phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const cdp = await mctx.newCDPSession(m);
  await m.evaluate(() => window.__signalTest.startLevel(14));
  await m.waitForTimeout(300);
  let sol = await m.evaluate(() => window.__signalTest.state.level.solutions[0]);
  for (const [x, y] of sol) { const t = await tile(m, x, y); await m.touchscreen.tap(t.x, t.y); await m.waitForTimeout(60); }
  await m.waitForTimeout(400);
  s = await st(m);
  check(s.won && s.n === sol.length, `phone: level 15 solved by touch taps (${s.n} towers, moves ${s.moves})`);

  // Touch drag from the tray: the target is the tile under the finger.
  await m.evaluate(() => window.__signalTest.startLevel(1));
  await m.waitForTimeout(250);
  let target = await tile(m, 1, 2);
  await touchDrag(m, cdp, await chip(m, 'mast'), target, { drop: false });
  const tmid = await m.evaluate(() => window.__signalTest.drag);
  check(tmid && tmid.target && tmid.target.join() === '1,2', `touch drag targets the tile under the finger (${tmid && tmid.target})`);
  await m.screenshot({ path: `${OUT}/drag-phone.png` });
  await touch(cdp, 'touchEnd', 0, 0); await m.waitForTimeout(100);
  s = await st(m);
  check(s.n === 1 && s.moves === 1 && s.towers[0].join() === '1,2', 'touch drop places the tower (1 move)');
  // Touch move.
  const from = await tile(m, 1, 2);
  target = await tile(m, 0, 3);
  await touchDrag(m, cdp, from, target);
  s = await st(m);
  check(s.towers[0].join() === '0,3' && s.moves === 2, `touch drag moves a placed tower (now ${s.towers[0].join()}, moves ${s.moves})`);
  // Touch remove: drag off the board onto the tray.
  await touchDrag(m, cdp, await tile(m, 0, 3), await chip(m, 'mast'));
  s = await st(m);
  check(s.n === 0 && s.moves === 3, 'touch drag onto the tray removes the tower (1 move)');
  // Hold to place: the held tower lifts, release builds.
  target = await tile(m, 5, 2);
  await touchDrag(m, cdp, target, target, { hold: 400 });
  s = await st(m);
  check(s.n === 1 && s.towers[0].join() === '5,2' && s.moves === 4, `hold and release builds under the finger (${s.towers.map(String)})`);
  // Long press removes a tower.
  const lp = await tile(m, 5, 2);
  await touch(cdp, 'touchStart', lp.x, lp.y);
  await m.waitForTimeout(400);
  await m.screenshot({ path: `${OUT}/long-press-phone.png` });
  await m.waitForTimeout(400);
  await touch(cdp, 'touchEnd', lp.x, lp.y); await m.waitForTimeout(100);
  s = await st(m);
  check(s.n === 0 && s.moves === 5, 'long press removes a tower (1 move)');
  // A quick tap on a dish turns it (touch).
  await m.evaluate(() => window.__signalTest.startLevel(24));
  await m.waitForTimeout(200);
  await touchDrag(m, cdp, await chip(m, 'dish'), (await tile(m, 3, 2)));
  const dt = await tile(m, 3, 2);
  await m.touchscreen.tap(dt.x, dt.y); await m.waitForTimeout(80);
  await m.touchscreen.tap(dt.x, dt.y); await m.waitForTimeout(80);
  s = await st(m);
  check(s.towers[0][2] === 2 && s.moves === 1, `touch taps turn a dish for free (facing ${s.towers[0][2]}, moves ${s.moves})`);
  // Mid-drag of a dish over the board, for the screenshot.
  await touchDrag(m, cdp, await chip(m, 'mast'), (await tile(m, 4, 0)), { drop: false });
  await m.screenshot({ path: `${OUT}/drag-dish-level-phone.png` });
  await touch(cdp, 'touchEnd', 0, 0); await m.waitForTimeout(100);
  for (const [name, i, towers, hover] of shots) await showcase(m, `${name}-phone`, i, towers, null && hover);

  // Performance: busy boards at 3x DPR (waves, bounces, relay links).
  const perf = async (page, label, index, count) => {
    await page.evaluate(([index, count]) => {
      const g = window.__signalTest; g.startLevel(index);
      g.state.level.solutions[0].slice(0, count).forEach((t) => { g.selectType(t.length > 2 ? 'dish' : 'mast'); g.act(t[0], t[1]); for (let f = 0; f < (t[2] || 0); f++) g.act(t[0], t[1]); });
    }, [index, count]);
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => new Promise((res) => {
      const p = window.__signalPerf; const f0 = p.frames, m0 = p.renderMs, t0 = performance.now();
      setTimeout(() => res({ fps: (p.frames - f0) / ((performance.now() - t0) / 1000), ms: (p.renderMs - m0) / (p.frames - f0) }), 3000);
    }));
    check(r.fps > 55 && r.ms < 8, `${label}: ${r.fps.toFixed(1)} fps, ${r.ms.toFixed(2)} ms render per frame`);
  };
  await perf(m, 'phone 390x844 @3x, level 15', 14, 4);
  await perf(m, 'phone 390x844 @3x, level 38 (relay, dish, office)', 37, 4);
  await perf(m, 'phone 390x844 @3x, level 35 (panels)', 34, 2);
  await perf(d, 'desktop 1280x800 @1x, level 38', 37, 4);
  // A drag in progress must stay smooth too.
  await m.evaluate(() => window.__signalTest.startLevel(36));
  await m.waitForTimeout(300);
  await touchDrag(m, cdp, await chip(m, 'mast'), (await tile(m, 4, 4)), { drop: false });
  const dragPerf = await m.evaluate(() => new Promise((res) => {
    const p = window.__signalPerf; const f0 = p.frames, m0 = p.renderMs, t0 = performance.now();
    setTimeout(() => res({ fps: (p.frames - f0) / ((performance.now() - t0) / 1000), ms: (p.renderMs - m0) / (p.frames - f0) }), 2000);
  }));
  check(dragPerf.fps > 55 && dragPerf.ms < 8, `phone mid-drag: ${dragPerf.fps.toFixed(1)} fps, ${dragPerf.ms.toFixed(2)} ms render per frame`);
  await touch(cdp, 'touchEnd', 0, 0);

  // ---------- Landscape phone ----------
  const { page: l, ctx: lctx } = await open(browser, 'landscape', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const lcdp = await lctx.newCDPSession(l);
  for (const [name, i, towers] of shots) await showcase(l, `${name}-landscape`, i, towers);
  await l.evaluate(() => window.__signalTest.startLevel(25));
  await l.waitForTimeout(300);
  await touchDrag(l, lcdp, await chip(l, 'dish'), (await tile(l, 3, 3)), { drop: false });
  const lmid = await l.evaluate(() => window.__signalTest.drag);
  check(!!(lmid && lmid.target), 'landscape: dragging from the side tray reaches the board');
  await l.screenshot({ path: `${OUT}/drag-landscape.png` });
  await touch(lcdp, 'touchEnd', 0, 0); await l.waitForTimeout(100);
  // Every placeable tile of every level is the drop target for a finger
  // anywhere inside it (centre and near each corner), on short landscape
  // screens and in portrait.
  const sweep = async (page) => page.evaluate(async () => {
    const g = window.__signalTest, misses = [];
    const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const spots = [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]];
    for (let i = 0; i < LEVELS.length; i++) {
      g.startLevel(i);
      await frame(); // let the board resize out of the menu layout
      const b = g.board, r = document.getElementById('board').getBoundingClientRect();
      for (let y = 0; y < g.state.grid.height; y++) for (let x = 0; x < g.state.grid.width; x++) {
        if (!window.SignalLogic.canPlace(g.state.grid, x, y)) continue;
        const ok = spots.every(([u, v]) => {
          const t = g.targetAt(r.left + b.ox + (x + u) * b.tile, r.top + b.oy + (y + v) * b.tile, 'touch').tile;
          return !!t && t[0] === x && t[1] === y;
        });
        if (!ok) misses.push(`${i + 1}:${x},${y}`);
      }
    }
    return misses;
  });
  let miss = await sweep(l);
  check(miss.length === 0, `landscape 844x390: a finger anywhere on a placeable tile targets that tile, every level (${miss.length} misses${miss.length ? ': ' + miss.slice(0, 5).join(' ') : ''})`);
  const { page: l2, ctx: l2ctx } = await open(browser, 'landscape-small', { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  miss = await sweep(l2);
  check(miss.length === 0, `landscape 667x375: a finger anywhere on a placeable tile targets that tile, every level (${miss.length} misses${miss.length ? ': ' + miss.slice(0, 5).join(' ') : ''})`);
  miss = await sweep(m);
  check(miss.length === 0, `portrait 390x844: a finger anywhere on a placeable tile targets that tile, every level (${miss.length} misses)`);
  // Real touch drags onto every bottom-row tile of level 37 at 667x375.
  const l2cdp = await l2ctx.newCDPSession(l2);
  await l2.evaluate(() => window.__signalTest.startLevel(36));
  await l2.waitForTimeout(200);
  const bottom = await l2.evaluate(() => { const g = window.__signalTest.state.grid; const out = []; for (let x = 0; x < g.width; x++) if (window.SignalLogic.canPlace(g, x, g.height - 1)) out.push([x, g.height - 1]); return out; });
  let placedOk = 0;
  for (const [x, y] of bottom) {
    await l2.evaluate(() => window.__signalTest.startLevel(36));
    await l2.waitForTimeout(80);
    // Drag from the tray straight onto the tile and drop.
    await touchDrag(l2, l2cdp, await chip(l2, 'mast'), await tile(l2, x, y), { drop: false });
    const dg = await l2.evaluate(() => window.__signalTest.drag);
    const hitTarget = !!(dg && dg.target && dg.target[0] === x && dg.target[1] === y);
    await touch(l2cdp, 'touchEnd', 0, 0); await l2.waitForTimeout(80);
    const s2 = await st(l2);
    if (hitTarget && s2.n === 1 && s2.towers[0][0] === x && s2.towers[0][1] === y) placedOk++;
  }
  check(placedOk === bottom.length, `landscape 667x375: real touch drags place on all ${bottom.length} bottom-row tiles of level 37 (${placedOk} ok)`);
  await l2.screenshot({ path: `${OUT}/landscape-small-bottom-row.png` });
  // The level 1 callout and the start toast stay clear of the board and HUD stats.
  await l.evaluate(() => { localStorage.removeItem('signal-tower-v2'); });
  await l.reload({ waitUntil: 'domcontentloaded' }); await l.waitForFunction(() => window.__signalTest); await l.waitForTimeout(200);
  await l.evaluate(() => window.__signalTest.startLevel(0));
  const clearOf = () => l.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const b = window.__signalTest.board, c = r(document.getElementById('board'));
    const boardRect = { left: c.left + b.ox, top: c.top + b.oy, right: c.left + b.ox + b.boardW, bottom: c.top + b.oy + b.boardH };
    const hit = (a, z) => a.left < z.right && a.right > z.left && a.top < z.bottom && a.bottom > z.top;
    const toast = r(document.getElementById('toast')), call = r(document.getElementById('callout'));
    const stats = [...document.querySelectorAll('#hud-stats .stat')].map(r);
    return { toastBoard: hit(toast, boardRect), toastStats: stats.some((s) => hit(toast, s)), callBoard: hit(call, boardRect),
      callStats: stats.some((s) => hit(call, s)), callShown: !document.getElementById('callout').hidden };
  });
  await l.waitForTimeout(800);
  let clear = await clearOf();
  check(!clear.toastBoard && !clear.toastStats && !clear.callShown, `landscape: the start toast sits clear of the board and the stats (${JSON.stringify(clear)})`);
  await l.screenshot({ path: `${OUT}/landscape-level1-start.png` });
  await l.waitForTimeout(4200);
  clear = await clearOf();
  check(clear.callShown && !clear.callStats && !clear.callBoard, `landscape: the level 1 tray callout follows the toast, clear of the stats and the board (${JSON.stringify(clear)})`);
  await l.screenshot({ path: `${OUT}/landscape-level1-callout.png` });
  await l.evaluate(() => window.__signalTest.startLevel(36));
  await l.waitForTimeout(500);
  await l.screenshot({ path: `${OUT}/landscape-toast.png` });

  // Regression (Kaden: "when placing towers it's not perfectly lined up with
  // your finger"): real drags from the tray at several spots, some off the
  // tile centre, land on the tile under the finger (or the mouse). Touch
  // ghosts float straight above the drop tile, fully on screen, and the
  // board marks the drop tile. The drag layer's CSS size matches its
  // backing store at the device pixel ratio.
  {
    const devices = [
      ['phone 390x844 @3x', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'touch'],
      ['landscape 844x390 @3x', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'touch'],
      ['desktop 1280x800', { viewport: { width: 1280, height: 800 } }, 'mouse'],
    ];
    // Placeable tiles spread over the board: corners, edges and the middle.
    const pickTiles = (page) => page.evaluate(() => {
      const g = window.__signalTest.state.grid, ok = [];
      for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (window.SignalLogic.canPlace(g, x, y)) ok.push([x, y]);
      const near = (tx, ty) => ok.reduce((b, t) => (Math.hypot(t[0] - tx, t[1] - ty) < Math.hypot(b[0] - tx, b[1] - ty) ? t : b));
      const W = g.width - 1, H = g.height - 1;
      const out = [near(0, 0), near(W, 0), near(W / 2, H / 2), near(0, H), near(W, H), near(W / 3, 0), near(2 * W / 3, H)];
      return out.filter((t, i) => out.findIndex((u) => u.join() === t.join()) === i);
    });
    const offsets = [[0.5, 0.5], [0.2, 0.25], [0.8, 0.75], [0.75, 0.2], [0.25, 0.8]];
    for (const [label, opts, kind] of devices) {
      const { page: q, ctx: qctx } = await open(browser, `align-${label}`, opts);
      const qcdp = kind === 'touch' ? await qctx.newCDPSession(q) : null;
      const layer = await q.evaluate(() => {
        const c = document.getElementById('drag-layer'), r = c.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 3);
        return { ok: Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1 && c.width === Math.round(r.width * dpr) && c.height === Math.round(r.height * dpr), w: r.width, h: r.height, bw: c.width, bh: c.height };
      });
      check(layer.ok, `${label}: drag layer is window-sized and scaled by the pixel ratio (${layer.w}x${layer.h} css, ${layer.bw}x${layer.bh} backing)`);
      let total = 0, good = 0;
      const bad = [];
      for (const level of [0, 14, 36]) {
        await q.evaluate((i) => window.__signalTest.startLevel(i), level);
        await q.waitForTimeout(350); // board input waits 300ms after a screen change
        const tiles = await pickTiles(q);
        for (const [x, y] of tiles) {
          for (const [u, v] of offsets) {
            total++;
            const fromWin = await q.evaluate(() => !document.getElementById('screen-win').hidden);
            await q.evaluate((i) => window.__signalTest.startLevel(i), level);
            // Leaving the win screen is a screen change: board input waits 300ms.
            await q.waitForTimeout(fromWin ? 350 : 40);
            const t = await tile(q, x, y);
            const finger = { x: t.x + (u - 0.5) * t.size, y: t.y + (v - 0.5) * t.size };
            const from = await chip(q, 'mast');
            if (kind === 'touch') await touchDrag(q, qcdp, from, finger, { drop: false });
            else await mouseDrag(q, from, finger, { drop: false });
            await q.waitForTimeout(150); // let the ghost settle
            const mid = await q.evaluate(() => {
              const g = window.__signalTest, d = g.drag;
              return d && { target: d.target, ghost: d.ghost, mark: g.board.dropMark, tileSize: g.board.tile, w: innerWidth, h: innerHeight };
            });
            if (kind === 'touch') await touch(qcdp, 'touchEnd', 0, 0); else await q.mouse.up();
            await q.waitForTimeout(60);
            const s4 = await st(q);
            // A winning drop shows the win screen after a pause; let it show
            // before the next drag so it can't cancel that drag.
            if (s4.won) await q.waitForTimeout(1000);
            const why = [];
            if (!mid || String(mid.target) !== `${x},${y}`) why.push(`target ${mid && mid.target}`);
            if (!(s4.n === 1 && String(s4.towers[0].slice(0, 2)) === `${x},${y}`)) why.push(`landed ${s4.towers.map((w) => w.slice(0, 2).join(',')).join(' ') || 'nowhere'}`);
            if (mid && kind === 'touch') {
              const [gx, gy] = mid.ghost, half = mid.tileSize / 2;
              const above = Math.abs(gx - t.x) < 0.5 && gy < t.y - half;
              const side = Math.abs(gx - t.x) >= mid.tileSize && Math.abs(gy - t.y) <= 2 + half;
              if (!above && !side) why.push(`ghost at ${gx.toFixed(1)},${gy.toFixed(1)} for tile centre ${t.x.toFixed(1)},${t.y.toFixed(1)}`);
              if (gx - half < 0 || gx + half > mid.w || gy - half < 0 || gy + half > mid.h) why.push('ghost off screen');
              if (!mid.mark) why.push('no drop mark');
            }
            if (mid && kind === 'mouse') {
              if (Math.hypot(mid.ghost[0] - t.x, mid.ghost[1] - t.y) > 0.5) why.push('mouse ghost not in the tile');
              if (mid.mark) why.push('drop mark shown for mouse');
            }
            if (why.length) bad.push(`L${level + 1} ${x},${y} @${u},${v}: ${why.join(', ')}`);
            else good++;
          }
        }
      }
      check(good === total, `${label}: ${total} drags from the tray land on the tile under the ${kind === 'touch' ? 'finger' : 'cursor'} (${good} ok${bad.length ? '; ' + bad.slice(0, 4).join('; ') : ''})`);
      if (kind === 'touch') {
        await q.evaluate(() => window.__signalTest.startLevel(14));
        await q.waitForTimeout(150);
        await touchDrag(q, qcdp, await chip(q, 'mast'), await tile(q, 3, 4), { drop: false });
        await q.waitForTimeout(200);
        await q.screenshot({ path: `${OUT}/drop-under-finger-${label.split(' ')[0]}.png` });
        await touch(qcdp, 'touchEnd', 0, 0); await q.waitForTimeout(60);
      }
      await qctx.close();
    }
  }

  // Level map road: a first-time clear draws the road to the next level the
  // next time the map opens, once. Crossing into a new chapter opens its
  // banner. A tap skips. Blocked tiles look like plain ground at rest.
  {
    const { page: q, ctx: qctx } = await open(browser, 'map-phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const solve = async (i) => {
      await q.evaluate((i) => { const g = window.__signalTest; g.startLevel(i); for (const t of g.state.level.solutions[0]) { g.selectType(t.length > 2 ? 'dish' : 'mast'); g.act(t[0], t[1]); for (let f = 0; f < (t[2] || 0); f++) g.act(t[0], t[1]); } }, i);
      await q.waitForSelector('#screen-win:not([hidden])');
    };
    const mapInfo = () => q.evaluate(() => ({ lines: document.querySelectorAll('.map-road .travelled .line').length, packet: !!document.querySelector('.map-packet'), cur: document.querySelector('.map-node.current')?.dataset.level, ch2: !document.querySelector('.map-banner[data-chapter="1"]').classList.contains('locked'), road: JSON.parse(localStorage.getItem('signal-tower-v2')).road }));
    await q.screenshot({ path: `${OUT}/title-fresh-phone.png` });
    await solve(0);
    await q.click('#win-levels'); await q.waitForTimeout(700);
    let mi = await mapInfo();
    check(mi.packet && mi.lines === 1 && mi.road === 1, `first clear: the road draws from level 1 to 2 when the map opens (${JSON.stringify(mi)})`);
    await q.screenshot({ path: `${OUT}/map-road-anim-phone.png` });
    await q.waitForTimeout(1300);
    mi = await mapInfo();
    check(!mi.packet && mi.cur === '1', `after the animation level 2 is current (${JSON.stringify(mi)})`);
    await q.click('#levels-back'); await q.click('#title-levels'); await q.waitForTimeout(600);
    mi = await mapInfo();
    check(!mi.packet && mi.lines === 1, `reopening the map does not replay the road (${JSON.stringify(mi)})`);
    for (let i = 1; i < 14; i++) await solve(i);
    await q.click('#win-levels'); await q.waitForTimeout(3600);
    await solve(14);
    await q.click('#win-levels'); await q.waitForTimeout(1000);
    mi = await mapInfo();
    check(mi.packet === false || mi.ch2, `beating level 15 opens chapter 2 as the road passes (${JSON.stringify(mi)})`);
    await q.screenshot({ path: `${OUT}/map-chapter-anim-phone.png` });
    await q.waitForTimeout(1200);
    mi = await mapInfo();
    check(mi.ch2 && mi.cur === '15' && mi.lines === 15, `chapter 2 open and level 16 current after the animation (${JSON.stringify(mi)})`);
    await q.screenshot({ path: `${OUT}/map-mid-phone.png` });
    await solve(15);
    await q.click('#win-levels'); await q.waitForTimeout(400);
    await q.touchscreen.tap(195, 420); await q.waitForTimeout(150);
    mi = await mapInfo();
    const onMap = await q.evaluate(() => !document.getElementById('screen-levels').hidden);
    check(!mi.packet && mi.cur === '16' && onMap, `a tap skips the road animation and stays on the map (${JSON.stringify(mi)})`);
    await q.click('#levels-back'); await q.waitForTimeout(300);
    await q.screenshot({ path: `${OUT}/title-mid-phone.png` });
    // Blocked tiles: no dark fill at rest. Sample the board pixels of every
    // tile a wall blocks next to a placed tower on level 2.
    await q.evaluate(() => { const g = window.__signalTest; g.startLevel(1); g.act(2, 0); });
    await q.waitForTimeout(500);
    const dark = await q.evaluate(() => {
      const g = window.__signalTest, b = g.board, ev = window.SignalLogic.evaluate(g.state.grid, g.state.towers);
      const ctx = document.getElementById('board').getContext('2d'), dpr = b.dpr;
      const lum = (x, y) => { const px = ctx.getImageData(Math.round((b.ox + (x + 0.5) * b.tile) * dpr), Math.round((b.oy + (y + 0.2) * b.tile) * dpr), 1, 1).data; return 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]; };
      return ev.reach[0].shadow.map(([x, y]) => lum(x, y)).filter((v) => v < 60).length;
    });
    check(dark === 0, `wall-blocked tiles are plain ground at rest, not dark (${dark} dark)`);
    await q.screenshot({ path: `${OUT}/walls-phone.png` });
    await qctx.close();
  }

  // Polish pass: start screen layout, level map navigation, the win timer
  // race, the dish cone clip, and screenshots of the title, the map (fresh
  // save and mid-progress) and a level with wall-blocked tiles, at three sizes.
  {
    const sizes = [
      ['desktop', { viewport: { width: 1280, height: 800 } }],
      ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
      ['landscape', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
    ];
    const MID = { stars: Object.fromEntries([...Array(17).keys()].map((i) => [i, i % 4 === 1 ? 2 : 3])), best: {}, sound: true, seen: {}, road: 17 };
    const seed = async (p, data) => {
      await p.evaluate((data) => { if (data) localStorage.setItem('signal-tower-v2', JSON.stringify(data)); else localStorage.removeItem('signal-tower-v2'); }, data);
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.__signalTest && window.__signalPerf.frames > 5);
      await p.waitForTimeout(700); // entrance animation
    };
    for (const [label, opts] of sizes) {
      const { page: p, ctx } = await open(browser, `polish-${label}`, opts);
      const vw = opts.viewport.width, vh = opts.viewport.height;
      // ----- Start screen -----
      await seed(p, null);
      const t = await p.evaluate(() => {
        const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const hero = document.querySelector('.title-hero');
        const hr = hero.getBoundingClientRect();
        return { hero: { l: hr.left, t: hr.top, r: hr.right, b: hr.bottom, loaded: !!hero.querySelector('svg.town-svg .tower') },
          play: r('title-play'), map: r('title-levels'), settings: r('title-settings'), sound: r('title-sound'),
          stage: getComputedStyle(document.getElementById('stage')).visibility,
          scroll: document.getElementById('screen-title').scrollHeight <= document.getElementById('screen-title').clientHeight + 1 };
      });
      const inside = (b) => b.l >= 0 && b.t >= 0 && b.r <= vw + 0.5 && b.b <= vh + 0.5;
      const overlap = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
      check(t.hero.loaded && inside(t.hero) && inside(t.play) && inside(t.map) && inside(t.settings) && t.scroll,
        `${label}: start screen fits the screen with the hero, Continue, Level map and Settings visible`);
      check(!overlap(t.sound, t.hero) && !overlap(t.sound, t.play), `${label}: the sound button clears the hero and the main button`);
      check(t.play.h >= 56 && t.play.w >= t.map.w * 1.5 && t.map.h >= 44, `${label}: the main button is the biggest target (${Math.round(t.play.w)}x${Math.round(t.play.h)})`);
      check(t.stage === 'hidden', `${label}: no game board behind the start screen`);
      await p.screenshot({ path: `${OUT}/polish-title-fresh-${label}.png` });
      // ----- Map, fresh save -----
      await p.click('#title-levels'); await p.waitForTimeout(400);
      const fm = await p.evaluate(() => {
        const nodes = [...document.querySelectorAll('.map-node')];
        const cur = document.querySelector('.map-node.current').getBoundingClientRect();
        const cta = document.getElementById('map-cta').getBoundingClientRect();
        return { locked: nodes.filter((n) => n.classList.contains('locked')).length, n: nodes.length,
          small: nodes.filter((n) => n.getBoundingClientRect().width < 44).length,
          curVisible: cur.top >= 0 && cur.bottom <= cta.top + 48, focus: document.activeElement.dataset.level,
          banner: document.querySelector('.map-banner').getBoundingClientRect().top >= document.getElementById('map-bar').getBoundingClientRect().bottom - 1 };
      });
      check(fm.n === N && fm.locked === N - 1 && fm.small === 0 && fm.curVisible && fm.banner, `${label}: fresh map has level 1 open, ${N - 1} locked, every node 44px or more, level 1 and the chapter 1 banner in view (${JSON.stringify(fm)})`);
      await p.screenshot({ path: `${OUT}/polish-map-fresh-${label}.png` });
      await p.click('#levels-back'); await p.waitForTimeout(250);
      // ----- Mid-progress: title and map -----
      await seed(p, MID);
      check((await p.textContent('#title-play-label')) === 'Continue' && (await p.textContent('#title-play-sub')).startsWith('Level 18, ') && !(await p.locator('#title-progress').isHidden()),
        `${label}: mid save says Continue, Level 18, with the progress strip`);
      await p.screenshot({ path: `${OUT}/polish-title-mid-${label}.png` });
      await p.click('#title-levels'); await p.waitForTimeout(400);
      const mm = await p.evaluate(() => {
        const sc = document.getElementById('map-scroll'), cta = document.getElementById('map-cta');
        const band = sc.clientHeight - (cta.hidden ? 0 : cta.getBoundingClientRect().height);
        const cur = document.querySelector('.map-node.current'), r = cur.getBoundingClientRect(), s = sc.getBoundingClientRect();
        const lab = cur.nextElementSibling.getBoundingClientRect(), track = document.getElementById('map-track').getBoundingClientRect();
        return { cur: cur.dataset.level, at: (r.top + r.height / 2 - s.top) / band, lines: document.querySelectorAll('.map-road .travelled .line').length,
          perfect: document.querySelectorAll('.map-node.perfect').length, beaten: document.querySelectorAll('.map-node.beaten').length,
          labelIn: lab.left >= track.left - 1 && lab.right <= track.right + 1 && lab.left >= 0 && lab.right <= innerWidth,
          ch2: !document.querySelector('.map-banner[data-chapter="1"]').classList.contains('locked'), ch3: document.querySelector('.map-banner[data-chapter="2"]').classList.contains('locked') };
      });
      check(mm.cur === '17' && mm.lines === 17 && mm.beaten === 17 && mm.perfect === 13 && mm.ch2 && mm.ch3 && mm.labelIn && Math.abs(mm.at - 0.45) < 0.08,
        `${label}: mid map: road filled to level 18, 13 gold and 4 teal nodes, chapter 2 open and 3 locked, level 18 at ${Math.round(mm.at * 100)}% of the view, label on screen`);
      await p.screenshot({ path: `${OUT}/polish-map-mid-${label}.png` });
      // ----- Map navigation (keyboard, once on desktop) -----
      if (label === 'desktop') {
        await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp');
        check((await p.evaluate(() => document.activeElement.dataset.level)) === '15', 'map: Up arrow moves focus back along the road');
        await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
        check((await p.evaluate(() => document.activeElement.dataset.level)) === '18', 'map: Down arrow moves focus on, onto locked nodes too');
        await p.keyboard.press('Enter'); await p.waitForTimeout(150);
        check(!(await p.locator('#screen-levels').isHidden()) && (await p.textContent('#map-toast')) === 'Finish level 18 first.', 'map: Enter on a locked node stays on the map with a toast');
        await p.keyboard.press('Home');
        check((await p.evaluate(() => document.activeElement.dataset.level)) === '17', 'map: Home focuses the current level');
        await p.keyboard.press('Enter'); await p.waitForTimeout(250);
        check((await st(p))?.index === 17, 'map: Enter on the current node starts that level');
        await p.keyboard.press('Escape'); await p.click('#pause-levels'); await p.waitForTimeout(300);
        await p.keyboard.press('Escape'); await p.waitForTimeout(250);
        check(!(await p.locator('#screen-title').isHidden()), 'map: Esc goes back to the title');
        await p.click('#title-levels'); await p.waitForTimeout(300);
        await p.click('.map-node[data-level="4"]'); await p.waitForTimeout(250);
        check((await st(p))?.index === 4, 'map: clicking a beaten node replays that level');
        await p.keyboard.press('Escape'); await p.click('#pause-levels'); await p.waitForTimeout(300);
        await p.click('#map-play'); await p.waitForTimeout(250);
        check((await st(p))?.index === 17, 'map: the Play button starts the current level');
        // Win timer race: R within the 900ms before the win screen.
        const solveNow = (i) => p.evaluate((i) => { const g = window.__signalTest; g.startLevel(i); for (const tw of g.state.level.solutions[0]) { g.selectType(tw.length > 2 ? 'dish' : 'mast'); g.act(tw[0], tw[1]); for (let f = 0; f < (tw[2] || 0); f++) g.act(tw[0], tw[1]); } return g.state.won; }, i);
        check(await solveNow(0), 'race: level 1 solved through the test hook');
        await p.waitForTimeout(300);
        await p.keyboard.press('r');
        await p.waitForTimeout(1200);
        const race = await p.evaluate(() => ({ win: !document.getElementById('screen-win').hidden, won: window.__signalTest.state.won, towers: window.__signalTest.state.towers.length }));
        check(!race.win && !race.won && race.towers === 0, `race: R pressed 300ms after a win restarts cleanly and the win screen never shows (${JSON.stringify(race)})`);
        await solveNow(0); await p.waitForTimeout(1200);
        check(!(await p.locator('#screen-win').isHidden()), 'race: without R the win screen still shows after a win');
        await p.click('#win-replay'); await p.waitForTimeout(200);
        // Dish cone: clipped to the board. Level 24 is dish only; put a dish
        // on the top row facing north and compare the pixels above the board.
        const clip = await p.evaluate(async () => {
          // Read pixels from a copy, so the game's own canvas never sees a
          // readback (Chrome warns about repeated getImageData on it).
          const pixels = (cv) => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
          const g = window.__signalTest, b = g.board, L = window.SignalLogic;
          g.startLevel(23);
          let x = 0; while (!L.canPlace(g.state.grid, x, 0)) x++;
          g.selectType('dish'); g.act(x, 0);
          const ctx = document.getElementById('board').getContext('2d'), dpr = b.dpr;
          // Pixels above the board, left and right of the dish (its own
          // focus badge pokes up just above it), where the cone's arc and
          // edges would land if they were not clipped.
          const W = ctx.canvas.width, H = ctx.canvas.height, cx = (b.ox + (x + 0.5) * b.tile) * dpr;
          const top = Math.max(0, Math.round((b.oy - b.tile * 4) * dpr)), bot = Math.round((b.oy - 4) * dpr);
          const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const strip = () => {
            const d = pixels(ctx.canvas), out = [];
            for (let y = top; y < bot; y += 2) for (let px = 0; px < W; px += 2) {
              if (Math.abs(px - cx) < b.tile * dpr || Math.abs(px - cx) > b.tile * 4 * dpr) continue;
              const k = (y * W + px) * 4; out.push(d[k], d[k + 1], d[k + 2], d[k + 3]);
            }
            return out;
          };
          await new Promise((r) => setTimeout(r, 700));
          await frame(); const before = strip();
          b.focusDish = 0; await frame(); await frame();
          const after = strip();
          let diff = 0; for (let k = 0; k < before.length; k++) diff = Math.max(diff, Math.abs(before[k] - after[k]));
          return { above: bot - top, diff, facing: g.state.towers[0][2], focus: b.focusDish };
        });
        check(clip.above > 0 && clip.focus === 0 && clip.diff <= 2, `dish cone stops at the board edge (max pixel change above the board: ${clip.diff})`);
      }
      // ----- A level with wall-blocked tiles -----
      await p.evaluate(() => { const g = window.__signalTest; g.startLevel(1); g.act(2, 0); });
      await p.waitForTimeout(500);
      const dark = await p.evaluate(() => {
        const g = window.__signalTest, b = g.board, ev = window.SignalLogic.evaluate(g.state.grid, g.state.towers);
        const ctx = document.getElementById('board').getContext('2d'), dpr = b.dpr;
        // Read pixels from a copy, so the game's own canvas never sees a
        // readback (Chrome warns about repeated getImageData on it).
        const pixels = (cv) => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
        const W = ctx.canvas.width, img = pixels(ctx.canvas);
        const lum = (x, y) => { const k = (Math.round((b.oy + (y + 0.2) * b.tile) * dpr) * W + Math.round((b.ox + (x + 0.5) * b.tile) * dpr)) * 4; return 0.2126 * img[k] + 0.7152 * img[k + 1] + 0.0722 * img[k + 2]; };
        const sh = ev.reach[0].shadow;
        return { n: sh.length, dark: sh.map(([x, y]) => lum(x, y)).filter((v) => v < 60).length };
      });
      check(dark.n > 0 && dark.dark === 0, `${label}: level 2 has ${dark.n} wall-blocked tiles and none is drawn dark`);
      await p.screenshot({ path: `${OUT}/polish-walls-${label}.png` });
      if (label === 'desktop') {
        // Hovering a placement shows the faint dashed hint behind the wall.
        const h = await tile(p, 4, 4); // (2, 4) is in reach but behind the lower wall
        await p.mouse.move(h.x, h.y); await p.waitForTimeout(300);
        await p.screenshot({ path: `${OUT}/polish-walls-preview-desktop.png` });
        await p.mouse.move(5, 5);
      }
      await ctx.close();
    }
  }

  // Regression: a resize mid-drag retargets the drop to the tile under the pointer.
  {
    const { page: r } = await open(browser, 'resize', { viewport: { width: 1280, height: 800 } });
    await r.evaluate(() => window.__signalTest.startLevel(1));
    await r.waitForTimeout(350);
    await r.waitForTimeout(200);
    const t12 = await tile(r, 1, 2);
    await mouseDrag(r, await chip(r, 'mast'), t12, { drop: false });
    await r.setViewportSize({ width: 700, height: 800 });
    await r.waitForTimeout(300);
    const under = await r.evaluate(([x, y]) => window.__signalTest.board.tileAtPoint(x, y, true), [t12.x, t12.y]);
    const dg = await r.evaluate(() => window.__signalTest.drag);
    await r.mouse.up(); await r.waitForTimeout(100);
    const s3 = await st(r);
    const expect = under;
    check(dg && String(dg.target) === String(expect) && (expect ? s3.n === 1 && String(s3.towers[0]) === String(expect) : s3.n === 0),
      `resize mid-drag: the drop lands on the tile now under the pointer (${expect}), placed ${s3.towers.map(String)}`);
  }

  // 2026-10-14 fixes: double tap never builds a stray tower, a resize during
  // the road animation relays the map out when it ends, a damaged road count
  // is clamped, and Next level goes by the map (road fill, then one tap in).
  {
    const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
    const centre = (page, sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    const solveHook = (page, i) => page.evaluate((i) => { const g = window.__signalTest; g.startLevel(i); for (const t of g.state.level.solutions[0]) { g.selectType(t.length > 2 ? 'dish' : 'mast'); g.act(t[0], t[1]); for (let f = 0; f < (t[2] || 0); f++) g.act(t[0], t[1]); } }, i);
    const win = async (page, i) => { await solveHook(page, i); await page.waitForSelector('#screen-win:not([hidden])'); await page.waitForTimeout(150); };
    const save = (page, data) => page.evaluate((d) => localStorage.setItem('signal-tower-v2', JSON.stringify(d)), data);
    const reload = async (page) => { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__signalTest && window.__signalPerf.frames > 5); await page.waitForTimeout(200); };
    const beaten = (n) => Object.fromEntries([...Array(n).keys()].map((i) => [i, 3]));
    const mapState = (page) => page.evaluate(() => ({
      onMap: !document.getElementById('screen-levels').hidden, anim: window.__signalTest.mapAnim, packet: !!document.querySelector('.map-packet'),
      arrive: document.querySelector('.map-node.arrive')?.dataset.level ?? null, focus: document.activeElement?.dataset?.level ?? null,
      cur: document.querySelector('.map-node.current')?.dataset.level ?? null, level: window.__signalTest.state?.index ?? null,
      road: JSON.parse(localStorage.getItem('signal-tower-v2')).road,
    }));

    // 1. Double tap on title Play (touch, 40 to 250ms apart, and a mouse double click).
    const { page: q, ctx: qctx } = await open(browser, 'fix-phone', phone);
    for (const gap of [40, 120, 250]) {
      await q.evaluate(() => localStorage.clear()); await reload(q);
      const b = await centre(q, '#title-play');
      await q.touchscreen.tap(b.x, b.y); await q.waitForTimeout(gap); await q.touchscreen.tap(b.x, b.y); await q.waitForTimeout(150);
      const s1 = await st(q);
      check(s1 && s1.index === 0 && s1.n === 0 && s1.moves === 0, `double tap on title Play (${gap}ms apart) opens level 1 with an empty board (${JSON.stringify(s1 && { n: s1.n, moves: s1.moves })})`);
    }
    // After the guard a tap builds as normal.
    await q.waitForTimeout(350);
    let t = await tile(q, 0, 1); await q.touchscreen.tap(t.x, t.y); await q.waitForTimeout(100);
    check((await st(q)).n === 1, 'a tap 300ms after the level opens still builds a tower');
    // A finger that went down before the level began can't build on release.
    await q.evaluate(() => { localStorage.clear(); });
    await reload(q);
    t = await tile(q, 0, 1); // board geometry from the last level is fine: we only need a point on the board
    const qcdp = await qctx.newCDPSession(q);
    await q.evaluate(() => window.__signalTest.startLevel(0));
    await q.waitForTimeout(50);
    const tt = await tile(q, 0, 1);
    await touch(qcdp, 'touchStart', tt.x, tt.y);
    await q.waitForTimeout(400);
    await touch(qcdp, 'touchEnd', tt.x, tt.y); await q.waitForTimeout(150);
    let s2 = await st(q);
    check(s2.n === 0 && s2.moves === 0, `a touch that went down in the first 300ms of a level builds nothing on release (${s2.n} towers)`);
    // Double tap on the win screen's Replay.
    await win(q, 0);
    await q.waitForTimeout(900);
    let b = await centre(q, '#win-replay');
    await q.touchscreen.tap(b.x, b.y); await q.waitForTimeout(90); await q.touchscreen.tap(b.x, b.y); await q.waitForTimeout(150);
    s2 = await st(q);
    check(s2.index === 0 && s2.n === 0 && s2.moves === 0 && !s2.won, `double tap on Replay restarts level 1 with an empty board (${s2.n} towers, ${s2.moves} moves)`);

    // 4. Next level goes by the map. Fresh save: win level 1, tap Next.
    await q.evaluate(() => localStorage.clear()); await reload(q);
    await win(q, 0);
    await q.waitForTimeout(900);
    b = await centre(q, '#win-next');
    // Double tap: the second tap must neither skip the road nor start a level.
    await q.touchscreen.tap(b.x, b.y); await q.waitForTimeout(100); await q.touchscreen.tap(b.x, b.y); await q.waitForTimeout(300);
    let ms = await mapState(q);
    check(ms.onMap && ms.anim && ms.packet && ms.road === 1 && ms.arrive === null, `Next level after a first win opens the map and draws the road from level 1 (a double tap does not skip it) (${JSON.stringify(ms)})`);
    await q.screenshot({ path: `${OUT}/fix-next-road-phone.png` });
    await q.waitForTimeout(1600);
    ms = await mapState(q);
    check(!ms.anim && ms.arrive === '1' && ms.focus === '1' && ms.cur === '1', `when the road arrives, level 2 is current, focused and highlighted (${JSON.stringify(ms)})`);
    const lbl = await q.evaluate(() => getComputedStyle(document.querySelector('.map-node.arrive + .map-label')).opacity);
    check(lbl === '1', `the highlighted circle shows its name (label opacity ${lbl})`);
    await q.screenshot({ path: `${OUT}/fix-next-arrive-phone.png` });
    b = await centre(q, '.map-node.arrive');
    await q.touchscreen.tap(b.x, b.y); await q.waitForTimeout(350);
    s2 = await st(q);
    check(s2 && s2.index === 1 && s2.n === 0, `one tap on the highlighted circle enters level 2 (at ${s2 && s2.index})`);
    // A tap skips the road; the circle is then highlighted at once.
    await win(q, 1);
    await q.waitForTimeout(900);
    await q.click('#win-next'); await q.waitForTimeout(400);
    await q.touchscreen.tap(195, 300); await q.waitForTimeout(120);
    ms = await mapState(q);
    check(!ms.anim && !ms.packet && ms.arrive === '2' && ms.onMap && ms.level === null, `a tap skips the road and lands on level 3 without opening anything (${JSON.stringify(ms)})`);
    // Replay of a beaten level: no new road, the map lands on the next circle.
    await win(q, 0);
    await q.waitForTimeout(900);
    await q.click('#win-next'); await q.waitForTimeout(250);
    ms = await mapState(q);
    check(ms.onMap && !ms.anim && !ms.packet && ms.arrive === '1' && ms.cur === '2', `replaying beaten level 1, Next goes to the map with no road and level 2 highlighted (${JSON.stringify(ms)})`);
    await q.waitForTimeout(150);
    ms = await mapState(q);
    check(ms.focus === '1', `... and level 2 focused (${ms.focus})`);
    await q.keyboard.press('Enter'); await q.waitForTimeout(200);
    check((await st(q))?.index === 1, 'Enter on the focused circle starts it');
    // Replay and Level map buttons still do what they did.
    await win(q, 1); await q.waitForTimeout(900);
    await q.click('#win-replay'); await q.waitForTimeout(200);
    s2 = await st(q);
    check(s2.index === 1 && s2.n === 0 && !s2.won, 'win screen Replay still restarts the level');
    await win(q, 1); await q.waitForTimeout(900);
    await q.click('#win-levels'); await q.waitForTimeout(300);
    ms = await mapState(q);
    check(ms.onMap && ms.arrive === null && ms.focus === '2', `win screen Level map still opens the map at the current level (${JSON.stringify(ms)})`);
    // Map events hook: a queued event plays after the road, before the landing.
    await save(q, { stars: beaten(3), best: {}, sound: false, seen: {}, road: 3 }); await reload(q);
    await win(q, 3); await q.waitForTimeout(900);
    await q.evaluate(() => { window.__evLog = []; window.__signalTest.queueMapEvent((done) => { window.__evLog.push(document.querySelector('.map-node.arrive') ? 'late' : 'ran'); setTimeout(done, 200); }); });
    await q.click('#win-next'); await q.waitForTimeout(400);
    let ev = await q.evaluate(() => window.__evLog.slice());
    check(ev.length === 0, `a queued map event waits for the road (${ev})`);
    await q.waitForTimeout(1500);
    ev = await q.evaluate(() => window.__evLog.slice());
    ms = await mapState(q);
    check(ev.join() === 'ran' && ms.arrive === '4', `then it runs once, and the map lands on level 5 after it (${ev}, arrive ${ms.arrive})`);

    // 3. A damaged road count past the progress is clamped and the road still draws.
    await save(q, { stars: beaten(6), best: {}, sound: false, seen: {}, road: 999 }); await reload(q);
    await win(q, 6); await q.waitForTimeout(900);
    await q.click('#win-next'); await q.waitForTimeout(500);
    ms = await mapState(q);
    check(ms.packet && ms.road === 7, `a damaged save with road 999 is clamped: winning level 7 still draws the road (${JSON.stringify(ms)})`);
    await q.waitForTimeout(1300);
    ms = await mapState(q);
    check(ms.arrive === '7' && ms.cur === '7', `... and lands on level 8 (${JSON.stringify(ms)})`);
    await qctx.close();

    // 2. Rotate during the road animation: the map relays out when it ends.
    const { page: r2, ctx: r2ctx } = await open(browser, 'fix-rotate', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await save(r2, { stars: beaten(4), best: {}, sound: false, seen: {}, road: 4 }); await reload(r2);
    await win(r2, 4); await r2.waitForTimeout(900);
    await r2.click('#win-levels'); await r2.waitForTimeout(500);
    const was = await r2.evaluate(() => ({ anim: window.__signalTest.mapAnim, w: document.getElementById('map-track').getBoundingClientRect().width }));
    await r2.setViewportSize({ width: 390, height: 844 });
    await r2.waitForTimeout(1600);
    const rot = await r2.evaluate(() => { const sc = document.getElementById('map-scroll'); return { anim: window.__signalTest.mapAnim, w: document.getElementById('map-track').getBoundingClientRect().width, over: sc.scrollWidth - sc.clientWidth, cur: document.querySelector('.map-node.current')?.dataset.level }; });
    check(was.anim && was.w === 440 && !rot.anim && rot.w <= 390 - 32 && rot.over <= 0 && rot.cur === '5', `rotating during the road animation relays the map out when it ends (${was.w}px to ${rot.w}px, overflow ${rot.over})`);
    await r2.screenshot({ path: `${OUT}/fix-rotate-after-anim-phone.png` });
    // The same while the Next level flow plays, and the highlight survives.
    await r2.setViewportSize({ width: 844, height: 390 }); await r2.waitForTimeout(200);
    await win(r2, 5); await r2.waitForTimeout(900);
    await r2.click('#win-next'); await r2.waitForTimeout(500);
    await r2.setViewportSize({ width: 390, height: 844 });
    await r2.waitForTimeout(1600);
    const rot2 = await r2.evaluate(() => ({ w: document.getElementById('map-track').getBoundingClientRect().width, arrive: document.querySelector('.map-node.arrive')?.dataset.level, focus: document.activeElement?.dataset?.level }));
    check(rot2.w <= 358 && rot2.arrive === '6' && rot2.focus === '6', `rotating during the Next level road: relaid out, level 7 still highlighted and focused (${JSON.stringify(rot2)})`);
    await r2ctx.close();

    // Reduced motion: no road drawing, the map lands on the next circle at once.
    const { page: rm, ctx: rmctx } = await open(browser, 'fix-reduced', { ...phone, reducedMotion: 'reduce' });
    await win(rm, 0); await rm.waitForTimeout(900);
    await rm.click('#win-next'); await rm.waitForTimeout(150);
    ms = await mapState(rm);
    check(ms.onMap && !ms.anim && !ms.packet && ms.arrive === '1' && ms.road === 1, `reduced motion: Next level lands on level 2 at once, with no road animation (${JSON.stringify(ms)})`);
    await rmctx.close();

    // Desktop: a mouse double click on Play.
    const { page: dd, ctx: ddctx } = await open(browser, 'fix-desktop', { viewport: { width: 1280, height: 800 } });
    b = await centre(dd, '#title-play');
    await dd.mouse.dblclick(b.x, b.y); await dd.waitForTimeout(200);
    s2 = await st(dd);
    check(s2 && s2.index === 0 && s2.n === 0 && s2.moves === 0, `mouse double click on Play opens level 1 with an empty board (${s2 && s2.n} towers)`);
    await ddctx.close();
  }

  // Story ("The Keeper of Wren Hollow"): prologue, chapter scenes, skip and
  // fast forward, postcards, the chapter close on the map, the Story log,
  // old saves (no forced scenes, one catch-up offer), the town, settings,
  // reduced motion, frame rate, and screenshots at three sizes.
  {
    const SIZES = [
      ['desktop', { viewport: { width: 1280, height: 800 } }],
      ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
      ['landscape', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
    ];
    const SKEY = 'signal-tower-v2';
    // A save with the first n levels beaten and the story up to date (every
    // scene before that point seen, catch-up already offered).
    const storySave = (page, n, extra = {}) => page.evaluate(([n, extra]) => {
      const stars = {}; for (let i = 0; i < n; i++) stars[i] = 3;
      const lv = (c) => LEVELS.map((l, i) => ((l.chapter || 'basics') === c ? i : -1)).filter((i) => i >= 0);
      const seen = {};
      for (const sc of STORY.scenes) {
        const t = sc.trigger;
        const ok = t.type === 'prologue' ? true : t.type === 'chapterStart' ? lv(t.chapter)[0] < n : t.type === 'chapterEnd' ? lv(t.chapter).slice(-1)[0] < n
          : t.type === 'levelStart' ? t.level - 1 < n : t.type === 'epilogue' ? n >= LEVELS.length : false;
        if (ok) seen[sc.id] = true;
      }
      const done = STORY.town.map((t) => t.chapter).filter((c) => lv(c).slice(-1)[0] < n);
      localStorage.setItem('signal-tower-v2', JSON.stringify({ stars, best: {}, sound: false, seen: { 'callout-0': true }, road: n,
        story: { seen, townShown: done, offered: true, on: true, speed: 'normal', ...extra } }));
    }, [n, extra]);
    const reload = async (page) => { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => window.__signalTest && window.__signalPerf.frames > 5); await page.waitForTimeout(250); };
    const S = (page) => page.evaluate(() => window.__signalTest.story.state);
    const saved = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SKEY);
    const solveHook = (page, i) => page.evaluate((i) => { const g = window.__signalTest; g.startLevel(i); for (const t of g.state.level.solutions[0]) { g.selectType(t.length > 2 ? 'dish' : 'mast'); g.act(t[0], t[1]); for (let f = 0; f < (t[2] || 0); f++) g.act(t[0], t[1]); } }, i);
    const winAndNext = async (page, i) => {
      await solveHook(page, i);
      await page.waitForSelector('#screen-win:not([hidden])');
      await page.waitForTimeout(500);
      // The last level has no Next level button; its Level map button opens the map.
      await page.click(i === 37 ? '#win-levels' : '#win-next');
    };
    const waitScene = (page, id, timeout = 9000) => page.waitForFunction((id) => window.__signalTest.story.state.scene === id, id, { timeout }).then(() => true).catch(() => false);
    const finishLine = async (page) => { if (!(await S(page)).typed) { await page.keyboard.press('Enter'); await page.waitForTimeout(80); } };
    const litLayers = (page, sel) => page.evaluate((sel) => [...new Set([...document.querySelectorAll(`${sel} .tl.on`)].map((g) => g.dataset.chapter))], sel);
    const fps = (page) => page.evaluate(() => new Promise((res) => { const p = window.__signalPerf, f0 = p.frames, t0 = performance.now(); setTimeout(() => res((p.frames - f0) / ((performance.now() - t0) / 1000)), 2000); }));

    // --- Fresh save: prologue, chapter opening, skip, fast forward, keyboard ---
    const { page: s, ctx: sctx } = await open(browser, 'story-phone', SIZES[1][1], { story: true });
    await s.click('#title-play'); await s.waitForTimeout(500);
    let ss = await S(s);
    const dlg = await s.evaluate(() => { const el = document.getElementById('story'); return { role: el.getAttribute('role'), modal: el.getAttribute('aria-modal'), label: el.getAttribute('aria-label'), focus: document.activeElement.classList.contains('st-card'), cardLabel: document.querySelector('.st-card').getAttribute('aria-label'), hiddenText: document.querySelector('.st-text').getAttribute('aria-hidden') }; });
    const level0 = await st(s);
    check(ss.scene === 'prologue' && level0 === null, `fresh save: Play opens the prologue before level 1 (${ss.scene})`);
    check(dlg.role === 'dialog' && dlg.modal === 'true' && dlg.label === 'Story: The Night the Tower Fell' && dlg.focus && dlg.cardLabel === 'Next line, 1 of 6' && dlg.hiddenText === 'true',
      `the scene is a modal dialog named for the scene, focus is on the card ("${dlg.cardLabel}") and the typed text is hidden from screen readers`);
    check(ss.live === 'Wren Hollow, the night after the big storm.', `the live region gets the whole line at once ("${ss.live}")`);
    await s.waitForTimeout(150);
    ss = await S(s);
    check(ss.chars > 0 && ss.chars < 43 || ss.typed, `the line types out (${ss.chars} characters so far)`);
    await s.screenshot({ path: `${OUT}/story-prologue-phone.png` });
    await s.keyboard.press('Enter'); await s.waitForTimeout(60);
    ss = await S(s);
    check(ss.typed && ss.line === 0, 'Enter finishes the typing first');
    await s.keyboard.press('Enter'); await s.waitForTimeout(100);
    ss = await S(s);
    check(ss.line === 1 && ss.live.startsWith('Nell: Well, that'), `Enter then moves to the next line (${ss.live.slice(0, 30)})`);
    // Fast forward: lines run on their own.
    await s.click('.st-ff');
    const ffT0 = Date.now();
    await s.waitForFunction(() => window.__signalTest.story.state.line >= 4, null, { timeout: 8000 }).catch(() => {});
    ss = await S(s);
    check(ss.ff && ss.line >= 4 && (await s.getAttribute('.st-ff', 'aria-pressed')) === 'true', `fast forward auto-advances (line ${ss.line + 1} after ${Date.now() - ffT0}ms)`);
    await s.keyboard.press('f');
    ss = await S(s);
    check(!ss.ff, 'F toggles fast forward off');
    // Esc skips the rest; the scene counts as seen; level 1 loads and its opening plays.
    await s.keyboard.press('Escape');
    const opened = await waitScene(s, 'basics.start', 3000);
    let sv = await saved(s);
    check(sv.story.seen.prologue === true && opened && (await st(s))?.index === 0, 'Esc skips the prologue (marked seen) and level 1 opens with Main Street\'s opening');
    await s.waitForTimeout(400);
    const rings = await s.evaluate(() => {
      const card = document.querySelector('.st-card').getBoundingClientRect();
      const rs = [...document.querySelectorAll('.st-ring:not(.outer)')].map((r) => r.getBoundingClientRect());
      const g = window.__signalTest.state.grid, houses = g.rows.flat().filter((t) => t === 'H').length;
      return { n: rs.length, houses, under: rs.filter((r) => r.left < card.right && r.right > card.left && r.top < card.bottom && r.bottom > card.top).length, colour: getComputedStyle(document.querySelector('.st-ring')).borderTopColor };
    });
    check(rings.n === rings.houses && rings.under === 0 && rings.colour === 'rgb(255, 210, 122)', `"[focus H]" rings every house in Nell's colour, none under the card (${rings.n} rings, ${rings.houses} houses)`);
    // Board input is blocked while a scene plays, and game keys are ignored.
    let t1 = await tile(s, 1, 1);
    await s.touchscreen.tap(t1.x, t1.y); await s.waitForTimeout(80);
    await s.keyboard.press('z'); await s.keyboard.press('r');
    check((await st(s)).n === 0 && (await S(s)).scene === 'basics.start', 'taps and game keys during a scene never touch the board');
    // Skip button.
    await s.click('.st-skip'); await s.waitForTimeout(400);
    sv = await saved(s);
    check(!(await S(s)).scene && sv.story.seen['basics.start'] === true, 'Skip ends the scene and marks it seen');
    await s.waitForTimeout(500);
    check(!(await s.locator('#callout').isHidden()), 'level 1\'s one-time tip shows after the scene');
    // Hold to fast forward (touch): replay from the Story log, hold 600ms.
    await s.evaluate(() => window.__signalTest.story.play(['basics.start'], { replay: true, backdrop: 'town', town: [] }));
    await s.waitForTimeout(400);
    const cdp = await sctx.newCDPSession(s);
    await touch(cdp, 'touchStart', 195, 400);
    await s.waitForTimeout(2600);
    ss = await S(s);
    await touch(cdp, 'touchEnd', 195, 400); await s.waitForTimeout(100);
    check(ss.line >= 2, `holding a finger down fast-forwards (line ${ss.line + 1} after 2.6s)`);
    await s.keyboard.press('Escape'); await s.waitForTimeout(300);
    // Replaying a beaten level plays nothing.
    await s.evaluate(() => { const g = window.__signalTest; g.progress.stars[0] = 3; g.progress.stars[8] = 3; });
    for (const i of [0, 8]) {
      await s.evaluate((i) => window.__signalTest.startLevel(i), i); await s.waitForTimeout(250);
      check(!(await S(s)).scene, `replaying beaten level ${i + 1} triggers no scene`);
    }
    // Level 9's mid-chapter scene on first entry.
    await storySave(s, 8); await reload(s);
    await s.evaluate(() => window.__signalTest.startLevel(8));
    check(await waitScene(s, 'basics.mayor', 2000), 'entering level 9 for the first time plays "The Mayor Drops By"');
    const fpsScene = await fps(s);
    check(fpsScene > 55, `60fps while a scene plays (${fpsScene.toFixed(1)} fps)`);
    await s.keyboard.press('Escape'); await s.waitForTimeout(300);

    // --- Postcard after a first-time win, and it never blocks the map ---
    await storySave(s, 1); await reload(s);
    await winAndNext(s, 1);
    await s.waitForSelector('.postcard', { timeout: 5000 }).catch(() => {});
    const pc = await s.evaluate(() => { const p = document.querySelector('.postcard'); return p && { role: p.getAttribute('role'), text: p.textContent }; });
    check(pc && pc.role === 'status' && pc.text === 'Level 2, Stone WallThe garden wall kept the signal out. Not anymore.', `first win of level 2: the postcard shows its line on the map (${pc && pc.text})`);
    await s.screenshot({ path: `${OUT}/story-postcard-phone.png` });
    let nb = await s.evaluate(() => { const r = document.querySelector('.map-node.arrive').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await s.touchscreen.tap(nb.x, nb.y); await s.waitForTimeout(300);
    check((await st(s))?.index === 2, 'the next circle can be tapped while the postcard shows');
    await winAndNext(s, 1); await s.waitForTimeout(2500);
    check(!(await s.locator('.postcard').count()), 'a replayed win shows no postcard');

    // --- Chapter close on the map after level 15 ---
    await storySave(s, 14); await reload(s);
    await winAndNext(s, 14);
    await s.waitForTimeout(1600);
    const held = await s.evaluate(() => ({ anim: window.__signalTest.mapAnim, banner: document.querySelector('.map-banner[data-chapter="1"]').classList.contains('locked'), pc: !!document.querySelector('.postcard') }));
    check(held.anim && held.banner && held.pc, `after level 15 the road stops at the Quiet Hours banner (still locked) while the postcard shows (${JSON.stringify(held)})`);
    check(await waitScene(s, 'basics.end', 5000), 'then "The Tower Stands" plays over the map');
    await s.waitForTimeout(500);
    const bd = await s.evaluate(() => ({ backdrop: document.querySelector('.st-backdrop').hidden, map: !document.getElementById('screen-levels').hidden }));
    check(bd.backdrop && bd.map, 'the chapter end plays over the dimmed map');
    for (let i = 0; i < 12 && (await S(s)).scene; i++) { await s.keyboard.press('Enter'); await s.waitForTimeout(120); }
    await s.waitForSelector('.story-card', { timeout: 3000 }).catch(() => {});
    const tc = await s.evaluate(() => { const c = document.querySelector('.story-card'); return c && { label: c.getAttribute('aria-label'), role: c.getAttribute('role'), reveal: c.querySelector('.tl.reveal')?.dataset.chapter, on: [...new Set([...c.querySelectorAll('.tl.on')].map((g) => g.dataset.chapter))], body: c.querySelector('.sc-body').textContent }; });
    check(tc && tc.label === 'Main Street is lit again.' && tc.role === 'dialog' && tc.reveal === 'basics' && tc.on.join() === 'basics' && tc.body === 'Main Street is connected.', `the town card follows, lighting Main Street (${JSON.stringify(tc)})`);
    await s.screenshot({ path: `${OUT}/story-towncard-phone.png` });
    await s.touchscreen.tap(195, 300); await s.waitForTimeout(300);
    check(await s.locator('.story-card').count() === 1, 'the town card stays up for at least 1.2s');
    await s.waitForTimeout(1000);
    await s.touchscreen.tap(195, 300);
    await s.waitForSelector('.map-node.arrive[data-level="15"]', { timeout: 6000 }).catch(() => {});
    const after15 = await s.evaluate(() => ({ banner: !document.querySelector('.map-banner[data-chapter="1"]').classList.contains('locked'), arrive: document.querySelector('.map-node.arrive')?.dataset.level, done: document.querySelector('.map-banner[data-chapter="0"]').classList.contains('done'), tag: document.querySelector('.map-banner[data-chapter="0"] .tag')?.textContent }));
    sv = await saved(s);
    check(after15.banner && after15.arrive === '15' && sv.story.seen['basics.end'] === true, `then the banner opens and the road lands on level 16 (${JSON.stringify(after15)})`);
    check(after15.done && after15.tag === 'Connected', 'Main Street\'s banner is marked Connected');
    // Level 16 opens with Juniper's scene, with the observatory ringed.
    nb = await s.evaluate(() => { const r = document.querySelector('.map-node.arrive').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await s.touchscreen.tap(nb.x, nb.y);
    check(await waitScene(s, 'quiet.start', 2000), 'tapping level 16 plays "Quiet, Please" on the board');
    await s.keyboard.press('Escape'); await s.waitForTimeout(300);
    // The title town lights Main Street, revealed once.
    await s.keyboard.press('Escape'); await s.click('#pause-levels'); await s.waitForTimeout(300);
    await s.click('#levels-back'); await s.waitForTimeout(300);
    const tt = await s.evaluate(() => ({ on: [...document.querySelectorAll('#title-hero .tl.on')].map((g) => g.dataset.chapter), reveal: document.querySelector('#title-hero .tl.reveal')?.dataset.chapter }));
    check(tt.on.join() === 'basics' && tt.reveal === 'basics', `the start screen town lights Main Street, with the reveal (${JSON.stringify(tt)})`);
    await s.click('#title-levels'); await s.waitForTimeout(300); await s.click('#levels-back'); await s.waitForTimeout(300);
    check(!(await s.evaluate(() => document.querySelector('#title-hero .tl.reveal'))), 'the reveal plays only once');

    // --- Story log ---
    await s.click('#title-levels'); await s.waitForTimeout(300);
    await s.click('#map-story'); await s.waitForTimeout(250);
    const log = await s.evaluate(() => ({
      rows: document.querySelectorAll('.story-row').length, seen: document.querySelectorAll('.story-row:not(.locked)').length,
      lockText: document.querySelector('.story-row.locked .sr-lock')?.textContent, groups: [...document.querySelectorAll('.story-list h3')].map((h) => h.textContent),
      where: document.querySelector('.story-row[data-scene="basics.mayor"] .sr-where').textContent,
    }));
    check(log.rows === 19 && log.seen === 5 && log.groups.length === 9 && log.groups[0] === 'Prologue' && log.groups[8] === 'Epilogue' && log.where === 'Before level 9',
      `the Story log lists 19 scenes by chapter, 5 seen, the rest locked ("${log.lockText}") (${JSON.stringify(log)})`);
    await s.screenshot({ path: `${OUT}/story-log-phone.png` });
    await s.click('.story-row[data-scene="basics.end"] .sr-read'); await s.waitForTimeout(150);
    const tr = await s.evaluate(() => [...document.querySelectorAll('#story-transcript p')].map((p) => p.textContent));
    const want = await s.evaluate(() => STORY.scenes.find((x) => x.id === 'basics.end').lines.map((l) => `${STORY.speakers[l.speaker].name}: ${l.text}`));
    check(JSON.stringify(tr) === JSON.stringify(want), `Read shows the transcript, word for word (${tr.length} lines)`);
    await s.click('#story-back'); await s.waitForTimeout(100);
    const before = JSON.stringify(await saved(s));
    await s.click('.story-row[data-scene="basics.mayor"] .sr-play'); await s.waitForTimeout(400);
    ss = await S(s);
    const town = await s.evaluate(() => !document.querySelector('.st-backdrop').hidden && !!document.querySelector('.st-backdrop .town-svg'));
    check(ss.scene === 'basics.mayor' && town, 'Play replays the scene over the town');
    for (let i = 0; i < 10 && (await S(s)).scene; i++) { await s.keyboard.press('Enter'); await s.waitForTimeout(100); }
    await s.waitForTimeout(300);
    check(JSON.stringify(await saved(s)) === before && !(await s.locator('#screen-story').isHidden()), 'a replay never changes the save, and returns to the log');
    await s.click('#story-back'); await s.waitForTimeout(300);
    // Banner tap replays the chapter opening.
    await s.click('.map-banner.replay[data-chapter="0"]'); await s.waitForTimeout(400);
    check((await S(s)).scene === 'basics.start', 'tapping an open chapter banner replays its opening');
    await s.keyboard.press('Escape'); await s.waitForTimeout(300);

    // --- Settings: story off, then no scenes; text speed instant ---
    await storySave(s, 0, { seen: {} }); await reload(s);
    await s.click('#title-settings'); await s.click('#story-toggle'); await s.selectOption('#story-speed', 'instant'); await s.click('#settings-back');
    await s.click('#title-play'); await s.waitForTimeout(500);
    sv = await saved(s);
    check(!(await S(s)).scene && (await st(s))?.index === 0 && sv.story.seen.prologue && sv.story.seen['basics.start'] && sv.story.on === false && sv.story.speed === 'instant',
      'with Story scenes off, Play goes straight to level 1 and the scenes still unlock in the log');
    await sctx.close();

    // --- Old saves: filled in silently, no forced scenes, one catch-up offer ---
    {
      const { page: o, ctx: octx } = await open(browser, 'story-oldsave', SIZES[0][1], { story: true });
      await o.evaluate(() => { const stars = {}; for (let i = 0; i < 20; i++) stars[i] = 3; localStorage.setItem('signal-tower-v2', JSON.stringify({ stars, best: {}, sound: false, seen: {}, road: 20 })); });
      await reload(o);
      const prog = await o.evaluate(() => window.__signalTest.progress.story);
      check(prog.seen.prologue && prog.seen['basics.end'] && prog.seen['quiet.end'] && prog.seen['busy.start'] && !prog.seen['busy.end'] && !prog.offered && prog.townShown.join() === 'basics,quiet',
        `an old save (20 levels) is filled in silently: past scenes seen, town lit to chapter 2 (${Object.keys(prog.seen).length} seen)`);
      check((await litLayers(o, '#title-hero')).join() === 'basics,quiet' && !(await o.evaluate(() => document.querySelector('#title-hero .tl.reveal'))), 'its start screen already shows Main Street and the observatory lit, with no reveal');
      await o.click('#title-play'); await o.waitForTimeout(600);
      check(!(await S(o)).scene && (await st(o))?.index === 20, 'Continue goes straight into level 21 with no scene');
      await o.keyboard.press('Escape'); await o.click('#pause-levels'); await o.waitForTimeout(500);
      const cu = await o.evaluate(() => { const c = document.querySelector('.story-card'); return c && { label: c.getAttribute('aria-label'), buttons: [...c.querySelectorAll('button')].map((b) => b.textContent) }; });
      check(cu && cu.buttons.join() === 'Story so far (about 2 min),Later', `the first map visit offers the story so far, with a Later button (${JSON.stringify(cu)})`);
      await o.waitForTimeout(400);
      await o.screenshot({ path: `${OUT}/story-catchup-desktop.png` });
      await o.click('.story-card button:nth-child(2)'); await o.waitForTimeout(400);
      check(!(await S(o)).scene && !(await o.locator('.story-card').count()) && (await saved(o)).story.offered === true, 'Later closes it, plays nothing, and is remembered');
      await o.click('#levels-back'); await o.click('#title-levels'); await o.waitForTimeout(500);
      check(!(await o.locator('.story-card').count()), 'the offer never comes back');
      // "Story so far" plays the prologue, then each finished chapter's close, as one sequence.
      await o.evaluate(() => { const p = JSON.parse(localStorage.getItem('signal-tower-v2')); p.story.offered = false; localStorage.setItem('signal-tower-v2', JSON.stringify(p)); });
      await reload(o); await o.click('#title-levels'); await o.waitForTimeout(500);
      await o.click('.story-card .btn.primary'); await o.waitForTimeout(400);
      const seq = [(await S(o)).scene];
      for (let i = 0; i < 40 && (await S(o)).scene; i++) { await o.keyboard.press('Enter'); await o.keyboard.press('Enter'); await o.waitForTimeout(60); const sc = (await S(o)).scene; if (sc && sc !== seq[seq.length - 1]) seq.push(sc); }
      check(seq.join() === 'prologue,basics.end,quiet.end', `"Story so far" plays the prologue then each finished chapter's close (${seq.join(', ')})`);
      // Skip ends the whole sequence.
      await o.evaluate(() => { const p = JSON.parse(localStorage.getItem('signal-tower-v2')); p.story.offered = false; localStorage.setItem('signal-tower-v2', JSON.stringify(p)); });
      await reload(o); await o.click('#title-levels'); await o.waitForTimeout(500);
      await o.click('.story-card .btn.primary'); await o.waitForTimeout(400);
      await o.click('.st-skip'); await o.waitForTimeout(400);
      check(!(await S(o)).scene, 'Skip ends the whole "story so far" sequence');
      // A finished old save: only the offer; the epilogue is in the log.
      await o.evaluate(() => { const stars = {}; for (let i = 0; i < 38; i++) stars[i] = 3; localStorage.setItem('signal-tower-v2', JSON.stringify({ stars, best: {}, sound: false, seen: {}, road: 38 })); });
      await reload(o);
      check((await litLayers(o, '#title-hero')).length === 7, 'a finished old save shows the whole town lit');
      await o.click('#title-levels'); await o.waitForTimeout(500);
      check(await o.locator('.story-card').count() === 1 && !(await S(o)).scene, 'and only the catch-up offer on the map');
      await octx.close();
    }

    // --- The last chapter: closing scene, town card, epilogue, ending card ---
    {
      const { page: e, ctx: ectx } = await open(browser, 'story-ending', SIZES[0][1], { story: true });
      await storySave(e, 37); await reload(e);
      await winAndNext(e, 37);
      check(await waitScene(e, 'mixed.end', 9000), 'after level 38: "Live from the Hill" plays on the map');
      await e.click('.st-skip');
      await e.waitForSelector('.story-card', { timeout: 3000 }).catch(() => {});
      await e.waitForTimeout(1300); await e.mouse.click(640, 400);
      check(await waitScene(e, 'epilogue', 3000), 'then the town card, then the epilogue');
      await e.waitForTimeout(600);
      const ep = await e.evaluate(() => ({ lit: [...new Set([...document.querySelectorAll('.st-backdrop .tl.on')].map((g) => g.dataset.chapter))].length, settle: document.querySelector('.st-backdrop').classList.contains('settle') }));
      check(ep.lit === 7 && ep.settle, `the epilogue plays over the fully lit town (${JSON.stringify(ep)})`);
      await e.screenshot({ path: `${OUT}/story-epilogue-desktop.png` });
      await e.click('.st-skip');
      await e.waitForSelector('.story-card', { timeout: 3000 }).catch(() => {});
      const end = await e.evaluate(() => { const c = document.querySelector('.story-card'); return c && { title: c.querySelector('.sc-title').textContent, body: c.querySelector('.sc-body').textContent, buttons: [...c.querySelectorAll('button')].map((b) => b.textContent) }; });
      check(end && end.title === 'Wren Hollow is on air.' && end.body === 'All 38 levels connected.' && end.buttons.join() === 'Story,Level map', `the ending card: ${JSON.stringify(end)}`);
      await e.waitForTimeout(500);
      await e.screenshot({ path: `${OUT}/story-ending-desktop.png` });
      await e.click('.story-card .btn.primary'); await e.waitForTimeout(400);
      const sv2 = await saved(e);
      check(sv2.story.seen['mixed.end'] && sv2.story.seen.epilogue && !(await e.locator('#screen-levels').isHidden()), 'Level map closes it; the closing and epilogue are seen');
      await ectx.close();
    }

    // --- Reduced motion: whole lines at once, still town ---
    {
      const { page: r, ctx: rctx } = await open(browser, 'story-reduced', { ...SIZES[1][1], reducedMotion: 'reduce' }, { story: true });
      await r.click('#title-play'); await r.waitForTimeout(300);
      const rs = await S(r);
      const still = await r.evaluate(() => getComputedStyle(document.querySelector('.st-backdrop .waves circle')).animationName);
      check(rs.scene === 'prologue' && rs.typed, 'reduced motion: the whole line shows at once (no typing)');
      check(still === 'none', `reduced motion: the town's animations are off (${still})`);
      await rctx.close();
    }

    // --- Screenshots at three sizes: dialogue card, chapter end on the map, postcard, start-screen town at 0, 3 and 7 chapters ---
    for (const [label, opts] of SIZES) {
      const { page: p, ctx: pctx } = await open(browser, `story-shots-${label}`, opts, { story: true });
      for (const n of [0, 23, 38]) {
        await storySave(p, n); await reload(p);
        const lit = await litLayers(p, '#title-hero');
        const expect = { 0: 0, 23: 3, 38: 7 }[n];
        check(lit.length === expect, `${label}: start screen town with ${n} levels beaten lights ${expect} landmarks (${lit.join(', ') || 'none'})`);
        await p.waitForTimeout(400);
        await p.screenshot({ path: `${OUT}/story-town-${expect}-${label}.png` });
      }
      // Dialogue card with a focus ring (level 16, the observatory).
      await storySave(p, 15); await reload(p);
      await p.evaluate(() => window.__signalTest.startLevel(15));
      await waitScene(p, 'quiet.start', 2000);
      await p.waitForTimeout(400); await finishLine(p); await p.waitForTimeout(300);
      const lay = await p.evaluate(() => {
        const c = document.querySelector('.st-card').getBoundingClientRect(), t = document.querySelector('.st-text');
        const rs = [...document.querySelectorAll('.st-ring')].map((x) => x.getBoundingClientRect());
        return { inView: c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight, h: c.height, fits: t.scrollHeight <= t.clientHeight + 1,
          under: rs.filter((r) => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top).length, rings: rs.length };
      });
      check(lay.inView && lay.fits && lay.under === 0 && lay.rings >= 2, `${label}: the card is on screen, its text fits and no focus ring is under it (${JSON.stringify(lay)})`);
      await p.screenshot({ path: `${OUT}/story-card-${label}.png` });
      const h0 = lay.h;
      await p.keyboard.press('Enter'); await p.waitForTimeout(200); await finishLine(p); await p.waitForTimeout(250);
      const h1 = await p.evaluate(() => document.querySelector('.st-card').getBoundingClientRect().height);
      check(Math.abs(h1 - h0) < 1, `${label}: the card keeps its height between lines (${h0} and ${h1})`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      // Postcard.
      await storySave(p, 2); await reload(p);
      await winAndNext(p, 2);
      await p.waitForSelector('.postcard', { timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(700);
      const pcl = await p.evaluate(() => {
        const r = document.querySelector('.postcard')?.getBoundingClientRect(), cta = document.getElementById('map-play').getBoundingClientRect();
        const n = document.querySelector('.map-node[data-level="3"]').getBoundingClientRect();
        return r && { inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0, overCta: r.bottom > cta.top, nodeClear: n.bottom <= r.top || n.top >= r.bottom || n.right <= r.left || n.left >= r.right };
      });
      check(pcl && pcl.inView && !pcl.overCta && pcl.nodeClear, `${label}: the postcard sits on screen above the Play button and clear of the next circle (${JSON.stringify(pcl)})`);
      await p.screenshot({ path: `${OUT}/story-postcard-${label}.png` });
      // Chapter end on the map.
      await storySave(p, 18); await reload(p);
      await winAndNext(p, 18);
      await waitScene(p, 'quiet.end', 9000);
      await p.waitForTimeout(500); await finishLine(p); await p.waitForTimeout(250);
      await p.screenshot({ path: `${OUT}/story-chapter-end-${label}.png` });
      await p.click('.st-skip');
      await p.waitForSelector('.story-card', { timeout: 3000 }).catch(() => {});
      await p.waitForTimeout(1400);
      const tcl = await p.evaluate(() => { const r = document.querySelector('.story-card').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; });
      check(tcl, `${label}: the town card fits on screen`);
      await p.screenshot({ path: `${OUT}/story-towncard-${label}.png` });
      await pctx.close();
    }
  }

  // Regression: damaged saves fall back safely.
  for (const bad of ['{"stars":null}', '{"stars":[1,2],"best":"x","seen":5}', '[]', 'not json', '{"stars":{"0":"3","1":99,"2":2}}']) {
    const { page: c } = await open(browser, 'badsave', { viewport: { width: 800, height: 600 } });
    await c.evaluate((bad) => localStorage.setItem('signal-tower-v2', bad), bad);
    const before = errors.length;
    await c.reload({ waitUntil: 'domcontentloaded' });
    const ok = await c.waitForFunction(() => window.__signalTest && window.__signalPerf.frames > 5, null, { timeout: 5000 }).then(() => true).catch(() => false);
    await c.click('#title-levels').catch(() => {});
    await c.waitForTimeout(100);
    const total = ok ? await c.textContent('#star-total') : 'none';
    const expectStars = bad.includes('"2":2') ? 2 : 0;
    check(ok && errors.length === before && total === `${expectStars} / ${N * 3}`, `damaged save ${bad} loads safely (stars ${total})`);
    await c.context().close();
  }

  // Layout: tray and tools never overlap the board area.
  for (const [page, label] of [[d, 'desktop'], [m, 'phone'], [l, 'landscape']]) {
    const ov = await page.evaluate(() => {
      window.__signalTest.startLevel(37);
      const r = (sel) => document.querySelector(sel).getBoundingClientRect();
      const b = window.__signalTest.board, c = r('#board');
      const boardRect = { left: c.left + b.ox, top: c.top + b.oy, right: c.left + b.ox + b.boardW, bottom: c.top + b.oy + b.boardH };
      const hit = (a) => a.left < boardRect.right && a.right > boardRect.left && a.top < boardRect.bottom && a.bottom > boardRect.top;
      return { tray: hit(r('#tray')), tools: hit(r('#hud-bottom .tools')), fits: r('#hud-bottom').bottom <= window.innerHeight + 1 };
    });
    check(!ov.tray && !ov.tools && ov.fits, `${label}: tray and tools sit clear of the board and inside the screen`);
  }

  console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors or warnings');
  console.log(failures ? `${failures} FAILED` : 'ALL CHECKS PASSED');
  await browser.close();
  process.exit(failures || errors.length ? 1 : 0);
})();
