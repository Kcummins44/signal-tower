// Game controller: screens, input, tower tray and drag, undo, hints, stars
// and saved progress.
(function () {
  'use strict';
  const L = window.SignalLogic;
  const A = window.SignalArt;
  const Audio = window.SignalAudio;
  const $ = (id) => document.getElementById(id);

  const STORAGE_KEY = 'signal-tower-v2';
  const app = $('app');
  const canvas = $('board');
  const board = new window.SignalBoard(canvas);
  const dragCanvas = $('drag-layer');
  const dctx = dragCanvas.getContext('2d');
  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CHAPTERS = [
    { id: 'basics', name: 'Main Street', icon: 'i-house' },
    { id: 'quiet', name: 'Quiet Hours', icon: 'i-quiet' },
    { id: 'busy', name: 'Rush Hour', icon: 'i-busy' },
    { id: 'dish', name: 'Point the Dish', icon: 'i-dish' },
    { id: 'relay', name: 'Relay Run', icon: 'i-relay' },
    { id: 'panel', name: 'Hall of Mirrors', icon: 'i-panel' },
    { id: 'mixed', name: 'Grand Broadcast', icon: 'i-tower' },
  ];
  const chapterOf = (level) => level.chapter || 'basics';
  const TYPES = {
    mast: { label: 'Tower', aria: 'Tower', none: 'No towers left. Drag one off the board to free it.' },
    dish: { label: 'Dish', aria: 'Dish tower', none: 'No dish towers left. Drag one off the board to free it.' },
  };
  const typeOf = (tower) => (L.isDish(tower) ? 'dish' : 'mast');
  const FACING_WORDS = ['north', 'east', 'south', 'west'];

  // ---------- Saved progress ----------
  const progress = load();
  function load() {
    const fallback = { stars: {}, best: {}, sound: true, seen: {} };
    // Keep only well-formed fields, so a damaged save can never break the game.
    const numbers = (o, ok) => {
      const out = {};
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        for (const [k, v] of Object.entries(o)) if (/^\d+$/.test(k) && typeof v === 'number' && ok(v)) out[k] = v;
      }
      return out;
    };
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!data || typeof data !== 'object' || Array.isArray(data)) return fallback;
      const seen = {};
      if (data.seen && typeof data.seen === 'object') for (const k of Object.keys(data.seen)) if (data.seen[k] === true) seen[k] = true;
      return {
        stars: numbers(data.stars, (v) => v >= 1 && v <= 3 && Number.isInteger(v)),
        best: numbers(data.best, (v) => v >= 0 && Number.isFinite(v)),
        sound: data.sound !== false,
        seen,
      };
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
  let sessionDishSeen = false;

  function showScreen(name) {
    screen = name;
    for (const s of screens) $('screen-' + s).hidden = s !== name;
    const inGame = name === null || name === 'pause' || name === 'win';
    app.classList.toggle('mode-menu', !inGame);
    app.classList.toggle('mode-game', inGame);
    for (const s of ['pause', 'win', 'settings']) $('screen-' + s).classList.toggle('dim', true);
    if (!inGame) { showDemo(); $('toast').hidden = true; }
    if (name) { cancelDrag(true); closeCallout(); }
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
    cancelDrag(true);
    closeCallout();
    state = {
      index, level, grid, towers: [], moves: 0, history: [], hintUsed: false, won: false, lit: 0, violated: 0,
      budget: { mast: level.towers, dish: level.dishes || 0 }, selected: level.towers > 0 ? 'mast' : 'dish',
    };
    board.setLevel(grid);
    board.badgeUntil = 0;
    $('level-num').textContent = `Level ${index + 1}`;
    $('level-title').textContent = level.name;
    $('houses-total').textContent = L.targets(grid).length;
    buildTray();
    showScreen(null);
    updateHud();
    toast(level.hint, 4200);
    if (level.callout && !progress.seen['callout-' + index]) {
      progress.seen['callout-' + index] = true;
      save();
      // In phone landscape a chip callout shares the side slot with the
      // start toast, so it waits for the toast to finish.
      const wait = landscape() && level.callout.at.startsWith('chip') ? 4400 : 350;
      setTimeout(() => { if (state && state.index === index && !screen && !state.history.length && !drag) showCallout(level.callout.text, level.callout.at); }, wait);
    }
  }

  // ---------- Tower tray ----------
  const remaining = (type) => state.budget[type] - state.towers.filter((t) => typeOf(t) === type).length -
    (drag && drag.started && drag.source !== 'board' && drag.type === type ? 1 : 0);
  const levelTypes = () => ['mast', 'dish'].filter((t) => state.budget[t] > 0);

  function buildTray() {
    const tray = $('tray');
    tray.querySelectorAll('.chip').forEach((c) => c.remove());
    for (const type of levelTypes()) {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.dataset.type = type;
      chip.innerHTML = `<canvas class="chip-icon" width="72" height="72"></canvas><span class="chip-label">${TYPES[type].label}</span><span class="chip-badge"></span>`;
      tray.appendChild(chip);
      drawChipIcon(chip.querySelector('canvas'), type);
      chip.addEventListener('pointerdown', (e) => chipDown(e, type, chip));
      chip.addEventListener('click', (e) => {
        if (suppressClick) { suppressClick = false; return; }
        e.preventDefault();
        selectType(type, true);
      });
    }
    tray.classList.toggle('single', levelTypes().length === 1);
  }

  function drawChipIcon(c, type) {
    const ctx = c.getContext('2d');
    const s = c.width;
    ctx.clearRect(0, 0, s, s);
    if (type === 'dish') A.dish(ctx, 0, 0, s, 0, 0.6, false, false, 0);
    else A.tower(ctx, 0, 0, s, 0.6, false, false);
  }

  function updateTray() {
    if (!state) return;
    for (const chip of $('tray').querySelectorAll('.chip')) {
      const type = chip.dataset.type;
      const left = remaining(type);
      const badge = chip.querySelector('.chip-badge');
      if (badge.textContent !== String(left)) {
        if (badge.textContent !== '') { badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
        badge.textContent = left;
      }
      const selected = state.selected === type;
      chip.classList.toggle('selected', selected);
      chip.classList.toggle('empty', left <= 0);
      chip.classList.toggle('holding', !!(drag && drag.started && drag.source !== 'board' && drag.type === type));
      chip.setAttribute('aria-pressed', String(selected));
      chip.setAttribute('aria-disabled', String(left <= 0));
      chip.setAttribute('aria-label', `${TYPES[type].aria}, ${left} left${selected ? ', selected' : ''}`);
    }
  }

  function selectType(type, fromUser) {
    if (!state || !state.budget[type]) return;
    if (fromUser && remaining(type) <= 0) {
      Audio.play('invalid');
      bump(chipEl(type));
      toast(TYPES[type].none);
    }
    if (state.selected !== type && fromUser) Audio.play('click');
    state.selected = type;
    updateTray();
    refreshPreview();
  }
  const chipEl = (type) => $('tray').querySelector(`.chip[data-type="${type}"]`);

  // If the selected type has run out, fall back to one with towers left.
  function fixSelection() {
    if (remaining(state.selected) > 0) return;
    const other = levelTypes().find((t) => remaining(t) > 0);
    if (other) state.selected = other;
  }

  function updateHud() {
    if (!state) return;
    const ev = board.ev && board.skip === null ? board.ev : L.evaluate(state.grid, state.towers);
    $('houses-lit').textContent = ev.lit;
    $('houses-meter').style.width = `${(ev.lit / ev.total) * 100}%`;
    const stat = document.querySelector('.stat-houses');
    stat.classList.toggle('done', ev.lit === ev.total);
    stat.classList.toggle('violated', ev.violations.length > 0);
    $('moves').textContent = state.moves;
    $('undo-btn').disabled = state.history.length === 0 || state.won;
    $('reset-btn').disabled = state.won;
    $('hint-btn').disabled = state.won;
    updateTray();
    return ev;
  }

  // ---------- Moves ----------
  const towerAt = (x, y) => state.towers.findIndex(([tx, ty]) => tx === x && ty === y);

  // A tap (or Enter) on a tile.
  function act(x, y) {
    if (!state || state.won || screen) return;
    const i = towerAt(x, y);
    if (i >= 0) {
      const tw = state.towers[i];
      if (L.isDish(tw)) apply({ type: 'turn', x, y, from: tw[2], to: (tw[2] + 1) % 4 }, true);
      else apply({ type: 'remove', tower: tw.slice() }, true);
    } else if (!L.canPlace(state.grid, x, y)) {
      invalidTile(x, y);
    } else if (remaining(state.selected) <= 0 && !levelTypes().some((t) => remaining(t) > 0)) {
      Audio.play('invalid');
      bump(chipEl(state.selected));
      toast(TYPES[state.selected].none);
    } else {
      fixSelection();
      apply({ type: 'place', tower: newTower(state.selected, x, y) }, true);
    }
  }

  function invalidTile(x, y) {
    Audio.play('invalid');
    const what = { H: 'Houses', '#': 'Walls', T: 'Trees', Q: 'Observatories', B: 'Office blocks', S: 'The station', '/': 'Panels', L: 'Panels' }[L.tileAt(state.grid, x, y)];
    toast(`${what} cannot hold a tower.`);
  }

  const newTower = (type, x, y, facing = 0) => (type === 'dish' ? [x, y, facing] : [x, y]);

  // Actions: place, remove, move (each one move) and turn (free).
  function apply(action, record) {
    const before = state.lit;
    const at = (x, y) => towerAt(x, y);
    switch (action.type) {
      case 'place': state.towers.push(action.tower.slice()); break;
      case 'remove': state.towers.splice(at(action.tower[0], action.tower[1]), 1); break;
      case 'move': {
        const tw = state.towers[at(action.from[0], action.from[1])];
        tw[0] = action.to[0]; tw[1] = action.to[1];
        break;
      }
      case 'turn': state.towers[at(action.x, action.y)][2] = action.to; break;
    }
    if (record) state.history.push(action);
    if (action.type !== 'turn') state.moves++;
    board.hint = null;
    closeCallout();
    fixSelection();
    board.setTowers(state.towers);
    refreshPreview();
    const ev = updateHud();
    state.lit = ev.lit;
    const sfx = { place: 'place', remove: 'remove', move: 'place', turn: 'turn' }[action.type];
    Audio.play(sfx);
    if (state.lit > before) Audio.play('connect', state.lit - before);
    if (ev.violations.length > state.violated) {
      toast('The observatory is picking up your signal.', 2200);
      Audio.play('invalid');
    }
    state.violated = ev.violations.length;
    if (action.type === 'place' && L.isDish(action.tower) && record) onDishPlaced(action.tower);
    if (ev.solved) win();
  }

  function onDishPlaced(tower) {
    if (!sessionDishSeen) {
      sessionDishSeen = true;
      board.badgeUntil = board.time + 3;
      if (chapterOf(state.level) === 'dish' || chapterOf(state.level) === 'mixed') {
        setTimeout(() => { if (state && !screen && towerAt(tower[0], tower[1]) >= 0) showCallout('Tap to turn. Turning is free.', 'tile', tower, 3000); }, 300);
      }
    }
  }

  function inverse(a) {
    switch (a.type) {
      case 'place': return { type: 'remove', tower: a.tower };
      case 'remove': return { type: 'place', tower: a.tower };
      case 'move': return { type: 'move', from: a.to, to: a.from };
      default: return { type: 'turn', x: a.x, y: a.y, from: a.to, to: a.from };
    }
  }

  function undo() {
    if (!state || !state.history.length || state.won || screen) return;
    cancelDrag(true);
    const last = state.history.pop();
    apply(inverse(last), false);
    Audio.play('undo');
  }

  function reset() {
    if (!state || screen === 'win') return;
    Audio.play('click');
    startLevel(state.index);
  }

  // Hint: find the known solution closest to the current board. Point at a
  // tower that does not belong, a dish facing the wrong way, or else the
  // next tower to place.
  function hint() {
    if (!state || state.won || screen) return;
    cancelDrag(true);
    const k = (t) => `${t[0]},${t[1]},${typeOf(t)}`;
    const mine = new Set(state.towers.map(k));
    let best = null, bestScore = -1;
    for (const sol of state.level.solutions) {
      const score = sol.filter((t) => mine.has(k(t))).length;
      if (score > bestScore) { best = sol; bestScore = score; }
    }
    const solMap = new Map(best.map((t) => [k(t), t]));
    const wrong = state.towers.find((t) => !solMap.has(k(t)));
    const turn = state.towers.find((t) => L.isDish(t) && solMap.has(k(t)) && solMap.get(k(t))[2] !== t[2]);
    let msg;
    if (wrong) {
      board.hint = { x: wrong[0], y: wrong[1], kind: 'remove' };
      msg = 'This tower is not part of a solution.';
    } else if (turn) {
      board.hint = { x: turn[0], y: turn[1], kind: 'turn' };
      msg = `Turn this dish to face ${FACING_WORDS[solMap.get(k(turn))[2]]}.`;
    } else {
      const next = best.find((t) => !mine.has(k(t)));
      board.hint = { x: next[0], y: next[1], kind: 'place', tower: next };
      msg = L.isDish(next) ? `Try a dish here, facing ${FACING_WORDS[next[2]]}.` : 'Try a tower here.';
      if (state.budget[typeOf(next)]) selectType(typeOf(next), false);
    }
    if (!state.hintUsed) {
      state.hintUsed = true;
      msg += ' Hints cap the level at 2 stars.';
    }
    toast(msg, msg.length > 50 ? 4200 : 3500, true);
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
    cancelDrag(true);
    board.setPreview(null);
    board.hint = null;
    board.focusDish = null;
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
      starEls.forEach((el, n) => {
        if (n < stars) setTimeout(() => { el.classList.add('on'); Audio.play('star', n); }, 350 + n * 260);
      });
    }, 900);
  }

  // ---------- Toast and callout ----------
  // Phone landscape: the board fills the height, so toasts go in the side
  // column, between the top bar and the stats, clear of the board.
  const landscape = () => window.matchMedia('(max-height: 560px) and (orientation: landscape)').matches;
  function placeToast() {
    const el = $('toast');
    const side = landscape();
    el.classList.toggle('side', side);
    if (!side) { el.style.left = el.style.top = el.style.width = ''; return; }
    const col = $('hud-bottom').getBoundingClientRect();
    const top = $('hud-top').getBoundingClientRect();
    const stage = $('stage').getBoundingClientRect();
    el.style.left = `${col.left - stage.left + 8}px`;
    el.style.width = `${col.width - 16}px`;
    el.style.top = `${top.bottom - stage.top + 4}px`;
  }

  let toastTimer = 0;
  function toast(text, ms = 2200, warm = false) {
    const el = $('toast');
    placeToast();
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
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // A small bubble pointing at a tile or a tray chip. `at` is a tile
  // letter (the first such tile), 'tile' with an explicit [x, y], or
  // 'chip-mast' / 'chip-dish'.
  let callout = null;
  function showCallout(text, at, tile, ms = 7000) {
    const el = $('callout');
    el.querySelector('span').textContent = text;
    let target = null;
    if (at === 'chip-mast' || at === 'chip-dish') target = { chip: at.slice(5) };
    else if (at === 'tile') target = { tile: tile.slice(0, 2) };
    else {
      for (let y = 0; y < state.grid.height && !target; y++)
        for (let x = 0; x < state.grid.width && !target; x++) if (L.tileAt(state.grid, x, y) === at) target = { tile: [x, y] };
    }
    if (!target) return;
    callout = { target, until: performance.now() + ms };
    el.hidden = false;
    board.callout = target.tile || null;
    if (target.chip) chipEl(target.chip)?.classList.add('callout-ring');
    positionCallout();
  }
  function positionCallout() {
    if (!callout) return;
    const el = $('callout');
    const appRect = app.getBoundingClientRect();
    let cx, top, bottom, below;
    if (callout.target.chip) {
      const chip = chipEl(callout.target.chip);
      if (!chip) return closeCallout();
      const r = chip.getBoundingClientRect();
      if (landscape()) {
        // Side column: the slot above the stats, clear of the board. The
        // chip's pulsing ring shows which chip it means.
        el.classList.remove('below');
        el.classList.add('side');
        const col = $('hud-bottom').getBoundingClientRect();
        const top = $('hud-top').getBoundingClientRect();
        el.style.left = `${col.left + 8}px`;
        el.style.width = `${col.width - 16}px`;
        el.style.top = `${top.bottom + 4}px`;
        return;
      }
      cx = r.left + r.width / 2; top = r.top; bottom = r.bottom; below = false;
    } else {
      const [x, y] = callout.target.tile;
      const r = board.tileRect(x, y);
      cx = r.left + r.size / 2; top = r.top; bottom = r.top + r.size; below = y < 2;
    }
    el.classList.remove('side');
    el.style.width = '';
    el.classList.toggle('below', below);
    const w = el.offsetWidth, h = el.offsetHeight;
    const left = Math.max(8, Math.min(appRect.width - w - 8, cx - w / 2));
    el.style.left = `${left}px`;
    el.style.top = `${below ? bottom + 10 : top - h - 10}px`;
    el.style.setProperty('--caret', `${cx - left}px`);
  }
  function closeCallout() {
    if (!callout) return;
    callout = null;
    $('callout').hidden = true;
    board.callout = null;
    document.querySelectorAll('.callout-ring').forEach((c) => c.classList.remove('callout-ring'));
  }

  // ---------- Pointer input (mouse, touch and pen) ----------
  // press: a pointer that went down but has not yet become a tap or drag.
  // drag: a tower in hand, from the tray ('tray'), from a held tile
  // ('hold') or a placed tower being moved ('board').
  let hoverTile = null;
  let keyCursor = null;
  let press = null;
  let drag = null;
  let carry = null;     // keyboard pick-up: { index }
  let fly = null;       // fly-back animation
  let suppressClick = false;
  const HOLD_MS = 260, LONG_PRESS_MS = 600;

  function refreshPreview() {
    if (!state || state.won || screen) { board.setPreview(null); board.focusDish = null; return; }
    if (drag && drag.started) { updateDragPreview(); return; }
    if (carry) { updateCarryPreview(); return; }
    const tile = hoverTile || keyCursor;
    board.focusDish = null;
    if (!tile) { board.setPreview(null); return; }
    const i = towerAt(...tile);
    if (i >= 0) {
      board.ghost = false;
      if (L.isDish(state.towers[i])) board.focusDish = i;
      board.hoverOk = true;
      board.setPreview(tile, null);
      return;
    }
    const free = L.canPlace(state.grid, ...tile);
    const type = remaining(state.selected) > 0 ? state.selected : levelTypes().find((t) => remaining(t) > 0);
    board.ghost = free && !!type;
    board.hoverOk = free;
    board.setPreview(tile, free && type ? { tower: newTower(type, ...tile) } : null);
  }

  // Ghost lift for touch and pen: the ghost sits above the finger.
  // Near the bottom of the screen the lift shrinks (to zero at the very
  // edge), so the ghost can still reach the bottom row when the board fills
  // the screen height, as in phone landscape. The ghost's height keeps
  // rising as the finger rises, so every tile stays reachable.
  const fullLift = (pointerType) => (pointerType === 'mouse' ? 0 : Math.max(56, 1.1 * (board.tile || 40)));
  const liftFor = (pointerType, clientY = 0) => {
    const full = fullLift(pointerType);
    if (!full) return 0;
    const room = window.innerHeight - clientY;
    return room >= full ? full : full * Math.max(0, room) / full;
  };

  function startDrag(source, type, e, from) {
    const facing = source === 'board' ? state.towers[from][2] : 0;
    drag = {
      source, type, facing, from, started: true, id: e.pointerId, pointerType: e.pointerType,
      cx: e.clientX, cy: e.clientY, gx: e.clientX, gy: e.clientY - liftFor(e.pointerType, e.clientY), scale: 0.8, born: performance.now(),
      target: null, valid: false, overTray: false,
    };
    if (source === 'board') {
      const tw = state.towers[from];
      board.setTowers(state.towers, { skip: from });
      board.slot = [tw[0], tw[1]];
      $('tray').classList.add('removing');
    }
    hoverTile = null;
    closeCallout();
    Audio.play('lift');
    updateTray();
    updateDragPreview();
  }

  function dragMove(e) {
    drag.cx = e.clientX; drag.cy = e.clientY;
    updateDragPreview();
  }

  function ghostCentre() {
    return [drag.cx, drag.cy - liftFor(drag.pointerType, drag.cy)];
  }

  // The drop target for a pointer at (cx, cy): null over the tray or off
  // the board, else the tile under the (lifted) ghost.
  function targetAt(cx, cy, pointerType) {
    const tr = $('tray').getBoundingClientRect();
    const overTray = cx >= tr.left && cx <= tr.right && cy >= tr.top && cy <= tr.bottom;
    return { overTray, tile: overTray ? null : board.tileAtPoint(cx, cy - liftFor(pointerType, cy), true) };
  }

  function updateDragPreview() {
    const hit = targetAt(drag.cx, drag.cy, drag.pointerType);
    drag.overTray = hit.overTray;
    $('tray').classList.toggle('drop', drag.overTray || (drag.source === 'board' && !drag.target));
    const tile = hit.tile;
    drag.target = tile;
    const origin = drag.source === 'board' ? state.towers[drag.from] : null;
    const own = origin && tile && tile[0] === origin[0] && tile[1] === origin[1];
    drag.own = !!own;
    drag.valid = !!tile && (own || (L.canPlace(state.grid, ...tile) && towerAt(...tile) < 0));
    board.ghost = false;
    board.focusDish = null;
    board.hoverOk = drag.valid;
    board.setPreview(tile, tile && drag.valid ? { tower: newTower(drag.type, tile[0], tile[1], drag.facing) } : null);
  }

  function endDrag() {
    const d = drag;
    drag = null;
    $('tray').classList.remove('drop', 'removing');
    board.slot = null;
    board.setPreview(null);
    const fromChip = () => chipRect(d.type);
    if (d.source === 'board') {
      const tw = state.towers[d.from];
      board.setTowers(state.towers);
      if (d.own) { /* dropped where it was: nothing */ }
      else if (d.target && d.valid) apply({ type: 'move', from: [tw[0], tw[1]], to: d.target.slice() }, true);
      else if (d.target) { startFly(d, tileCentre(tw[0], tw[1]), board.tile, 180); Audio.play('invalid'); }
      else { startFly(d, fromChip(), 36, 220); apply({ type: 'remove', tower: tw.slice() }, true); }
    } else if (d.target && d.valid && !d.own) {
      apply({ type: 'place', tower: newTower(d.type, d.target[0], d.target[1]) }, true);
    } else {
      startFly(d, fromChip(), 36, 220, true);
    }
    updateTray();
    refreshPreview();
  }

  function cancelDrag(instant) {
    if (press) { clearTimeout(press.timer); press = null; }
    carry = null;
    if (!drag) return;
    const d = drag;
    drag = null;
    $('tray').classList.remove('drop', 'removing');
    board.slot = null;
    if (state) board.setTowers(state.towers);
    board.setPreview(null);
    if (!instant && state) {
      if (d.source === 'board') { const tw = state.towers[d.from]; startFly(d, tileCentre(tw[0], tw[1]), board.tile, 180); }
      else startFly(d, chipRect(d.type), 36, 220, true);
    }
    if (state) updateTray();
  }

  const tileCentre = (x, y) => { const r = board.tileRect(x, y); return [r.left + r.size / 2, r.top + r.size / 2]; };
  function chipRect(type) {
    const chip = chipEl(type);
    if (!chip) return [window.innerWidth / 2, window.innerHeight];
    const r = chip.querySelector('canvas').getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  }
  function startFly(d, to, toSize, ms, bumpAfter) {
    const size = ghostSize() * (d.target ? 1 : 0.8);
    const [gx, gy] = [d.gx, d.gy];
    if (reducedMotion()) { if (bumpAfter) updateTray(); return; }
    fly = { type: d.type, facing: d.facing, from: [gx, gy], to, fromSize: size, toSize, t0: performance.now(), ms };
  }
  const ghostSize = () => Math.max(44, board.tile || 44);

  canvas.addEventListener('pointermove', (e) => {
    if (!state || screen || drag || press) return;
    if (e.pointerType !== 'mouse') return;
    const tile = board.tileAtPoint(e.clientX, e.clientY);
    hoverTile = tile;
    if (!carry) keyCursor = null;
    canvas.style.cursor = tile && (L.canPlace(state.grid, ...tile) || towerAt(...tile) >= 0) ? 'pointer' : 'default';
    refreshPreview();
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!state || screen || press || drag || state.won) return;
    if (e.button && e.button !== 0) return;
    carry = null;
    const tile = board.tileAtPoint(e.clientX, e.clientY);
    if (!tile) return;
    const i = towerAt(...tile);
    press = { id: e.pointerId, tile, x: e.clientX, y: e.clientY, type: e.pointerType, tower: i >= 0 ? i : null, t0: performance.now() };
    canvas.setPointerCapture(e.pointerId);
    if (e.pointerType !== 'mouse') {
      if (i >= 0) {
        // Long press removes any tower (touch). Moving first starts a drag.
        press.timer = setTimeout(() => {
          if (!press || press.tower === null) return;
          const tw = state.towers[press.tower];
          press = null;
          if (navigator.vibrate) try { navigator.vibrate(12); } catch { /* optional */ }
          apply({ type: 'remove', tower: tw.slice() }, true);
        }, LONG_PRESS_MS);
      } else {
        // Hold an empty tile: the tower lifts above the finger to preview.
        press.timer = setTimeout(() => {
          if (!press || press.tower !== null) return;
          const type = remaining(state.selected) > 0 ? state.selected : levelTypes().find((t) => remaining(t) > 0);
          if (!type) return;
          const p = press;
          press = null;
          startDrag('hold', type, { pointerId: p.id, pointerType: p.type, clientX: p.lastX ?? p.x, clientY: p.lastY ?? p.y });
        }, HOLD_MS);
      }
    }
  });

  // Moves and releases are tracked on the document so a drag can cross
  // from the tray onto the board and back.
  document.addEventListener('pointermove', (e) => {
    if (drag && drag.id === e.pointerId) { dragMove(e); return; }
    if (!press || press.id !== e.pointerId) return;
    press.lastX = e.clientX; press.lastY = e.clientY;
    const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    const slop = press.type === 'mouse' ? 6 : 10;
    if (dist < slop) return;
    clearTimeout(press.timer);
    const p = press;
    press = null;
    if (p.chip) {
      if (remaining(p.chip) <= 0) { Audio.play('invalid'); bump(chipEl(p.chip)); toast(TYPES[p.chip].none); suppressClick = true; return; }
      state.selected = p.chip;
      suppressClick = true;
      startDrag('tray', p.chip, e);
    } else if (p.tower !== null) {
      startDrag('board', typeOf(state.towers[p.tower]), e, p.tower);
    } else if (p.type !== 'mouse') {
      const type = remaining(state.selected) > 0 ? state.selected : levelTypes().find((t) => remaining(t) > 0);
      if (type) startDrag('hold', type, e);
    } else {
      // Mouse slid off the tile it pressed: no action, back to hover.
      hoverTile = board.tileAtPoint(e.clientX, e.clientY);
      refreshPreview();
    }
  });
  document.addEventListener('pointerup', (e) => {
    if (drag && drag.id === e.pointerId) { endDrag(); suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); return; }
    if (!press || press.id !== e.pointerId) return;
    clearTimeout(press.timer);
    const p = press;
    press = null;
    if (p.chip) return; // the click handler selects the chip
    act(...p.tile);
    if (e.pointerType !== 'mouse') hoverTile = null;
    refreshPreview();
  });
  document.addEventListener('pointercancel', (e) => {
    if (drag && drag.id === e.pointerId) { cancelDrag(false); return; }
    if (press && press.id === e.pointerId) { clearTimeout(press.timer); press = null; hoverTile = null; refreshPreview(); }
  });
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !press && !drag) { hoverTile = null; refreshPreview(); }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  dragCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function chipDown(e, type, chip) {
    if (!state || screen || press || drag || state.won) return;
    if (e.button && e.button !== 0) return;
    suppressClick = false;
    press = { id: e.pointerId, chip: type, x: e.clientX, y: e.clientY, type: e.pointerType };
    try { chip.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    chip.classList.add('pressed');
    setTimeout(() => chip.classList.remove('pressed'), 100);
  }

  // ---------- Keyboard ----------
  function updateCarryPreview() {
    const tw = state.towers[carry.index];
    const tile = keyCursor;
    const own = tile[0] === tw[0] && tile[1] === tw[1];
    const valid = own || (L.canPlace(state.grid, ...tile) && towerAt(...tile) < 0);
    board.focusDish = null;
    board.ghost = valid && !own;
    board.hoverOk = valid;
    board.setPreview(tile, valid && !own ? { tower: newTower(typeOf(tw), tile[0], tile[1], tw[2]) } : null);
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (screen === 'pause' && (e.key === 'Escape' || e.key === 'p')) { resume(); e.preventDefault(); return; }
    if (screen || !state) return;
    const k = e.key;
    if (k === 'Escape' && (drag || carry)) {
      e.preventDefault();
      if (carry) { carry = null; board.setTowers(state.towers); board.slot = null; refreshPreview(); Audio.play('click'); }
      else cancelDrag(false);
      return;
    }
    if (k === 'Escape' || k === 'p') { pause(); e.preventDefault(); return; }
    if (drag) return;
    if (k === 'z' || k === 'u') { undo(); return; }
    if (k === 'r') { reset(); return; }
    if (k === 'h') { hint(); return; }
    if (k === '1') { if (state.budget.mast) selectType('mast', true); return; }
    if (k === '2') { if (state.budget.dish) selectType('dish', true); return; }
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[k]) {
      e.preventDefault();
      // Arrow keys move the board cursor; hand focus back to the board.
      if (document.activeElement && document.activeElement.closest('#hud-bottom, #hud-top')) document.activeElement.blur();
      const [dx, dy] = moves[k];
      const cur = keyCursor || hoverTile || [Math.floor(state.grid.width / 2), Math.floor(state.grid.height / 2)];
      keyCursor = [Math.max(0, Math.min(state.grid.width - 1, cur[0] + dx)), Math.max(0, Math.min(state.grid.height - 1, cur[1] + dy))];
      hoverTile = null;
      refreshPreview();
      return;
    }
    const onBoard = document.activeElement === document.body || document.activeElement === canvas;
    if (!keyCursor || state.won) return;
    if ((k === 'm' || k === 'M') && !carry) {
      const i = towerAt(...keyCursor);
      if (i < 0) { Audio.play('invalid'); return; }
      carry = { index: i };
      const tw = state.towers[i];
      board.setTowers(state.towers, { skip: i });
      board.slot = [tw[0], tw[1]];
      Audio.play('lift');
      refreshPreview();
      return;
    }
    if ((k === 'Enter' || k === ' ') && (onBoard || carry)) {
      e.preventDefault();
      if (carry) {
        const tw = state.towers[carry.index];
        const tile = keyCursor;
        const own = tile[0] === tw[0] && tile[1] === tw[1];
        const valid = own || (L.canPlace(state.grid, ...tile) && towerAt(...tile) < 0);
        if (!valid) { Audio.play('invalid'); return; }
        carry = null;
        board.slot = null;
        board.setTowers(state.towers);
        if (!own) apply({ type: 'move', from: [tw[0], tw[1]], to: tile.slice() }, true);
        refreshPreview();
        return;
      }
      act(...keyCursor);
      return;
    }
    if ((k === 'Delete' || k === 'Backspace') && !carry) {
      e.preventDefault();
      const i = towerAt(...keyCursor);
      if (i >= 0) apply({ type: 'remove', tower: state.towers[i].slice() }, true);
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
    progress.seen = {};
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
    CHAPTERS.forEach((ch, n) => {
      const idx = LEVELS.map((lv, i) => i).filter((i) => chapterOf(LEVELS[i]) === ch.id);
      if (!idx.length) return;
      const unlocked = isUnlocked(idx[0]);
      const stars = idx.reduce((a, i) => a + starsFor(i), 0);
      const head = document.createElement('div');
      head.className = 'chapter-head' + (unlocked ? '' : ' locked') + (n === 0 ? ' first' : '');
      head.innerHTML = `<svg class="ch-icon"><use href="#${ch.icon}"/></svg>` +
        `<div class="ch-text"><span class="eyebrow-muted">Chapter ${n + 1}</span><strong></strong></div>` +
        (unlocked ? `<span class="ch-stars"><svg><use href="#i-star"/></svg>${stars} / ${idx.length * 3}</span>`
          : '<span class="ch-stars"><svg><use href="#i-lock"/></svg></span>');
      head.querySelector('strong').textContent = ch.name;
      head.setAttribute('aria-label', `Chapter ${n + 1}, ${ch.name}, ${unlocked ? `${stars} of ${idx.length * 3} stars` : 'locked'}`);
      gridEl.appendChild(head);
      for (const i of idx) {
        const level = LEVELS[i];
        const s = starsFor(i);
        total += s;
        const open = isUnlocked(i);
        const card = document.createElement('button');
        card.className = 'level-card';
        card.disabled = !open;
        card.setAttribute('aria-label', open ? `Level ${i + 1}, ${level.name}, ${s} of 3 stars` : `Level ${i + 1}, locked`);
        const thumb = document.createElement('canvas');
        card.appendChild(thumb);
        card.insertAdjacentHTML('beforeend',
          `<span class="num">${i + 1}</span><span class="lname"></span>` +
          `<span class="stars">${[0, 1, 2].map((k) => `<svg class="${k < s ? 'on' : ''}"><use href="#i-star"/></svg>`).join('')}</span>` +
          (open ? '' : '<span class="lock"><svg><use href="#i-lock"/></svg></span>'));
        card.querySelector('.lname').textContent = level.name;
        card.addEventListener('click', () => { Audio.play('click'); startLevel(i); });
        gridEl.appendChild(card);
        drawThumb(thumb, level, open);
      }
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
    const P = A.PALETTE;
    ctx.fillStyle = '#303c4a';
    ctx.fillRect(0, 0, c.width, c.height);
    const ox = ((n - grid.width) * cell) / 2, oy = ((n - grid.height) * cell) / 2;
    const colors = { '.': P.grassA, H: P.roofLight, '#': P.wallTop, '^': P.hill[2], T: P.canopy,
      Q: P.quiet, B: P.officeRoof, S: P.signal, '/': P.reflFace, L: P.reflFace };
    grid.rows.forEach((row, y) => row.forEach((t, x) => {
      const px = ox + x * cell, py = oy + y * cell;
      if (!unlocked) { ctx.fillStyle = t === '.' ? '#3a4757' : '#455364'; ctx.fillRect(px, py, cell, cell); return; }
      ctx.fillStyle = t === '/' || t === 'L' ? P.reflBase : colors[t];
      ctx.fillRect(px, py, cell, cell);
      if (t === '/' || t === 'L') {
        ctx.strokeStyle = P.reflFace; ctx.lineWidth = 2;
        ctx.beginPath();
        if (t === '/') { ctx.moveTo(px + 1, py + cell - 1); ctx.lineTo(px + cell - 1, py + 1); }
        else { ctx.moveTo(px + 1, py + 1); ctx.lineTo(px + cell - 1, py + cell - 1); }
        ctx.stroke();
      }
      if (t === 'B') { ctx.fillStyle = P.windowOn; ctx.fillRect(px + 1, py + 1, 2, 2); ctx.fillRect(px + 5, py + 1, 2, 2); }
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
    sizeDragLayer();
    positionCallout();
    // A resize or rotation mid-drag moves the board under the pointer.
    if (drag && drag.started && state) updateDragPreview();
    else if (carry && state) updateCarryPreview();
    placeToast();
  }
  function sizeDragLayer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth, h = window.innerHeight;
    if (dragCanvas.width !== Math.round(w * dpr) || dragCanvas.height !== Math.round(h * dpr)) {
      dragCanvas.width = Math.round(w * dpr); dragCanvas.height = Math.round(h * dpr);
    }
    dragCanvas.dpr = dpr;
  }
  new ResizeObserver(fitBoard).observe($('stage'));
  window.addEventListener('resize', fitBoard);

  // The drag layer draws the tower in hand, the touch tether, fly-backs
  // and the long-press ring. It covers the whole window so the ghost can
  // travel between the tray and the board.
  let dragDirty = true;
  function drawDragLayer(now) {
    const active = drag || fly || (press && press.tower !== null && press.type !== 'mouse');
    if (!active && !dragDirty) return;
    dragDirty = !!active;
    const dpr = dragCanvas.dpr || 1;
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, dragCanvas.width, dragCanvas.height);
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const drawTower = (type, facing, cx, cy, size, alpha, slash) => {
      dctx.save();
      dctx.globalAlpha = alpha;
      const px = cx - size / 2, py = cy - size / 2;
      if (type === 'dish') A.dish(dctx, px, py, size, facing * Math.PI / 2, 0.6, false, false, 0);
      else A.tower(dctx, px, py, size, 0.6, false, false);
      if (slash) {
        dctx.globalAlpha = 1;
        dctx.lineCap = 'round';
        dctx.strokeStyle = A.UNDERLAY; dctx.lineWidth = size * 0.1;
        dctx.beginPath(); dctx.moveTo(px + size * 0.2, py + size * 0.8); dctx.lineTo(px + size * 0.8, py + size * 0.2); dctx.stroke();
        dctx.strokeStyle = A.PALETTE.danger; dctx.lineWidth = size * 0.06;
        dctx.beginPath(); dctx.moveTo(px + size * 0.2, py + size * 0.8); dctx.lineTo(px + size * 0.8, py + size * 0.2); dctx.stroke();
      }
      dctx.restore();
    };
    if (drag) {
      const still = reducedMotion();
      const [tx, ty] = ghostCentre();
      let goalX = tx, goalY = ty, goalScale = 1, alpha = 0.85;
      if (drag.target && !drag.overTray) {
        const [cx, cy] = tileCentre(...drag.target);
        goalX = cx; goalY = cy;
        alpha = drag.valid ? 0.85 : 0.45;
      } else { goalScale = 0.8; alpha = 0.5; }
      const grow = still ? 1 : Math.min(1, (now - drag.born) / 120);
      const k = still ? 1 : Math.min(1, 16 / 80 * 1.6);
      drag.gx += (goalX - drag.gx) * (drag.target ? k : 1);
      drag.gy += (goalY - drag.gy) * (drag.target ? k : 1);
      drag.scale += (goalScale * (0.8 + 0.2 * grow) - drag.scale) * (still ? 1 : 0.35);
      const size = (drag.target ? board.tile : ghostSize()) * drag.scale;
      if (drag.pointerType !== 'mouse') {
        dctx.strokeStyle = 'rgba(233, 237, 241, 0.35)';
        dctx.lineWidth = 2;
        dctx.beginPath(); dctx.moveTo(drag.cx, drag.cy); dctx.lineTo(drag.gx, drag.gy + size * 0.35); dctx.stroke();
      }
      drawTower(drag.type, drag.facing, drag.gx, drag.gy, Math.max(size, 20), alpha, drag.target && !drag.valid);
    }
    if (fly) {
      const p = Math.min(1, (now - fly.t0) / fly.ms);
      const e = p * p; // ease-in
      const x = fly.from[0] + (fly.to[0] - fly.from[0]) * e, y = fly.from[1] + (fly.to[1] - fly.from[1]) * e;
      drawTower(fly.type, fly.facing, x, y, fly.fromSize + (fly.toSize - fly.fromSize) * e, 0.85 - 0.3 * e, false);
      if (p >= 1) fly = null;
    }
    // Long-press ring: fills after a short pause so taps never flash it.
    if (press && press.tower !== null && press.type !== 'mouse') {
      const held = now - press.t0;
      const p = Math.max(0, (held - 150) / (LONG_PRESS_MS - 150));
      if (p > 0) {
        const tw = state.towers[press.tower];
        const [cx, cy] = tileCentre(tw[0], tw[1]);
        const r = board.tile * 0.55;
        dctx.lineCap = 'round';
        dctx.strokeStyle = A.UNDERLAY; dctx.lineWidth = Math.max(4, board.tile * 0.1);
        dctx.beginPath(); dctx.arc(cx, cy, r, 0, Math.PI * 2); dctx.stroke();
        dctx.strokeStyle = A.PALETTE.danger; dctx.lineWidth = Math.max(2.5, board.tile * 0.06);
        dctx.beginPath(); dctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.min(1, p) * Math.PI * 2); dctx.stroke();
      }
    }
  }

  // Frame timing is exposed for the automated performance check.
  const perf = { frames: 0, renderMs: 0 };
  window.__signalPerf = perf;
  function loop(now) {
    const t0 = performance.now();
    board.frame(now);
    drawDragLayer(now);
    if (callout && performance.now() > callout.until) closeCallout();
    perf.renderMs += performance.now() - t0;
    perf.frames++;
    requestAnimationFrame(loop);
  }

  // Test hook for the automated playthrough; harmless for players.
  window.__signalTest = {
    startLevel, act, undo, hint, selectType, board, targetAt,
    get state() { return state; },
    get drag() { return drag && { source: drag.source, type: drag.type, target: drag.target, valid: drag.valid, overTray: drag.overTray, ghost: ghostCentre() }; },
    remaining: (type) => remaining(type),
  };

  setSound(progress.sound !== false, false);
  updateTitle();
  showScreen('title');
  fitBoard();
  requestAnimationFrame(loop);
})();
