// Game controller: screens, input, undo, hints, stars and saved progress.
(function () {
  'use strict';
  const L = window.SignalLogic;
  const Audio = window.SignalAudio;
  const $ = (id) => document.getElementById(id);

  const STORAGE_KEY = 'signal-tower-v2';
  const app = $('app');
  const canvas = $('board');
  const board = new window.SignalBoard(canvas);

  // ---------- Saved progress ----------
  const progress = load();
  function load() {
    const fallback = { stars: {}, best: {}, sound: true };
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return data && typeof data === 'object' ? { ...fallback, ...data } : fallback;
    } catch { return fallback; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch { /* private mode: keep in memory */ }
  }
  const starsFor = (i) => progress.stars[i] || 0;
  const isUnlocked = (i) => i === 0 || starsFor(i - 1) > 0;
  const firstUnfinished = () => {
    const i = LEVELS.findIndex((_, k) => !starsFor(k));
    return i === -1 ? 0 : i;
  };

  // ---------- State ----------
  let state = null;   // current level being played
  let screen = null;  // name of the visible overlay screen, or null in game
  const screens = ['title', 'levels', 'settings', 'pause', 'win'];

  function showScreen(name) {
    screen = name;
    for (const s of screens) $('screen-' + s).hidden = s !== name;
    const inGame = name === null || name === 'pause' || name === 'win';
    app.classList.toggle('mode-menu', !inGame);
    app.classList.toggle('mode-game', inGame);
    for (const s of ['pause', 'win', 'settings']) $('screen-' + s).classList.toggle('dim', true);
    if (!inGame) { showDemo(); $('toast').hidden = true; }
    requestAnimationFrame(fitBoard);
    const focusTarget = { title: 'title-play', levels: 'levels-back', settings: 'settings-back', pause: 'pause-resume', win: 'win-next' }[name];
    if (focusTarget) setTimeout(() => { const el = $(focusTarget); if (el && !el.hidden) el.focus({ preventScroll: true }); }, 30);
  }

  // Menus show a solved level, animated, behind the panels.
  function showDemo() {
    const lv = LEVELS[6];
    state = null;
    board.setLevel(L.parseLevel(lv));
    board.setTowers(lv.solutions[0]);
    board.setPreview(null);
  }

  function startLevel(index) {
    const level = LEVELS[index];
    const grid = L.parseLevel(level);
    state = { index, level, grid, towers: [], moves: 0, history: [], hintUsed: false, won: false, lit: 0 };
    board.setLevel(grid);
    $('level-num').textContent = `Level ${index + 1}`;
    $('level-title').textContent = level.name;
    $('houses-total').textContent = L.houses(grid).length;
    showScreen(null);
    updateHud();
    toast(level.hint, 4200);
  }

  function updateHud() {
    if (!state) return;
    const { grid, towers, level } = state;
    const total = L.houses(grid).length;
    const lit = L.connections(grid, towers).size;
    $('houses-lit').textContent = lit;
    $('houses-meter').style.width = `${(lit / total) * 100}%`;
    document.querySelector('.stat-houses').classList.toggle('done', lit === total);
    $('moves').textContent = state.moves;
    const pips = $('towers-left');
    pips.innerHTML = '';
    for (let i = 0; i < level.towers; i++) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.innerHTML = '<use href="#i-tower"/>';
      if (i >= level.towers - towers.length) svg.classList.add('used');
      pips.appendChild(svg);
    }
    pips.setAttribute('aria-label', `${level.towers - towers.length} of ${level.towers} towers left`);
    $('undo-btn').disabled = state.history.length === 0 || state.won;
    $('reset-btn').disabled = state.won;
    $('hint-btn').disabled = state.won;
    return lit;
  }

  // ---------- Moves ----------
  const towerAt = (x, y) => state.towers.findIndex(([tx, ty]) => tx === x && ty === y);

  function act(x, y) {
    if (!state || state.won || screen) return;
    const i = towerAt(x, y);
    if (i >= 0) {
      apply({ type: 'remove', x, y }, true);
    } else if (!L.canPlace(state.grid, x, y)) {
      Audio.play('invalid');
      const what = { H: 'Houses', '#': 'Walls', T: 'Trees' }[L.tileAt(state.grid, x, y)];
      toast(`${what} cannot hold a tower.`);
    } else if (state.towers.length >= state.level.towers) {
      Audio.play('invalid');
      bump(document.querySelector('#towers-left').parentElement);
      toast('No towers left. Tap a tower to move it.');
    } else {
      apply({ type: 'place', x, y }, true);
    }
  }

  function apply(action, record) {
    const before = state.lit;
    if (action.type === 'place') state.towers.push([action.x, action.y]);
    else state.towers.splice(towerAt(action.x, action.y), 1);
    if (record) state.history.push(action);
    state.moves++;
    board.hint = null;
    board.setTowers(state.towers);
    refreshPreview();
    state.lit = updateHud();
    Audio.play(action.type === 'place' ? 'place' : 'remove');
    if (state.lit > before) Audio.play('connect', state.lit - before);
    if (L.isSolved(state.grid, state.towers)) win();
  }

  function undo() {
    if (!state || !state.history.length || state.won || screen) return;
    const last = state.history.pop();
    apply({ type: last.type === 'place' ? 'remove' : 'place', x: last.x, y: last.y }, false);
    Audio.play('undo');
  }

  function reset() {
    if (!state || screen === 'win') return;
    Audio.play('click');
    startLevel(state.index);
  }

  // Hint: find the known solution closest to the current board. Point at a
  // tower that does not belong, or else at the next tower to place.
  function hint() {
    if (!state || state.won || screen) return;
    const key = ([x, y]) => x + ',' + y;
    const mine = new Set(state.towers.map(key));
    let best = null, bestScore = -1;
    for (const sol of state.level.solutions) {
      const score = sol.filter((t) => mine.has(key(t))).length;
      if (score > bestScore) { best = sol; bestScore = score; }
    }
    const solSet = new Set(best.map(key));
    const wrong = state.towers.find((t) => !solSet.has(key(t)));
    if (wrong) {
      board.hint = { x: wrong[0], y: wrong[1], kind: 'remove' };
      toast('This tower is not part of a solution.', 3500, true);
    } else {
      const next = best.find((t) => !mine.has(key(t)));
      board.hint = { x: next[0], y: next[1], kind: 'place' };
      toast('Try a tower here.', 3500, true);
    }
    if (!state.hintUsed) {
      state.hintUsed = true;
      toast(board.hint.kind === 'remove' ? 'This tower is not part of a solution. Hints cap the level at 2 stars.' : 'Try a tower here. Hints cap the level at 2 stars.', 4200, true);
    }
    Audio.play('hint');
  }

  function starsEarned() {
    const { moves, hintUsed, level } = state;
    if (moves <= level.stars.three && !hintUsed) return 3;
    if (moves <= level.stars.two) return 2;
    return 1;
  }

  function win() {
    state.won = true;
    board.setPreview(null);
    board.hint = null;
    updateHud();
    const stars = starsEarned();
    const i = state.index;
    const prevStars = starsFor(i);
    progress.stars[i] = Math.max(prevStars, stars);
    progress.best[i] = Math.min(progress.best[i] ?? Infinity, state.moves);
    save();
    const last = i === LEVELS.length - 1;
    setTimeout(() => {
      if (!state || state.index !== i) return;
      Audio.play('win');
      $('win-eyebrow').textContent = `Level ${i + 1} complete`;
      $('win-title').textContent = last ? 'Every town is connected' : 'All houses connected';
      const { three, two } = state.level.stars;
      const mv = (n) => `${n} move${n === 1 ? '' : 's'}`;
      let detail = `Solved in <b>${mv(state.moves)}</b>${state.hintUsed ? ' with a hint' : ''}.<br>` +
        `3 stars: ${mv(three)}, no hints<br>2 stars: ${mv(two)}`;
      if (progress.best[i] < state.moves) detail += `<br>Best: ${progress.best[i]} moves.`;
      if (last) detail += '<br>You finished every level.';
      $('win-detail').innerHTML = detail;
      $('win-next').hidden = last;
      const starEls = $('win-stars').querySelectorAll('.star');
      starEls.forEach((el) => el.classList.remove('on'));
      showScreen('win');
      starEls.forEach((el, k) => {
        if (k < stars) setTimeout(() => { el.classList.add('on'); Audio.play('star', k); }, 350 + k * 260);
      });
    }, 900);
  }

  // ---------- Toast ----------
  let toastTimer = 0;
  function toast(text, ms = 2200, warm = false) {
    const el = $('toast');
    el.textContent = text;
    el.classList.toggle('warm', warm);
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // ---------- Pointer input (mouse, touch and pen) ----------
  let hoverTile = null;
  let press = null; // { id, tile, type }
  let keyCursor = null;

  function refreshPreview() {
    const tile = press ? press.tile : hoverTile || keyCursor;
    if (!state || state.won || !tile) { board.setPreview(null); return; }
    const free = L.canPlace(state.grid, ...tile) && towerAt(...tile) < 0 && state.towers.length < state.level.towers;
    board.ghost = free && (!press || press.type === 'mouse');
    board.setPreview(tile, free);
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!state || screen) return;
    const tile = board.tileAtPoint(e.clientX, e.clientY);
    if (press) {
      if (press.id === e.pointerId) { press.tile = tile; refreshPreview(); }
      return;
    }
    if (e.pointerType !== 'mouse') return;
    hoverTile = tile;
    keyCursor = null;
    canvas.style.cursor = tile && (L.canPlace(state.grid, ...tile)) ? 'pointer' : 'default';
    refreshPreview();
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!state || screen || press) return;
    const tile = board.tileAtPoint(e.clientX, e.clientY);
    if (!tile) return;
    press = { id: e.pointerId, tile, start: tile, type: e.pointerType };
    canvas.setPointerCapture(e.pointerId);
    refreshPreview();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!press || press.id !== e.pointerId) return;
    const { tile, start } = press;
    press = null;
    if (tile && tile[0] === start[0] && tile[1] === start[1]) act(...tile);
    if (e.pointerType !== 'mouse') hoverTile = null;
    refreshPreview();
  });
  canvas.addEventListener('pointercancel', () => { press = null; hoverTile = null; refreshPreview(); });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !press) { hoverTile = null; refreshPreview(); }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- Keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (screen === 'pause' && (e.key === 'Escape' || e.key === 'p')) { resume(); e.preventDefault(); return; }
    if (screen || !state) return;
    const k = e.key;
    if (k === 'Escape' || k === 'p') { pause(); e.preventDefault(); return; }
    if (k === 'z' || k === 'u') { undo(); return; }
    if (k === 'r') { reset(); return; }
    if (k === 'h') { hint(); return; }
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[k]) {
      e.preventDefault();
      const [dx, dy] = moves[k];
      const cur = keyCursor || hoverTile || [Math.floor(state.grid.width / 2), Math.floor(state.grid.height / 2)];
      keyCursor = [Math.max(0, Math.min(state.grid.width - 1, cur[0] + dx)), Math.max(0, Math.min(state.grid.height - 1, cur[1] + dy))];
      hoverTile = null;
      refreshPreview();
      return;
    }
    if ((k === 'Enter' || k === ' ') && keyCursor && document.activeElement === document.body) {
      e.preventDefault();
      act(...keyCursor);
    }
  });

  // ---------- Buttons ----------
  const on = (id, fn) => $(id).addEventListener('click', (e) => { fn(e); });
  const clicky = (fn) => () => { Audio.play('click'); fn(); };

  function pause() { if (!state || state.won) return; Audio.play('click'); hoverTile = null; refreshPreview(); showScreen('pause'); }
  function resume() { Audio.play('click'); showScreen(null); }

  on('pause-btn', pause);
  on('undo-btn', undo);
  on('reset-btn', reset);
  on('hint-btn', hint);
  on('mute-btn', () => setSound(!progress.sound, true));

  on('title-play', clicky(() => startLevel(firstUnfinished())));
  on('title-levels', clicky(openLevels));
  on('title-settings', clicky(() => { settingsReturn = 'title'; openSettings(); }));
  on('levels-back', clicky(() => showScreen('title')));
  on('settings-back', clicky(() => showScreen(settingsReturn)));

  on('pause-resume', resume);
  on('pause-restart', () => { Audio.play('click'); startLevel(state.index); });
  on('pause-levels', clicky(openLevels));

  on('win-next', clicky(() => startLevel(state.index + 1)));
  on('win-replay', clicky(() => startLevel(state.index)));
  on('win-levels', clicky(openLevels));

  $('sound-toggle').addEventListener('change', (e) => setSound(e.target.checked, true));
  $('pause-sound').addEventListener('change', (e) => setSound(e.target.checked, true));

  let confirmTimer = 0;
  on('reset-progress', () => {
    const btn = $('reset-progress');
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = 'Tap again to erase';
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => { btn.classList.remove('confirm'); btn.textContent = 'Reset progress'; }, 3000);
      return;
    }
    clearTimeout(confirmTimer);
    progress.stars = {};
    progress.best = {};
    save();
    btn.classList.remove('confirm');
    btn.textContent = 'Progress erased';
    updateTitle();
    setTimeout(() => { btn.textContent = 'Reset progress'; }, 1600);
  });

  let settingsReturn = 'title';
  function openSettings() {
    $('sound-toggle').checked = progress.sound;
    $('reset-progress').textContent = 'Reset progress';
    $('reset-progress').classList.remove('confirm');
    showScreen('settings');
  }

  function setSound(enabled, announce) {
    progress.sound = enabled;
    save();
    Audio.setEnabled(enabled);
    $('sound-toggle').checked = enabled;
    $('pause-sound').checked = enabled;
    const btn = $('mute-btn');
    btn.querySelector('use').setAttribute('href', enabled ? '#i-sound' : '#i-mute');
    btn.setAttribute('aria-label', enabled ? 'Mute sound' : 'Unmute sound');
    btn.setAttribute('aria-pressed', String(!enabled));
    if (announce && enabled) Audio.play('click');
  }

  // ---------- Level select ----------
  function openLevels() {
    const gridEl = $('level-grid');
    gridEl.innerHTML = '';
    let total = 0;
    LEVELS.forEach((level, i) => {
      const stars = starsFor(i);
      total += stars;
      const unlocked = isUnlocked(i);
      const card = document.createElement('button');
      card.className = 'level-card';
      card.disabled = !unlocked;
      card.setAttribute('aria-label', unlocked ? `Level ${i + 1}, ${level.name}, ${stars} of 3 stars` : `Level ${i + 1}, locked`);
      const thumb = document.createElement('canvas');
      card.appendChild(thumb);
      card.insertAdjacentHTML('beforeend',
        `<span class="num">${i + 1}</span><span class="lname"></span>` +
        `<span class="stars">${[0, 1, 2].map((k) => `<svg class="${k < stars ? 'on' : ''}"><use href="#i-star"/></svg>`).join('')}</span>` +
        (unlocked ? '' : '<span class="lock"><svg><use href="#i-lock"/></svg></span>'));
      card.querySelector('.lname').textContent = level.name;
      card.addEventListener('click', () => { Audio.play('click'); startLevel(i); });
      gridEl.appendChild(card);
      drawThumb(thumb, level, unlocked);
    });
    $('star-total').textContent = `${total} / ${LEVELS.length * 3}`;
    showScreen('levels');
  }

  function drawThumb(c, level, unlocked) {
    const grid = L.parseLevel(level);
    const n = Math.max(grid.width, grid.height);
    const cell = 8;
    c.width = c.height = n * cell;
    const ctx = c.getContext('2d');
    const P = window.SignalArt.PALETTE;
    ctx.fillStyle = '#303c4a';
    ctx.fillRect(0, 0, c.width, c.height);
    const ox = ((n - grid.width) * cell) / 2, oy = ((n - grid.height) * cell) / 2;
    const colors = { '.': P.grassA, H: P.roofLight, '#': P.wallTop, '^': P.hill[2], T: P.canopy };
    grid.rows.forEach((row, y) => row.forEach((t, x) => {
      ctx.fillStyle = unlocked ? colors[t] : (t === '.' ? '#3a4757' : '#455364');
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }));
  }

  function updateTitle() {
    const done = LEVELS.filter((_, i) => starsFor(i)).length;
    $('title-play-label').textContent = done > 0 && done < LEVELS.length ? `Continue: level ${firstUnfinished() + 1}` : 'Play';
  }

  // ---------- Render loop and sizing ----------
  function fitBoard() {
    const r = $('stage').getBoundingClientRect();
    if (r.width && r.height && (r.width !== board.cssW || r.height !== board.cssH)) board.resize(r.width, r.height);
  }
  new ResizeObserver(fitBoard).observe($('stage'));

  // Frame timing is exposed for the automated performance check.
  const perf = { frames: 0, renderMs: 0 };
  window.__signalPerf = perf;
  function loop(now) {
    const t0 = performance.now();
    board.frame(now);
    perf.renderMs += performance.now() - t0;
    perf.frames++;
    requestAnimationFrame(loop);
  }

  // Test hook for the automated playthrough; harmless for players.
  window.__signalTest = { startLevel, act, undo, hint, get state() { return state; }, board };

  setSound(progress.sound !== false, false);
  updateTitle();
  showScreen('title');
  fitBoard();
  requestAnimationFrame(loop);
})();
