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
  const STORY = window.STORY;
  const SCENE_IDS = new Set(STORY.scenes.map((sc) => sc.id));
  const STORY_CHAPTERS = STORY.town.map((t) => t.chapter);
  const SPEEDS = ['normal', 'fast', 'instant'];
  // Test hook: the automated tests that are not about the story start with
  // scenes off (window.__signalStoryOff is set before the page loads).
  const storyDefaultOn = () => !window.__signalStoryOff;
  const progress = load();
  // The story part of the save. A save without one (anyone who played
  // before the story) is filled in silently from their progress: every
  // scene they are past counts as seen, and their town is lit. They get a
  // one-time "story so far" offer on the map (offered: false).
  function loadStory(data, stars) {
    const levelsOf = (c) => LEVELS.map((lv, i) => (chapterOf(lv) === c ? i : -1)).filter((i) => i >= 0);
    const s = data && data.story;
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      const beaten = (i) => !!stars[i];
      const any = Object.keys(stars).length > 0;
      const seen = {};
      for (const sc of STORY.scenes) {
        const t = sc.trigger;
        const done = t.type === 'prologue' ? any
          : t.type === 'chapterStart' ? beaten(levelsOf(t.chapter)[0])
          : t.type === 'chapterEnd' ? beaten(levelsOf(t.chapter).slice(-1)[0])
          : t.type === 'levelStart' ? beaten(t.level - 1)
          : t.type === 'epilogue' ? beaten(LEVELS.length - 1) : false;
        if (done) seen[sc.id] = true;
      }
      const townShown = STORY_CHAPTERS.filter((c) => beaten(levelsOf(c).slice(-1)[0]));
      // Nothing to catch up on for a save with nothing beaten.
      return { seen, townShown, offered: !any, on: storyDefaultOn(), speed: 'normal' };
    }
    const seen = {};
    if (s.seen && typeof s.seen === 'object' && !Array.isArray(s.seen)) for (const k of Object.keys(s.seen)) if (s.seen[k] === true && SCENE_IDS.has(k)) seen[k] = true;
    const townShown = Array.isArray(s.townShown) ? [...new Set(s.townShown.filter((c) => STORY_CHAPTERS.includes(c)))] : [];
    return { seen, townShown, offered: s.offered === true, on: s.on !== false, speed: SPEEDS.includes(s.speed) ? s.speed : 'normal' };
  }
  function load() {
    const fallback = { stars: {}, best: {}, sound: true, seen: {}, road: 0, story: loadStory(null, {}) };
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
      const stars = numbers(data.stars, (v) => v >= 1 && v <= 3 && Number.isInteger(v));
      // road: how many map road segments have been shown as travelled. Saves
      // from before the level map count every beaten level as shown, so
      // they never replay the road animation.
      // A real save never has road past the first unbeaten level, so a
      // damaged one is clamped there (otherwise the road would never draw).
      let frontier = 0;
      while (stars[frontier]) frontier++;
      const road = Number.isInteger(data.road) && data.road >= 0 ? Math.min(data.road, frontier) : Object.keys(stars).length;
      return {
        stars,
        best: numbers(data.best, (v) => v >= 0 && Number.isFinite(v)),
        sound: data.sound !== false,
        seen,
        road,
        story: loadStory(data, stars),
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
  const screens = ['title', 'levels', 'settings', 'pause', 'win', 'story'];
  let sessionDishSeen = false;

  // ---------- Story ("The Keeper of Wren Hollow", Iris's design/story-spec.md) ----------
  // When scenes play. js/story-ui.js shows them; js/story.js holds the text.
  const storyOn = () => progress.story.on;
  const levelsOfChapter = (id) => LEVELS.map((lv, i) => (chapterOf(lv) === id ? i : -1)).filter((i) => i >= 0);
  const chapterDone = (id) => starsFor(levelsOfChapter(id).slice(-1)[0]) > 0;
  const sceneWhere = (pred) => STORY.scenes.find((sc) => pred(sc.trigger));
  const startScene = (id) => sceneWhere((t) => t.type === 'chapterStart' && t.chapter === id);
  const endScene = (id) => sceneWhere((t) => t.type === 'chapterEnd' && t.chapter === id);
  const EPILOGUE = sceneWhere((t) => t.type === 'epilogue').id;
  const PROLOGUE = sceneWhere((t) => t.type === 'prologue').id;
  // Town landmarks lit: chapters whose closing scene has played (with scenes
  // off, every finished chapter).
  const townOn = () => STORY_CHAPTERS.filter((c) => progress.story.seen[endScene(c).id] || (!storyOn() && chapterDone(c)));
  function markSeen(id) { if (!progress.story.seen[id]) { progress.story.seen[id] = true; save(); } }
  // Tiles (or the tray chip) a line talks about, in window coordinates.
  function focusRects(f) {
    if (!state) return [];
    if (f.startsWith('chip:')) {
      const c = chipEl(f.slice(5) === 'dish' ? 'dish' : 'mast');
      if (!c) return [];
      const r = c.getBoundingClientRect();
      return [{ x: r.left, y: r.top, w: r.width, h: r.height, chip: true }];
    }
    const chars = new Set(f.split('')), r = canvas.getBoundingClientRect(), out = [];
    state.grid.rows.forEach((row, y) => row.forEach((t, x) => {
      if (chars.has(t)) out.push({ x: r.left + board.ox + x * board.tile, y: r.top + board.oy + y * board.tile, w: board.tile, h: board.tile });
    }));
    return out;
  }
  const Story = window.SignalStory.create({
    reducedMotion, speed: () => progress.story.speed, sound: (n) => Audio.play(n), townState: townOn, markSeen, focusRects,
    onOpen() { cancelDrag(true); closeCallout(); $('toast').hidden = true; if (state) { hoverTile = null; board.setPreview(null); } },
    // A tap that closes a scene must not also land on the board under it.
    onClose() { screenChangedAt = performance.now(); },
  });
  // Plays scenes when the story is on; with it off they only count as seen.
  function playScenes(ids, then, opts = {}) {
    if (!storyOn()) { ids.forEach(markSeen); if (then) then(); return; }
    Story.play(ids, { ...opts, onDone: then });
  }
  // The scene for entering a level for the first time: its chapter's opening
  // (first level) or a mid-chapter moment (levels 9, 30, 37). One scene per
  // moment: if two wanted the same one, the later plays and both count as seen.
  function introScenes(index) {
    if (starsFor(index) > 0) return [];
    const lv = LEVELS[index];
    const ids = STORY.scenes.filter((sc) => {
      const t = sc.trigger;
      return (t.type === 'chapterStart' && t.chapter === chapterOf(lv) && levelsOfChapter(t.chapter)[0] === index) ||
        (t.type === 'levelStart' && t.level === index + 1);
    }).map((sc) => sc.id).filter((id) => !progress.story.seen[id]);
    ids.slice(0, -1).forEach(markSeen);
    return ids.slice(-1);
  }
  let lastFirstWin = null; // level index of the latest first-time win, for the map's postcard
  const levelLine = (i) => STORY.levelLines[String(i + 1)];
  function showPostcard(i, ms, onGone) {
    Story.postcard({ container: $('screen-levels'), level: i + 1, name: LEVELS[i].name, text: levelLine(i), ms, onGone });
    // The postcard never hides the next circle: the map scrolls the circle
    // above the postcard's resting place while the postcard rises (the track
    // has room below the last circle for this). Taps pass through it anyway.
    const pc = $('screen-levels').querySelector('.postcard'), node = mapNodeEl(Math.min(i + 1, LEVELS.length - 1));
    if (!pc || !node) return;
    const rise = new DOMMatrix(getComputedStyle(pc).transform).m42;
    const over = node.getBoundingClientRect().bottom + 12 - (pc.getBoundingClientRect().top - rise);
    if (over > 0) { const sc = $('map-scroll'); sc.scrollTo({ top: sc.scrollTop + over, behavior: reducedMotion() ? 'auto' : 'smooth' }); }
  }
  function townCard(c, next) {
    const t = STORY.town.find((x) => x.chapter === c);
    Story.storyCard({ label: t.caption, eyebrow: 'Wren Hollow grows', town: { on: townOn(), reveal: reducedMotion() ? null : c }, title: t.caption, body: `${t.chapterName} is connected.`, tap: 1200, onDone: next });
  }
  function endingCard(next) {
    const title = 'Wren Hollow is on air.';
    Story.storyCard({
      label: title, title, body: `All ${LEVELS.length} levels connected.`, row: true, escape: 1,
      buttons: [{ label: 'Story', run: () => { openStoryLog('levels'); next(); } }, { label: 'Level map', primary: true, run: next }],
    });
  }
  // Runs steps (fn(next)) one after another while the map is open.
  function chain(steps, done) {
    const go = () => {
      if (screen !== 'levels') return;
      const st = steps.shift();
      if (st) st(go); else if (done) done();
    };
    go();
  }
  // A chapter's close on the map: postcard (2.5s), closing scene, town card,
  // and after chapter 7 the epilogue and the ending card.
  function chapterClose(c, pcLevel, done) {
    const steps = [];
    if (pcLevel !== null) steps.push((next) => showPostcard(pcLevel, 2500, next));
    steps.push((next) => Story.play([endScene(c).id], { backdrop: 'map', context: 'Level map', onDone: next }));
    steps.push((next) => townCard(c, next));
    if (c === STORY_CHAPTERS[STORY_CHAPTERS.length - 1]) {
      if (!progress.story.seen[EPILOGUE]) steps.push((next) => Story.play([EPILOGUE], { onDone: next }));
      steps.push((next) => endingCard(next));
    }
    chain(steps, done);
  }
  // The one-time offer for players who had progress before the story.
  function catchUp(done) {
    const offered = () => { progress.story.offered = true; save(); };
    const ids = [PROLOGUE, ...STORY_CHAPTERS.filter((c) => progress.story.seen[endScene(c).id]).map((c) => endScene(c).id)];
    Story.storyCard({
      label: 'New: the story of Wren Hollow', eyebrow: 'New: the story of Wren Hollow', town: { on: townOn() },
      title: 'Wren Hollow has a story now.', body: 'Want the story so far?', escape: 1,
      buttons: [
        { label: 'Story so far (about 2 min)', primary: true, run: () => { offered(); Story.play(ids, { replay: true, backdrop: 'town', town: townOn(), onDone: done }); } },
        { label: 'Later', run: () => { offered(); done(); } },
      ],
    });
  }
  // The story steps for this opening of the map (see runMapEvents).
  function mapStory() {
    const out = { before: [], hold: null, holdAt: -1, after: [] };
    const pc = lastFirstWin;
    lastFirstWin = null;
    postcardReserve = pc !== null && storyOn() ? (landscape() ? 84 : 100) : 0;
    const ends = STORY_CHAPTERS.filter((c) => chapterDone(c) && !progress.story.seen[endScene(c).id]);
    if (!storyOn()) {
      ends.forEach((c) => markSeen(endScene(c).id));
      if (chapterDone(STORY_CHAPTERS[STORY_CHAPTERS.length - 1])) markSeen(EPILOGUE);
      return out;
    }
    if (!progress.story.offered) out.before.push(catchUp);
    if (ends.length) {
      ends.slice(0, -1).forEach((c) => markSeen(endScene(c).id));
      const c = ends[ends.length - 1];
      out.hold = (next) => chapterClose(c, pc, next);
      out.holdAt = levelsOfChapter(c).slice(-1)[0];
    } else if (pc !== null) out.after.push((next) => { showPostcard(pc, 4000); next(); });
    return out;
  }

  // ---------- Story log ----------
  let storyReturn = 'levels';
  function storyLogGroups() {
    const seen = (id) => !!progress.story.seen[id];
    const info = (sc) => {
      const t = sc.trigger;
      const lv = t.chapter ? levelsOfChapter(t.chapter) : [];
      const n = CHAPTERS.findIndex((c) => c.id === t.chapter) + 1;
      const [where, lock] = t.type === 'prologue' ? ['Before level 1', 'Reach level 1']
        : t.type === 'chapterStart' ? [`Chapter ${n} opening`, `Reach level ${lv[0] + 1}`]
        : t.type === 'chapterEnd' ? [`Chapter ${n} closing`, `Finish level ${lv[lv.length - 1] + 1}`]
        : t.type === 'levelStart' ? [`Before level ${t.level}`, `Reach level ${t.level}`]
        : t.type === 'levelWin' ? [`After level ${t.level}`, `Finish level ${t.level}`]
        : [`After level ${LEVELS.length}`, `Finish level ${LEVELS.length}`];
      return { id: sc.id, title: sc.title, where, lock, seen: seen(sc.id) };
    };
    const special = (type) => STORY.scenes.filter((sc) => sc.trigger.type === type).map(info);
    return [
      { title: 'Prologue', rows: special('prologue') },
      ...CHAPTERS.map((c, n) => ({ title: `Chapter ${n + 1}, ${c.name}`, rows: STORY.scenes.filter((sc) => sc.chapter === c.id && !['prologue', 'epilogue'].includes(sc.trigger.type)).map(info) })),
      { title: 'Epilogue', rows: special('epilogue') },
    ];
  }
  function openStoryLog(from) {
    storyReturn = from;
    $('story-transcript').hidden = true;
    $('story-list').hidden = false;
    $('story-head').textContent = 'Story';
    Story.renderLog($('story-list'), storyLogGroups(), {
      onPlay: (id) => { Audio.play('click'); Story.play([id], { replay: true, backdrop: 'town', town: townOn() }); },
      onRead: (id) => {
        Audio.play('click');
        Story.transcript($('story-transcript'), id);
        $('story-list').hidden = true;
        $('story-transcript').hidden = false;
        $('story-transcript').scrollTop = 0;
        $('story-back').focus({ preventScroll: true });
      },
    });
    showScreen('story');
  }

  // Board and map input waits a moment after any screen change, so the
  // second tap of a double tap on Play, Next or Replay can't build a tower
  // on the fresh board (or skip the road). A pointer that went down before
  // the change is ignored too.
  const INPUT_GUARD_MS = 300;
  let screenChangedAt = -1e9;
  const inputGuarded = (e) => performance.now() - screenChangedAt < INPUT_GUARD_MS || (e && e.timeStamp < screenChangedAt);

  function showScreen(name) {
    if (name !== screen) screenChangedAt = performance.now();
    screen = name;
    for (const s of screens) $('screen-' + s).hidden = s !== name;
    const inGame = name === null || name === 'pause' || name === 'win' || (name === 'story' && storyReturn === 'pause');
    app.classList.toggle('mode-menu', !inGame);
    app.classList.toggle('mode-game', inGame);
    for (const s of ['pause', 'win', 'settings']) $('screen-' + s).classList.toggle('dim', true);
    // Menus (title, map, settings) sit on the plain background; the board
    // is hidden and not drawn.
    if (!inGame) { state = null; $('toast').hidden = true; }
    if (name) { cancelDrag(true); closeCallout(); }
    if (name !== 'levels') { stopMapAnim(); Story.dismissPostcard(true); mapBusy = false; }
    if (name === 'title') updateTitle();
    requestAnimationFrame(fitBoard);
    const focusTarget = { title: 'title-play', levels: null, settings: 'settings-back', pause: 'pause-resume', win: 'win-next', story: 'story-back' }[name];
    // The title's main button only takes focus for keyboard players, so a
    // tap or a fresh load doesn't show a focus ring on it.
    if (name === 'title' && !keyboardUser) return;
    if (focusTarget) setTimeout(() => { const el = $(focusTarget); if (el && !el.hidden) el.focus({ preventScroll: true }); }, 30);
  }

  let keyboardUser = false;
  addEventListener('keydown', () => { keyboardUser = true; }, true);
  addEventListener('pointerdown', () => { keyboardUser = false; }, true);

  // Each start or restart of a level is a new attempt. Timers set during
  // an attempt (the win screen) check it, so a restart cancels them.
  let attempt = 0;
  function startLevel(index) {
    const level = LEVELS[index];
    const grid = L.parseLevel(level);
    cancelDrag(true);
    closeCallout();
    state = {
      attempt: ++attempt, index, level, grid, towers: [], moves: 0, history: [], hintUsed: false, won: false, lit: 0, violated: 0,
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
    const run = state.attempt;
    // The level's hint and one-time tip wait until any story scene is over.
    const begin = () => {
      if (!state || state.attempt !== run) return;
      toast(level.hint, 4200);
      if (level.callout && !progress.seen['callout-' + index]) {
        progress.seen['callout-' + index] = true;
        save();
        // In phone landscape a chip callout shares the side slot with the
        // start toast, so it waits for the toast to finish.
        const wait = landscape() && level.callout.at.startsWith('chip') ? 4400 : 350;
        setTimeout(() => { if (state && state.index === index && !screen && !state.history.length && !drag && !Story.active) showCallout(level.callout.text, level.callout.at); }, wait);
      }
    };
    const intro = introScenes(index);
    // The scene waits two frames so the board has its size for focus rings.
    lastAfter = null;
    if (intro.length && storyOn()) requestAnimationFrame(() => requestAnimationFrame(() => { if (state && state.attempt === run) playScenes(intro, begin, { context: `Level ${index + 1}, ${level.name}` }); }));
    else { intro.forEach(markSeen); begin(); }
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
    if (!prevStars) lastFirstWin = i;
    progress.stars[i] = Math.max(prevStars, stars);
    progress.best[i] = Math.min(progress.best[i] ?? Infinity, state.moves);
    save();
    const last = i === LEVELS.length - 1;
    // Pressing R (or leaving) within the 900ms makes a new attempt, and
    // the win screen must not then pop up over the fresh level.
    const run = state.attempt;
    const live = () => state && state.attempt === run && state.won;
    setTimeout(() => {
      if (!live()) return;
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
        if (n < stars) setTimeout(() => { if (!live()) return; el.classList.add('on'); Audio.play('star', n); }, 350 + n * 260);
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

  // Drop target and ghost. For every pointer type the tower lands on the
  // tile under the pointer (the finger, for touch). For touch and pen a
  // copy of the tower floats above the finger so the finger doesn't hide
  // it, lined up with the drop tile's column; the board marks the drop tile
  // itself (board.dropMark) so it shows round the fingertip. With the mouse
  // the ghost sits in the tile.
  const liftFor = (pointerType) => (pointerType === 'mouse' ? 0 : Math.max(56, 1.1 * (board.tile || 40)));
  // Where the floating ghost goes for an anchor point (the drop tile's
  // centre, or the finger when off the board). With no room above, as on
  // the top row in phone landscape, it moves to the side instead.
  function ghostAt(x, y, pointerType) {
    const lift = liftFor(pointerType);
    if (!lift) return [x, y];
    const half = ghostSize() / 2 + 2;
    if (y - lift >= half) return [x, y - lift];
    return [x + (x < window.innerWidth / 2 ? lift : -lift), Math.max(half, y)];
  }

  function startDrag(source, type, e, from) {
    const facing = source === 'board' ? state.towers[from][2] : 0;
    drag = {
      source, type, facing, from, started: true, id: e.pointerId, pointerType: e.pointerType,
      cx: e.clientX, cy: e.clientY, gx: 0, gy: 0, scale: 0.8, born: performance.now(),
      target: null, valid: false, overTray: false,
    };
    [drag.gx, drag.gy] = ghostAt(e.clientX, e.clientY, e.pointerType);
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

  // Where the ghost is heading: above the drop tile, or above the finger.
  function ghostCentre() {
    if (drag.target && !drag.overTray) return ghostAt(...tileCentre(...drag.target), drag.pointerType);
    return ghostAt(drag.cx, drag.cy, drag.pointerType);
  }

  // The drop target for a pointer at (cx, cy): null over the tray or off
  // the board, else the tile under the pointer. The pointer type no longer
  // matters (it is kept so callers and tests stay the same).
  function targetAt(cx, cy, pointerType) {
    const tr = $('tray').getBoundingClientRect();
    const overTray = cx >= tr.left && cx <= tr.right && cy >= tr.top && cy <= tr.bottom;
    return { overTray, tile: overTray ? null : board.tileAtPoint(cx, cy, true) };
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
    board.dropMark = drag.pointerType !== 'mouse';
    board.focusDish = null;
    board.hoverOk = drag.valid;
    board.setPreview(tile, tile && drag.valid ? { tower: newTower(drag.type, tile[0], tile[1], drag.facing) } : null);
  }

  function endDrag() {
    const d = drag;
    drag = null;
    $('tray').classList.remove('drop', 'removing');
    board.slot = null;
    board.dropMark = false;
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
    board.dropMark = false;
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
    if (!state || screen || press || drag || state.won || inputGuarded(e) || Story.active) return;
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
    if (!state || screen || press || drag || state.won || inputGuarded(e) || Story.active) return;
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
    if (e.key === 'Escape' && !Story.active) {
      const back = { settings: 'settings-back', story: 'story-back', win: 'win-levels' }[screen];
      // stopImmediatePropagation: the map's own Esc must not also act on this key.
      if (back) { e.preventDefault(); e.stopImmediatePropagation(); if (screen === 'win') { Audio.play('click'); openLevels({ after: state.index }); } else $(back).click(); return; }
    }
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

  on('title-play', clicky(() => {
    if (allBeaten()) { openLevels(); return; }
    // A chapter whose close hasn't played yet (the map was left early): the
    // map plays it first, so the story never runs out of order.
    if (storyOn() && STORY_CHAPTERS.some((c) => chapterDone(c) && !progress.story.seen[endScene(c).id])) { openLevels(); return; }
    const go = () => startLevel(firstUnfinished());
    // A fresh save hears the prologue first.
    if (beatenCount() === 0 && !progress.story.seen[PROLOGUE]) playScenes([PROLOGUE], go);
    else go();
  }));
  on('map-story', () => { if (mapTapEaten()) return; Audio.play('click'); openStoryLog('levels'); });
  on('pause-story', clicky(() => openStoryLog('pause')));
  on('story-back', clicky(() => {
    if (!$('story-transcript').hidden) {
      $('story-transcript').hidden = true;
      $('story-list').hidden = false;
      return;
    }
    if (storyReturn === 'levels') openLevels({ after: lastAfter }); else showScreen(storyReturn);
  }));
  $('story-toggle').addEventListener('change', (e) => { progress.story.on = e.target.checked; save(); });
  $('story-speed').addEventListener('change', (e) => { if (SPEEDS.includes(e.target.value)) { progress.story.speed = e.target.value; save(); } });
  on('title-sound', () => setSound(!progress.sound, true));
  on('map-play', () => { if (mapTapEaten()) return; Audio.play('click'); const c = currentLevel(); if (c >= 0) startLevel(c); });
  on('title-levels', clicky(openLevels));
  on('title-settings', clicky(() => { settingsReturn = 'title'; openSettings(); }));
  on('levels-back', () => { if (mapTapEaten()) return; Audio.play('click'); showScreen('title'); });
  on('settings-back', clicky(() => showScreen(settingsReturn)));

  on('pause-resume', resume);
  on('pause-restart', () => { Audio.play('click'); startLevel(state.index); });
  on('pause-levels', clicky(openLevels));

  // Next level goes by the map: the road draws on to the next circle,
  // which is then focused and highlighted, and one tap enters it.
  on('win-next', clicky(() => openLevels({ after: state.index })));
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
    progress.road = 0;
    progress.story = { seen: {}, townShown: [], offered: true, on: progress.story.on, speed: progress.story.speed };
    save();
    btn.classList.remove('confirm');
    btn.textContent = 'Progress erased';
    updateTitle();
    setTimeout(() => { btn.textContent = 'Reset progress'; }, 1600);
  });

  let settingsReturn = 'title';
  function openSettings() {
    $('sound-toggle').checked = progress.sound;
    $('story-toggle').checked = progress.story.on;
    $('story-speed').value = progress.story.speed;
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
    for (const btn of [$('mute-btn'), $('title-sound')]) {
      btn.querySelector('use').setAttribute('href', enabled ? '#i-sound' : '#i-mute');
      btn.setAttribute('aria-label', enabled ? 'Mute sound' : 'Unmute sound');
      btn.setAttribute('aria-pressed', String(!enabled));
    }
    if (announce && enabled) Audio.play('click');
  }

  // ---------- Title ----------
  const allBeaten = () => LEVELS.every((_, i) => starsFor(i) > 0);
  const totalStars = () => LEVELS.reduce((a, _, i) => a + starsFor(i), 0);
  const beatenCount = () => LEVELS.filter((_, i) => starsFor(i) > 0).length;
  let titleShown = false;
  function updateTitle() {
    const done = beatenCount(), N = LEVELS.length;
    let label, sub;
    if (done === N) { label = 'Play again'; sub = `All ${N} levels connected`; }
    else {
      const i = firstUnfinished();
      label = done ? 'Continue' : 'Play';
      sub = `Level ${i + 1}, ${LEVELS[i].name}`;
    }
    $('title-play-label').textContent = label;
    $('title-play-sub').textContent = sub;
    $('title-play').setAttribute('aria-label', `${label}, ${sub.charAt(0).toLowerCase()}${sub.slice(1)}`);
    const stars = totalStars();
    $('title-progress').hidden = done === 0;
    $('title-stars').textContent = `${stars} / ${N * 3}`;
    $('title-levels-done').textContent = `${done} of ${N} levels`;
    $('title-meter').style.width = `${(100 * done) / N}%`;
    $('title-progress').setAttribute('aria-label', `${stars} of ${N * 3} stars, ${done} of ${N} levels`);
    // The entrance plays on the first title display after page load only.
    $('screen-title').classList.toggle('enter', !titleShown && !reducedMotion());
    renderTitleTown();
    titleShown = true;
  }

  // The start screen's town: one landmark lit per connected chapter. A
  // landmark earned since the start screen last showed brightens in once.
  function renderTitleTown() {
    const on = townOn();
    const fresh = on.filter((c) => !progress.story.townShown.includes(c));
    if (fresh.length) { progress.story.townShown.push(...fresh); save(); }
    const box = $('title-hero');
    box.innerHTML = '';
    box.appendChild(Story.townSvg({ on, reveal: fresh.length && !reducedMotion() ? fresh[fresh.length - 1] : null }));
  }

  // ---------- Level map (road path) ----------
  // Levels sit on one winding road, top to bottom. Node i is at
  // x = CX + A sin(i pi / 3). See Iris's polish spec for the geometry.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const currentLevel = () => (allBeaten() ? -1 : firstUnfinished());
  const chapterIndex = (i) => CHAPTERS.findIndex((c) => c.id === chapterOf(LEVELS[i]));
  const chapterLevels = (n) => LEVELS.map((_, i) => i).filter((i) => chapterIndex(i) === n);
  let map = null;      // layout of the open map
  let mapAnim = null;  // running road animation

  function mapLayout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const COL = Math.min(vw - 32, 440), CX = COL / 2, A = Math.round(COL * 0.26);
    const SP = vh < 560 ? 88 : vw >= 900 ? 104 : 96;
    const nodes = [], banners = [];
    let y = 32;
    CHAPTERS.forEach((ch, n) => {
      const idx = chapterLevels(n);
      if (!idx.length) return;
      banners.push({ n, top: y, first: idx[0], last: idx[idx.length - 1] });
      let cy = y + 64 + 70;
      for (const i of idx) { nodes[i] = { x: CX + A * Math.sin((i * Math.PI) / 3), y: cy }; cy += SP; }
      y = cy - SP + 76;
    });
    const last = nodes[nodes.length - 1].y;
    // 140 for the Play button, plus room to lift the last circle above a postcard.
    return { COL, CX, A, SP, nodes, banners, height: last + 30 + 140 + 110 };
  }

  // What the map shows. Segment k joins level k to level k + 1.
  function mapView() {
    const cur = currentLevel();
    const frontier = cur < 0 ? LEVELS.length : cur;
    const N = LEVELS.length;
    // Pending segments: beaten since the road was last shown. Animate at
    // most the last two; older ones show as already travelled.
    const pending = [];
    for (let k = Math.min(progress.road, N - 1); k < Math.min(frontier, N - 1); k++) if (starsFor(k) > 0) pending.push(k);
    return { cur, frontier, animate: reducedMotion() ? [] : pending.slice(-2), pending };
  }

  function nodeState(i, cur) {
    if (i === cur) return 'current';
    if (starsFor(i) > 0) return starsFor(i) === 3 ? 'beaten perfect' : 'beaten';
    return isUnlocked(i) ? 'open' : 'locked';
  }

  const starPill = (s) => `<span class="pill" aria-hidden="true">${[0, 1, 2].map((k) => `<svg class="${k < s ? 'on' : 'off'}"><use href="#i-star"/></svg>`).join('')}</span>`;

  function buildNode(i, st) {
    const lv = LEVELS[i], p = map.nodes[i];
    const d = st === 'current' ? 72 : 60;
    const el = document.createElement('button');
    el.className = `map-node ${st}`;
    el.dataset.level = i;
    el.style.cssText = `left:${p.x - d / 2}px;top:${p.y - d / 2}px;width:${d}px;height:${d}px`;
    const s = starsFor(i);
    if (st === 'locked') {
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('aria-label', `Level ${i + 1}, locked`);
      el.innerHTML = '<svg aria-hidden="true"><use href="#i-lock"/></svg>';
    } else {
      el.innerHTML = `<span class="num">${i + 1}</span>`;
      if (st === 'current') {
        el.setAttribute('aria-label', `Level ${i + 1}, ${lv.name}, next to play`);
        el.insertAdjacentHTML('beforeend', reducedMotion() ? '<span class="ring still"></span>' : '<span class="ring"></span><span class="ring"></span>');
      } else if (s) {
        el.setAttribute('aria-label', `Level ${i + 1}, ${lv.name}, ${s} of 3 stars`);
        el.insertAdjacentHTML('beforeend', starPill(s));
        el.querySelector('.pill').style.top = `${d / 2 + 21}px`;
      } else el.setAttribute('aria-label', `Level ${i + 1}, ${lv.name}`);
    }
    return el;
  }

  // Name pill beside a node, on the side away from the road's swing.
  function buildLabel(i, st) {
    const p = map.nodes[i], d = st === 'current' ? 72 : 60;
    const el = document.createElement('div');
    const left = p.x > map.CX;
    el.className = `map-label ${left ? 'left' : 'right'}${st === 'current' ? ' show' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<span class="k">Level ${i + 1}</span><span class="n"></span>`;
    el.querySelector('.n').textContent = LEVELS[i].name;
    if (starsFor(i) > 0 && levelLine(i)) {
      el.classList.add('has-line');
      el.insertAdjacentHTML('beforeend', '<span class="ln"></span>');
      el.querySelector('.ln').textContent = levelLine(i);
    }
    const room = left ? p.x - d / 2 - 14 : map.COL - (p.x + d / 2 + 14);
    el.style.maxWidth = `${Math.max(80, room)}px`;
    el.style.top = `${p.y - 24}px`;
    if (left) el.style.right = `${map.COL - (p.x - d / 2 - 14)}px`;
    else el.style.left = `${p.x + d / 2 + 14}px`;
    return el;
  }

  function buildBanner(b, open) {
    const ch = CHAPTERS[b.n];
    const idx = chapterLevels(b.n);
    const stars = idx.reduce((a, i) => a + starsFor(i), 0);
    const el = document.createElement('div');
    const w = Math.min(map.COL - 24, 320);
    el.className = `map-banner${open ? '' : ' locked'}`;
    el.dataset.chapter = b.n;
    el.setAttribute('role', 'heading');
    el.setAttribute('aria-level', '3');
    el.style.cssText = `left:${map.CX - w / 2}px;top:${b.top}px;width:${w}px`;
    el.innerHTML = `<span class="disc"><svg aria-hidden="true"><use href="#${ch.icon}"/></svg></span>` +
      '<span class="t"><span class="k"></span><span class="n"></span></span><span class="s"></span>';
    el.querySelector('.n').textContent = ch.name;
    setBannerOpen(el, b, open, stars, idx.length);
    if (chapterDone(ch.id)) { el.classList.add('done'); el.querySelector('.n').insertAdjacentHTML('afterend', '<span class="tag">Connected</span>'); }
    // A tap on an open chapter's banner replays its opening scene.
    if (open && progress.story.seen[startScene(ch.id).id]) {
      el.classList.add('replay');
      el.dataset.scene = startScene(ch.id).id;
      el.title = 'Replay the chapter opening';
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${el.getAttribute('aria-label')}. Replay the chapter opening`);
    }
    return el;
  }
  function setBannerOpen(el, b, open, stars, count) {
    el.classList.toggle('locked', !open);
    // Short enough to fit one line on a phone; the aria label says it in full.
    el.querySelector('.k').textContent = open ? `Chapter ${b.n + 1}` : `Chapter ${b.n + 1}, after level ${b.first}`;
    el.querySelector('.s').innerHTML = open ? `<svg aria-hidden="true"><use href="#i-star"/></svg>${stars} / ${count * 3}` : '<svg aria-hidden="true"><use href="#i-lock"/></svg>';
    el.setAttribute('aria-label', `Chapter ${b.n + 1}, ${CHAPTERS[b.n].name}, ${open ? `${stars} of ${count * 3} stars` : `opens after level ${b.first}`}`);
  }

  const segPath = (a, b) => {
    const dy = b.y - a.y;
    return `M${a.x.toFixed(1)} ${a.y} C${a.x.toFixed(1)} ${a.y + dy / 2} ${b.x.toFixed(1)} ${b.y - dy / 2} ${b.x.toFixed(1)} ${b.y}`;
  };

  // Scenery from Iris's title hero: a house (lit once its level is beaten)
  // or a small tree, on the side of the road the road isn't on.
  function sceneryFor(i, cur) {
    const sn = Math.sin((i * Math.PI) / 3);
    if (Math.abs(sn) < 0.5 || i === cur) return '';
    const x = map.CX - 1.05 * map.A * sn, y = map.nodes[i].y + 14;
    const locked = !isUnlocked(chapterLevels(chapterIndex(i))[0]);
    const cls = `scenery${locked ? ' locked' : ''}`;
    if (A.hash(i, 0) < 0.55) {
      return `<g class="${cls}" transform="translate(${x.toFixed(1)} ${y})"><ellipse cx="2" cy="1" rx="9" ry="3.1" fill="rgba(12,18,26,0.28)"/>` +
        '<circle cx="0" cy="-9" r="9" fill="#3f5f48"/><circle cx="-2" cy="-11" r="5.4" fill="#4c6f53"/></g>';
    }
    const win = starsFor(i) > 0 ? '#ffd27a' : '#3a4552';
    return `<g class="${cls}" transform="translate(${x.toFixed(1)} ${y}) scale(0.9)"><ellipse cx="2" cy="1" rx="16" ry="3.5" fill="rgba(12,18,26,0.28)"/>` +
      '<rect x="-12" y="-14" width="24" height="14" rx="1.5" fill="#e6dccb"/><rect x="-12" y="-3" width="24" height="3" fill="#c9bca6"/>' +
      '<path d="M-15 -13 L-10 -22 H10 L15 -13 Z" fill="#c47a5a"/><path d="M-15 -13 H15 L14 -11 H-14 Z" fill="#a5604a"/>' +
      '<rect x="5" y="-25" width="3" height="5" fill="#a5604a"/><rect x="-2" y="-8" width="4" height="8" rx="1" fill="#7a5a44"/>' +
      `<rect x="-9" y="-10" width="5" height="4" rx="0.8" fill="${win}"/><rect x="4" y="-10" width="5" height="4" rx="0.8" fill="${win}"/></g>`;
  }

  // Builds the map. With `pre`, the segments in view.animate are drawn
  // untravelled and their end nodes and banners as they were before.
  function renderMap(view, pre) {
    map = mapLayout();
    const track = $('map-track');
    track.innerHTML = '';
    track.style.width = `${map.COL}px`;
    track.style.height = `calc(${map.height}px + var(--safe-b))`;
    $('screen-levels').style.setProperty('--col', `${map.COL}px`);
    const N = LEVELS.length;
    const animating = new Set(pre ? view.animate : []);
    const hiddenNodes = new Set(pre ? view.animate.map((k) => k + 1) : []);
    let all = '';
    for (let k = 0; k < N - 1; k++) all += segPath(map.nodes[k], map.nodes[k + 1]) + ' ';
    let scenery = '';
    for (let i = 0; i < N; i++) scenery += sceneryFor(i, view.cur);
    let travelled = '';
    for (let k = 0; k < N - 1; k++) {
      if (starsFor(k) > 0 && !animating.has(k)) {
        const d = segPath(map.nodes[k], map.nodes[k + 1]);
        travelled += `<path class="glow" d="${d}"/><path class="line" d="${d}"/>`;
      }
    }
    track.insertAdjacentHTML('beforeend', `<svg class="map-road" xmlns="${SVGNS}" width="${map.COL}" height="${map.height}" viewBox="0 0 ${map.COL} ${map.height}" aria-hidden="true">` +
      `${scenery}<path class="shadow" d="${all}"/><path class="bed" d="${all}"/><path class="dots" d="${all}"/><g class="travelled">${travelled}</g></svg>`);
    for (const b of map.banners) {
      const open = isUnlocked(b.first) && !(hiddenNodes.has(b.first));
      track.appendChild(buildBanner(b, open));
    }
    for (let i = 0; i < N; i++) {
      const st = hiddenNodes.has(i) ? 'locked' : nodeState(i, view.cur);
      const node = buildNode(i, st);
      track.appendChild(node);
      if (st !== 'locked') track.appendChild(buildLabel(i, st));
    }
    markArrive();
    $('star-total').textContent = `${totalStars()} / ${N * 3}`;
    const cur = view.cur;
    $('map-cta').hidden = cur < 0;
    if (cur >= 0) $('map-play-label').textContent = `Play level ${cur + 1}`;
  }

  // The scroll area's visible band: minus the CTA bar at the bottom.
  // While a postcard is due, its room above the Play button counts as hidden,
  // so the road scrolls the next circle clear of it as it draws (no late jump).
  let postcardReserve = 0;
  function mapBand() {
    const sc = $('map-scroll');
    const cta = $('map-cta');
    const ctaH = cta.hidden ? 0 : cta.getBoundingClientRect().height;
    return { sc, h: Math.max(80, sc.clientHeight - ctaH - postcardReserve) };
  }
  function scrollMapTo(y, at, smooth, maxTop = Infinity) {
    const { sc, h } = mapBand();
    const top = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, y - h * at, maxTop));
    if (smooth && !reducedMotion()) sc.scrollTo({ top, behavior: 'smooth' });
    else sc.scrollTop = top;
  }

  // `after`: the level just won (from the win screen's Next level). The
  // map then lands on the circle after it once the map events have played.
  function openLevels({ after = null } = {}) {
    stopMapAnim();
    mapArrive = null;
    lastAfter = after;
    const view = mapView();
    const story = mapStory();
    // The road counter is saved as soon as the map opens, so the animation
    // plays once even if the map is left part way through.
    const pendingAnim = view.animate.length > 0;
    if (view.pending.length || progress.road < view.frontier) { progress.road = Math.max(progress.road, view.frontier); save(); }
    showScreen('levels');
    // A chapter close with no road to draw (reduced motion): keep the next
    // chapter locked until the close is over, then show the opened map.
    const holdLocked = story.hold && !pendingAnim && story.holdAt + 1 < LEVELS.length;
    renderMap(holdLocked ? { ...view, animate: [story.holdAt] } : view, pendingAnim || holdLocked);
    if (holdLocked) {
      const hold = story.hold;
      story.hold = (next) => hold(() => {
        if (screen === 'levels') { const sc = $('map-scroll'), top = sc.scrollTop; renderMap(view, false); sc.scrollTop = top; }
        next();
      });
    }
    let focusNode = view.cur >= 0 ? view.cur : LEVELS.length - 1;
    if (after !== null) focusNode = pendingAnim ? view.animate[view.animate.length - 1] + 1 : Math.min(after + 1, LEVELS.length - 1);
    if (pendingAnim) scrollMapTo(map.nodes[view.animate[0]].y, 0.35);
    else {
      // If the level opens a chapter, keep that chapter's banner in view
      // (short landscape screens would otherwise tuck it under the header).
      const head = map.banners.find((b) => b.first === focusNode);
      scrollMapTo(map.nodes[focusNode].y, 0.45, false, head ? head.top - 8 : Infinity);
    }
    $('map-bar').classList.toggle('scrolled', $('map-scroll').scrollTop > 4);
    if (!pendingAnim && view.pending.length && reducedMotion()) $('map-track').classList.add('crossfade');
    runMapEvents(view, focusNode, after !== null, story);
  }

  // ---------- Map events ----------
  // What plays on the map as it opens, one after another: the road fill
  // today. Other features (story scenes after a chapter win, say) add a
  // step with queueMapEvent(fn) before the map opens; fn(done) plays it and
  // calls done() when it ends. When the queue is empty the map lands on
  // `focusNode`: focused, and highlighted when `arrive` is set.
  // While map events play (the road, a chapter's close), a tap or key on the
  // map fast-forwards the current step instead of leaving: the remaining
  // steps still run in order, so the story is never skipped or reordered.
  let mapBusy = false;
  function mapFastForward() {
    if (mapAnim && !mapAnim.held) { skipMapAnim(); return; }
    if (Story.state.postcard) Story.dismissPostcard(false);
  }
  const mapTapEaten = () => mapBusy || performance.now() - skippedAt < 500;
  let lastAfter = null; // the level whose win opened the map (to restore its landing)
  const queuedMapEvents = [];
  function queueMapEvent(fn) { queuedMapEvents.push(fn); }
  // `story` (from mapStory): steps before the road, a `hold` that the road
  // pauses for at the banner after level `holdAt` (a chapter's close; it
  // runs after the road if the road doesn't pass there), and steps after.
  function runMapEvents(view, focusNode, arrive, story = {}) {
    const steps = [...(story.before || [])];
    let holdUsed = false;
    const hold = story.hold ? (resume) => { holdUsed = true; story.hold(resume); } : null;
    if (view.animate.length) steps.push((done) => startMapAnim(view, done, hold, story.holdAt));
    if (hold) steps.push((done) => (holdUsed ? done() : hold(done)));
    steps.push(...queuedMapEvents.splice(0));
    steps.push(...(story.after || []));
    mapBusy = true;
    const next = () => {
      if (screen !== 'levels') { mapBusy = false; return; }
      const step = steps.shift();
      if (step) step(next);
      else { mapBusy = false; arriveAt(focusNode, arrive); }
    };
    next();
  }
  let mapArrive = null; // node highlighted after a win (kept across a relayout)
  function arriveAt(i, highlight) {
    if (highlight) { mapArrive = i; markArrive(); }
    setTimeout(() => { const el = mapNodeEl(i); if (el && screen === 'levels') el.focus({ preventScroll: true }); }, 30);
  }
  function markArrive() {
    const el = mapArrive === null ? null : mapNodeEl(mapArrive);
    if (el) el.classList.add('arrive');
  }

  const mapNodeEl = (i) => $('map-track').querySelector(`.map-node[data-level="${i}"]`);

  $('map-scroll').addEventListener('scroll', () => $('map-bar').classList.toggle('scrolled', $('map-scroll').scrollTop > 4), { passive: true });

  $('map-track').addEventListener('click', (e) => {
    const banner = e.target.closest('.map-banner.replay');
    if (banner && !mapTapEaten() && !inputGuarded()) { Audio.play('click'); Story.play([banner.dataset.scene], { replay: true, backdrop: 'town', town: townOn() }); return; }
    const node = e.target.closest('.map-node');
    if (!node || mapAnim || mapTapEaten() || inputGuarded()) return;
    const i = Number(node.dataset.level);
    if (node.classList.contains('locked')) {
      Audio.play('invalid');
      bump(node);
      mapToast(`Finish level ${i} first.`);
      return;
    }
    Audio.play('click');
    startLevel(i);
  });

  let mapToastTimer = 0;
  function mapToast(text) {
    const el = $('map-toast');
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(mapToastTimer);
    mapToastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // Keyboard on the map: arrows move between nodes, Home goes to the
  // current node, Esc goes back. Enter and Space press the focused node.
  document.addEventListener('keydown', (e) => {
    if (screen !== 'levels' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (Story.active) return;
    if (mapBusy) { mapFastForward(); e.preventDefault(); return; }
    const k = e.key;
    // Enter or Space on a chapter banner replays its opening.
    const fb = document.activeElement && document.activeElement.closest && document.activeElement.closest('.map-banner.replay');
    if (fb && (k === 'Enter' || k === ' ')) { e.preventDefault(); fb.click(); return; }
    if (k === 'Escape') { e.preventDefault(); Audio.play('click'); showScreen('title'); return; }
    const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('.map-node');
    const at = focused ? Number(focused.dataset.level) : -1;
    let to = null;
    if (k === 'ArrowUp' || k === 'ArrowLeft') to = Math.max(0, at < 0 ? 0 : at - 1);
    else if (k === 'ArrowDown' || k === 'ArrowRight') to = Math.min(LEVELS.length - 1, at + 1);
    else if (k === 'Home') to = currentLevel() >= 0 ? currentLevel() : LEVELS.length - 1;
    if (to === null) return;
    e.preventDefault();
    const el = mapNodeEl(to);
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
  });

  // ---------- Road animation ----------
  // Timeline per segment k -> k + 1 (t = 0 is 250ms after the map opens):
  // 0 node k pops; 120 the line draws (700ms, 900 across a banner) with a
  // packet riding its head; then node k + 1 unlocks with a pop and a burst
  // ring; 360ms later its name label fades in. Any tap or key skips.
  const ease = (t) => { // cubic-bezier(.45, 0, .25, 1), solved numerically
    let lo = 0, hi = 1;
    for (let n = 0; n < 20; n++) {
      const m = (lo + hi) / 2, x = 3 * 0.45 * m * (1 - m) ** 2 + 3 * 0.25 * m * m * (1 - m) + m ** 3;
      if (x < t) lo = m; else hi = m;
    }
    const u = (lo + hi) / 2;
    return 3 * u * u * (1 - u) + u ** 3;
  };

  function startMapAnim(view, onEnd, hold = null, holdAt = -1) {
    const timers = [];
    let raf = 0;
    const anim = { view, timers, done: false, resized: false, onEnd, hold, holdAt, held: false, heldDone: false, stop: () => { timers.forEach(clearTimeout); cancelAnimationFrame(raf); } };
    mapAnim = anim;
    const at = (ms, fn) => timers.push(setTimeout(() => { if (mapAnim === anim) fn(); }, ms));
    const track = $('map-track');
    const svg = track.querySelector('.map-road .travelled');
    const segs = view.animate.slice();
    const finish = () => {
      mapAnim = null;
      anim.done = true;
      // A resize during the animation was skipped: lay the map out now.
      if (anim.resized) relayoutMap(view);
      if (onEnd) onEnd();
    };
    const runSeg = (n) => {
      const k = segs[n], a = map.nodes[k], b = map.nodes[k + 1];
      const banner = map.banners.find((bn) => bn.first === k + 1);
      const drawMs = banner ? 900 : 700;
      // The road stops at the banner while the chapter before it closes.
      const pauseHere = banner && hold && k === holdAt;
      const n0 = mapNodeEl(k);
      if (n0) { n0.classList.remove('ack'); void n0.offsetWidth; n0.classList.add('ack'); }
      Audio.play('lift');
      at(120, () => {
        const d = segPath(a, b);
        svg.insertAdjacentHTML('beforeend', `<path class="glow" d="${d}"/><path class="line" d="${d}"/>`);
        const paths = [...svg.querySelectorAll('path')].slice(-2);
        const len = paths[1].getTotalLength();
        paths.forEach((p) => { p.style.strokeDasharray = `${len} ${len}`; p.style.strokeDashoffset = `${len}`; });
        const packet = document.createElement('div');
        packet.className = 'map-packet';
        track.appendChild(packet);
        const { sc, h } = mapBand();
        if (b.y > sc.scrollTop + h - 40) scrollMapTo(b.y, 0.55, true);
        let start = performance.now(), opened = false;
        const step = (now) => {
          if (mapAnim !== anim) { packet.remove(); return; }
          const p = Math.min(1, (now - start) / drawMs);
          const e = ease(p);
          paths.forEach((el) => { el.style.strokeDashoffset = `${len * (1 - e)}`; });
          const pt = paths[1].getPointAtLength(len * e);
          packet.style.left = `${pt.x}px`; packet.style.top = `${pt.y}px`;
          if (banner && !opened && pt.y >= banner.top - (pauseHere ? 6 : 0)) {
            if (pauseHere && !anim.held) {
              anim.held = true;
              const pausedAt = now - start;
              hold(() => {
                if (mapAnim !== anim) return;
                anim.heldDone = true;
                opened = true;
                openBanner(banner);
                start = performance.now() - pausedAt;
                raf = requestAnimationFrame(step);
              });
              return;
            }
            opened = true;
            openBanner(banner);
          }
          if (p < 1) { raf = requestAnimationFrame(step); return; }
          packet.remove();
          paths.forEach((el) => { el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; });
          unlockNode(k + 1, view);
          if (n + 1 < segs.length) at(710, () => runSeg(n + 1));
          else at(560, finish);
        };
        raf = requestAnimationFrame(step);
      });
    };
    at(250, () => runSeg(0));
  }

  function openBanner(b) {
    const el = $('map-track').querySelector(`.map-banner[data-chapter="${b.n}"]`);
    if (!el) return;
    const idx = chapterLevels(b.n);
    setBannerOpen(el, b, true, idx.reduce((a, i) => a + starsFor(i), 0), idx.length);
    el.classList.remove('opening'); void el.offsetWidth; el.classList.add('opening');
  }

  function unlockNode(i, view) {
    const old = mapNodeEl(i);
    if (!old) return;
    const st = nodeState(i, view.cur);
    const el = buildNode(i, st);
    const d = st === 'current' ? 72 : 60;
    el.style.setProperty('--from', String(60 / d));
    el.classList.add('unlocking');
    el.insertAdjacentHTML('beforeend', '<span class="lock-out" aria-hidden="true"><svg><use href="#i-lock"/></svg></span><span class="burst" aria-hidden="true"></span>');
    // The idle pulse rings wait until the label is in.
    el.querySelectorAll('.ring').forEach((r, n) => { r.style.animationDelay = `${360 + n * 900}ms`; });
    old.replaceWith(el);
    const label = buildLabel(i, st);
    if (st === 'current') { label.classList.remove('show'); setTimeout(() => label.classList.add('show', 'label-in'), 360); }
    el.after(label);
    setTimeout(() => { el.querySelectorAll('.lock-out, .burst').forEach((x) => x.remove()); el.classList.remove('unlocking'); }, 650);
    Audio.play('chime');
  }

  function stopMapAnim() {
    if (!mapAnim) return;
    const a = mapAnim;
    mapAnim = null;
    a.stop();
  }
  // Skip: jump straight to the end state.
  function skipMapAnim() {
    if (!mapAnim || mapAnim.held) return; // the road waits at a banner while a chapter closes
    const { view, onEnd, hold, holdAt } = mapAnim;
    stopMapAnim();
    const sc = $('map-scroll'), top = sc.scrollTop;
    // With a chapter close still to play, the road jumps to the locked banner
    // and the next chapter opens only after the close.
    const holdHere = hold && view.animate.includes(holdAt);
    renderMap(holdHere ? { ...view, animate: [holdAt] } : view, holdHere);
    sc.scrollTop = top;
    if (hold) {
      hold(() => {
        if (holdHere && screen === 'levels') { const t = sc.scrollTop; renderMap(view, false); sc.scrollTop = t; }
        if (onEnd) onEnd();
      });
      return;
    }
    if (onEnd) { onEnd(); return; }
    const el = mapNodeEl(view.cur >= 0 ? view.cur : LEVELS.length - 1);
    if (el) el.focus({ preventScroll: true });
  }
  // A tap that skips must not also press the node under it.
  let skippedAt = -1e9;
  // The second tap of a double tap on Next level doesn't skip the road.
  // A tap on the map while events play fast-forwards them (and does nothing
  // else). Otherwise a tap anywhere dismisses the postcard and goes through.
  $('screen-levels').addEventListener('pointerdown', (e) => {
    if (!mapBusy) { if (Story.state.postcard) Story.dismissPostcard(false); return; }
    skippedAt = performance.now();
    e.stopPropagation();
    if (!inputGuarded(e)) mapFastForward();
  }, true);

  // A resize rebuilds the map (positions depend on the window size). One
  // during the road animation waits for it to end.
  function relayoutMap(view) {
    const sc = $('map-scroll'), frac = sc.scrollTop / Math.max(1, sc.scrollHeight);
    const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('.map-node');
    const at = focused ? focused.dataset.level : null;
    renderMap(view, false);
    sc.scrollTop = frac * sc.scrollHeight;
    if (at !== null) { const el = mapNodeEl(at); if (el) el.focus({ preventScroll: true }); }
  }
  window.addEventListener('resize', () => {
    if (screen !== 'levels') return;
    if (mapAnim) { mapAnim.resized = true; return; }
    relayoutMap(mapView());
  });

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
    // Pin the CSS size to the same window size the backing store uses. With
    // 100vw x 100vh, mobile Safari stretches the layer to its tallest
    // viewport (toolbar hidden), so the ghost drew below the finger.
    if (dragCanvas.style.width !== `${w}px`) dragCanvas.style.width = `${w}px`;
    if (dragCanvas.style.height !== `${h}px`) dragCanvas.style.height = `${h}px`;
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
      const [goalX, goalY] = ghostCentre();
      let goalScale = 1, alpha = 0.85;
      if (drag.target && !drag.overTray) alpha = drag.valid ? 0.85 : 0.45;
      else { goalScale = 0.8; alpha = 0.5; }
      const grow = still ? 1 : Math.min(1, (now - drag.born) / 120);
      const k = still ? 1 : Math.min(1, 16 / 80 * 1.6);
      drag.gx += (goalX - drag.gx) * (drag.target ? k : 1);
      drag.gy += (goalY - drag.gy) * (drag.target ? k : 1);
      drag.scale += (goalScale * (0.8 + 0.2 * grow) - drag.scale) * (still ? 1 : 0.35);
      const size = (drag.target ? board.tile : ghostSize()) * drag.scale;
      if (drag.pointerType !== 'mouse') {
        // Tether from the ghost down to the drop tile (or the finger).
        const [ax, ay] = drag.target && !drag.overTray ? tileCentre(...drag.target) : [drag.cx, drag.cy];
        dctx.strokeStyle = 'rgba(233, 237, 241, 0.35)';
        dctx.lineWidth = 2;
        dctx.beginPath(); dctx.moveTo(ax, ay); dctx.lineTo(drag.gx, drag.gy + size * 0.35); dctx.stroke();
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
    if (!app.classList.contains('mode-menu')) board.frame(now);
    drawDragLayer(now);
    if (callout && performance.now() > callout.until) closeCallout();
    perf.renderMs += performance.now() - t0;
    perf.frames++;
    requestAnimationFrame(loop);
  }

  // Test hook for the automated playthrough; harmless for players.
  window.__signalTest = {
    startLevel, act, undo, hint, selectType, board, targetAt, openLevels, queueMapEvent, story: Story, townOn, openStoryLog,
    get progress() { return progress; },
    get mapAnim() { return !!mapAnim; },
    get state() { return state; },
    get drag() { return drag && { source: drag.source, type: drag.type, target: drag.target, valid: drag.valid, overTray: drag.overTray, ghost: ghostCentre() }; },
    remaining: (type) => remaining(type),
  };

  setSound(progress.sound !== false, false);
  showScreen('title');
  fitBoard();
  requestAnimationFrame(loop);
})();
