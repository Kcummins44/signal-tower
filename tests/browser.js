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
// Touch lifts the ghost above the finger: to aim at a tile, put the finger
// below it by the lift distance.
const lifted = (p) => ({ x: p.x, y: p.y + Math.max(56, 1.1 * p.size) });

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
  await d.click('#title-levels');
  check(await d.locator('.level-card').nth(1).isDisabled(), 'fresh save: level 2 is locked');
  check((await d.locator('.chapter-head').count()) === 7, `level select shows 7 chapter headers (${await d.locator('.chapter-head').count()})`);
  check((await d.locator('.chapter-head.locked').count()) === 6, 'fresh save: chapters 2 to 7 are locked');
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
  await d.click('#win-levels'); await d.waitForTimeout(300);
  check((await d.textContent('#star-total')) === `${N * 3} / ${N * 3}`, `star total reads ${await d.textContent('#star-total')}`);
  check((await d.locator('.level-card:disabled').count()) === 0 && (await d.locator('.chapter-head.locked').count()) === 0, 'all levels and chapters unlocked');
  await d.screenshot({ path: `${OUT}/levels-complete.png` });
  await d.evaluate(() => document.querySelector('.levels-panel').parentElement.scrollTo(0, 1e5));
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
  check((await d.textContent('#title-play-label')) === 'Play', 'all done, title says Play: ' + `title button: "${await d.textContent('#title-play-label')}"`);
  // Old saves (15 levels, no "seen" field) still load.
  await d.evaluate(() => {
    const stars = {}; for (let i = 0; i < 15; i++) stars[i] = 3;
    localStorage.setItem('signal-tower-v2', JSON.stringify({ stars, best: {}, sound: false }));
  });
  await d.reload({ waitUntil: 'domcontentloaded' }); await d.waitForFunction(() => window.__signalTest); await d.waitForTimeout(300);
  check((await d.textContent('#title-play-label')) === 'Continue: level 16', `an old 15-level save continues at level 16 ("${await d.textContent('#title-play-label')}")`);
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

  // Touch drag from the tray, with the ghost lifted above the finger.
  await m.evaluate(() => window.__signalTest.startLevel(1));
  await m.waitForTimeout(250);
  let target = await tile(m, 1, 2);
  await touchDrag(m, cdp, await chip(m, 'mast'), lifted(target), { drop: false });
  const tmid = await m.evaluate(() => window.__signalTest.drag);
  check(tmid && tmid.target && tmid.target.join() === '1,2', `touch drag targets the tile under the lifted ghost (${tmid && tmid.target})`);
  await m.screenshot({ path: `${OUT}/drag-phone.png` });
  await touch(cdp, 'touchEnd', 0, 0); await m.waitForTimeout(100);
  s = await st(m);
  check(s.n === 1 && s.moves === 1 && s.towers[0].join() === '1,2', 'touch drop places the tower (1 move)');
  // Touch move.
  const from = await tile(m, 1, 2);
  target = await tile(m, 0, 3);
  await touchDrag(m, cdp, from, lifted(target));
  s = await st(m);
  check(s.towers[0].join() === '0,3' && s.moves === 2, `touch drag moves a placed tower (now ${s.towers[0].join()}, moves ${s.moves})`);
  // Touch remove: drag off the board onto the tray.
  await touchDrag(m, cdp, await tile(m, 0, 3), await chip(m, 'mast'));
  s = await st(m);
  check(s.n === 0 && s.moves === 3, 'touch drag onto the tray removes the tower (1 move)');
  // Hold to place: the held tower lifts, release builds.
  target = await tile(m, 5, 2);
  await touchDrag(m, cdp, lifted(target), lifted(target), { hold: 400 });
  s = await st(m);
  check(s.n === 1 && s.towers[0].join() === '5,2' && s.moves === 4, `hold and release builds under the lifted ghost (${s.towers.map(String)})`);
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
  await touchDrag(m, cdp, await chip(m, 'dish'), lifted(await tile(m, 3, 2)));
  const dt = await tile(m, 3, 2);
  await m.touchscreen.tap(dt.x, dt.y); await m.waitForTimeout(80);
  await m.touchscreen.tap(dt.x, dt.y); await m.waitForTimeout(80);
  s = await st(m);
  check(s.towers[0][2] === 2 && s.moves === 1, `touch taps turn a dish for free (facing ${s.towers[0][2]}, moves ${s.moves})`);
  // Mid-drag of a dish over the board, for the screenshot.
  await touchDrag(m, cdp, await chip(m, 'mast'), lifted(await tile(m, 4, 0)), { drop: false });
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
  await touchDrag(m, cdp, await chip(m, 'mast'), lifted(await tile(m, 4, 4)), { drop: false });
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
  await touchDrag(l, lcdp, await chip(l, 'dish'), lifted(await tile(l, 3, 3)), { drop: false });
  const lmid = await l.evaluate(() => window.__signalTest.drag);
  check(!!(lmid && lmid.target), 'landscape: dragging from the side tray reaches the board');
  await l.screenshot({ path: `${OUT}/drag-landscape.png` });
  await touch(lcdp, 'touchEnd', 0, 0); await l.waitForTimeout(100);
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
