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

async function open(browser, name, opts) {
  const ctx = await browser.newContext(opts);
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
    if (i < N - 1) { await d.click('#win-next'); await d.waitForTimeout(250); }
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
        await q.waitForTimeout(150);
        const tiles = await pickTiles(q);
        for (const [x, y] of tiles) {
          for (const [u, v] of offsets) {
            total++;
            await q.evaluate((i) => window.__signalTest.startLevel(i), level);
            await q.waitForTimeout(40);
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

  // Regression: a resize mid-drag retargets the drop to the tile under the pointer.
  {
    const { page: r } = await open(browser, 'resize', { viewport: { width: 1280, height: 800 } });
    await r.evaluate(() => window.__signalTest.startLevel(1));
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
