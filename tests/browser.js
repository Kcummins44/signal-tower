// End-to-end browser test: plays all 15 levels with the mouse, level 15 with
// touch, checks undo/reset/locking/saving/sound, measures frame time, and
// saves screenshots. See README for how to run it.
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
  await page.goto(URL);
  await page.waitForTimeout(500);
  return { ctx, page };
}
const tile = (page, x, y) => page.evaluate(([x, y]) => {
  const b = window.__signalTest.board, r = document.getElementById('board').getBoundingClientRect();
  return { x: r.left + b.ox + (x + 0.5) * b.tile, y: r.top + b.oy + (y + 0.5) * b.tile };
}, [x, y]);
const st = (page) => page.evaluate(() => { const s = window.__signalTest.state; return s && { index: s.index, towers: s.towers.length, moves: s.moves, won: s.won }; });

(async () => {
  const browser = await chromium.launch();

  // ---------- Desktop: whole game with the mouse ----------
  const { page: d } = await open(browser, 'desktop', { viewport: { width: 1280, height: 800 } });
  await d.click('#title-levels');
  check(await d.locator('.level-card').nth(1).isDisabled(), 'fresh save: level 2 is locked');
  await d.click('#levels-back');
  await d.click('#title-play');
  // Undo and reset on level 1.
  let p = await tile(d, 0, 1); await d.mouse.click(p.x, p.y);
  await d.click('#undo-btn');
  let s = await st(d);
  check(s.towers === 0 && s.moves === 2, `undo removes the tower and counts a move (towers ${s.towers}, moves ${s.moves})`);
  p = await tile(d, 2, 0); await d.mouse.click(p.x, p.y);   // house: invalid
  s = await st(d);
  check(s.towers === 0 && s.moves === 2, 'tapping a house does nothing');
  await d.click('#reset-btn');
  s = await st(d);
  check(s.moves === 0 && s.towers === 0, 'reset clears towers and moves');

  for (let i = 0; i < 15; i++) {
    const sol = await d.evaluate(() => window.__signalTest.state.level.solutions[0]);
    for (const [x, y] of sol) { p = await tile(d, x, y); await d.mouse.click(p.x, p.y); await d.waitForTimeout(40); }
    await d.waitForSelector('#screen-win:not([hidden])', { timeout: 4000 }).catch(() => {});
    await d.waitForTimeout(1300);
    const stars = await d.locator('#win-stars .star.on').count();
    const lit = await d.textContent('#houses-lit'), total = await d.textContent('#houses-total');
    check(stars === 3 && lit === total, `level ${i + 1}: solved with ${sol.length} towers, ${lit}/${total} houses, ${stars} stars`);
    if (i === 14) await d.screenshot({ path: `${OUT}/final-win.png` });
    if (i < 14) { await d.click('#win-next'); await d.waitForTimeout(250); }
  }
  check(await d.locator('#win-next').isHidden(), 'last level hides "Next level"');
  await d.click('#win-levels'); await d.waitForTimeout(300);
  check((await d.textContent('#star-total')) === '45 / 45', `star total reads ${await d.textContent('#star-total')}`);
  check((await d.locator('.level-card:disabled').count()) === 0, 'all levels unlocked');
  await d.screenshot({ path: `${OUT}/levels-complete.png` });

  // Saved progress and mute survive a reload.
  await d.click('#levels-back');
  await d.click('#title-settings');
  await d.click('#sound-toggle');
  await d.reload(); await d.waitForTimeout(500);
  const saved = await d.evaluate(() => JSON.parse(localStorage.getItem('signal-tower-v2')));
  check(Object.values(saved.stars).filter((v) => v === 3).length === 15 && saved.sound === false, 'progress and sound setting persist after reload');
  check((await d.getAttribute('#mute-btn use', 'href')) === '#i-mute', 'mute icon shows muted state');
  check((await d.textContent('#title-play-label')) === 'Play', 'all done, title says Play: ' + `title button: "${await d.textContent('#title-play-label')}"`);
  // Sound on: playing every effect must not throw.
  await d.click('#title-settings'); await d.click('#sound-toggle');
  const soundOk = await d.evaluate(() => {
    try { ['click', 'place', 'remove', 'connect', 'invalid', 'undo', 'hint', 'win'].forEach((n) => window.SignalAudio.play(n)); window.SignalAudio.play('star', 2); return true; }
    catch (e) { return e.message; }
  });
  check(soundOk === true, 'all sound effects play without errors');

  // ---------- Phone: touch taps ----------
  const { page: m } = await open(browser, 'phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await m.evaluate(() => window.__signalTest.startLevel(14));
  await m.waitForTimeout(300);
  const sol = await m.evaluate(() => window.__signalTest.state.level.solutions[0]);
  for (const [x, y] of sol) { const t = await tile(m, x, y); await m.touchscreen.tap(t.x, t.y); await m.waitForTimeout(60); }
  await m.waitForTimeout(400);
  s = await st(m);
  check(s.won && s.towers === sol.length, `phone: level 15 solved by touch (${s.towers} towers, moves ${s.moves})`);

  // Performance: level 15 fully built (5 towers, 14 links) at 3x DPR.
  const perf = async (page, label) => {
    await page.evaluate(() => { window.__signalTest.startLevel(14); });
    await page.evaluate(() => { const g = window.__signalTest; const sol = g.state.level.solutions[0]; sol.slice(0, 4).forEach(([x, y]) => g.act(x, y)); });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => new Promise((res) => {
      const p = window.__signalPerf; const f0 = p.frames, m0 = p.renderMs, t0 = performance.now();
      setTimeout(() => res({ fps: (p.frames - f0) / ((performance.now() - t0) / 1000), ms: (p.renderMs - m0) / (p.frames - f0) }), 3000);
    }));
    check(r.fps > 55 && r.ms < 8, `${label}: ${r.fps.toFixed(1)} fps, ${r.ms.toFixed(2)} ms render per frame`);
  };
  await perf(m, 'phone 390x844 @3x');
  await perf(d, 'desktop 1280x800 @1x');

  // Landscape phone layout.
  const { page: l } = await open(browser, 'landscape', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await l.evaluate(() => window.__signalTest.startLevel(9));
  await l.waitForTimeout(500);
  await l.screenshot({ path: `${OUT}/landscape.png` });
  await m.screenshot({ path: `${OUT}/phone-perf-state.png` });

  console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'no console errors or warnings');
  console.log(failures ? `${failures} FAILED` : 'ALL CHECKS PASSED');
  await browser.close();
  process.exit(failures || errors.length ? 1 : 0);
})();
