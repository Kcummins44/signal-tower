(function () {
  const L = window.SignalLogic;
  const STORAGE_KEY = 'signal-tower-progress';

  const $ = (id) => document.getElementById(id);
  const screens = { select: $('select-screen'), game: $('game-screen') };
  const board = $('board');

  let state = null; // { index, grid, towers: [[x,y]], moves, won }
  let progress = loadProgress(); // { [levelIndex]: bestMoves }

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }

  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
    catch { /* storage unavailable: progress lasts for this session only */ }
  }

  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
    $('win-screen').hidden = true;
  }

  // ---------- Level select ----------
  function renderLevelSelect() {
    const list = $('level-list');
    list.innerHTML = '';
    LEVELS.forEach((level, i) => {
      const best = progress[i];
      const card = document.createElement('button');
      card.className = 'level-card' + (best != null ? ' done' : '');
      card.innerHTML =
        `<span class="num">Level ${i + 1}</span>` +
        `<span class="name"></span>` +
        `<span class="best">${best != null ? `✓ Best: ${best} move${best === 1 ? '' : 's'}` : `${level.towers} tower${level.towers > 1 ? 's' : ''}`}</span>`;
      card.querySelector('.name').textContent = level.name;
      card.addEventListener('click', () => startLevel(i));
      list.appendChild(card);
    });
    showScreen('select');
  }

  // ---------- Game ----------
  function startLevel(index) {
    const grid = L.parseLevel(LEVELS[index]);
    state = { index, grid, towers: [], moves: 0, won: false };
    $('level-title').textContent = `${index + 1}. ${grid.name}`;
    $('level-hint').textContent = grid.hint || '';
    board.style.setProperty('--cols', grid.width);
    buildBoard();
    render();
    showScreen('game');
  }

  function buildBoard() {
    const { grid } = state;
    board.innerHTML = '';
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const t = L.tileAt(grid, x, y);
        const cell = document.createElement('button');
        cell.className = 'tile' +
          (t === L.TILE.HOUSE ? ' house' : t === L.TILE.WALL ? ' wall' : t === L.TILE.HILL ? ' hill' : '');
        cell.dataset.x = x;
        cell.dataset.y = y;
        if (L.canPlace(grid, x, y)) {
          cell.classList.add('placeable');
          cell.addEventListener('click', () => toggleTower(x, y));
          cell.addEventListener('mouseenter', () => preview(x, y));
          cell.addEventListener('focus', () => preview(x, y));
          cell.addEventListener('mouseleave', clearPreview);
          cell.addEventListener('blur', clearPreview);
        } else {
          cell.tabIndex = -1;
        }
        board.appendChild(cell);
      }
    }
  }

  function towerIndex(x, y) {
    return state.towers.findIndex(([tx, ty]) => tx === x && ty === y);
  }

  function toggleTower(x, y) {
    if (state.won) return;
    const i = towerIndex(x, y);
    if (i >= 0) {
      state.towers.splice(i, 1);
    } else if (state.towers.length < state.grid.towers) {
      state.towers.push([x, y]);
    } else {
      board.classList.remove('shake');
      void board.offsetWidth; // restart the animation
      board.classList.add('shake');
      return;
    }
    state.moves++;
    render();
    preview(x, y);
    if (L.isSolved(state.grid, state.towers)) win();
  }

  function cellAt(x, y) {
    return board.children[y * state.grid.width + x];
  }

  function render() {
    const { grid, towers } = state;
    const covered = L.coveredCells(grid, towers);
    const noneLeft = towers.length >= grid.towers;
    let lit = 0;
    const houses = L.houses(grid);
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const cell = cellAt(x, y);
        const isCovered = covered.has(x + ',' + y);
        const hasTower = towerIndex(x, y) >= 0;
        cell.classList.toggle('covered', isCovered);
        cell.classList.toggle('tower', hasTower);
        cell.classList.toggle('no-towers', noneLeft);
        if (cell.classList.contains('house')) {
          cell.classList.toggle('lit', isCovered);
          if (isCovered) lit++;
        }
        cell.setAttribute('aria-label', describe(x, y, hasTower, isCovered));
      }
    }
    $('towers-left').textContent = grid.towers - towers.length;
    $('moves').textContent = state.moves;
    $('houses-lit').textContent = `${lit}/${houses.length}`;
  }

  function describe(x, y, hasTower, isCovered) {
    const t = L.tileAt(state.grid, x, y);
    const name = { 'H': 'House', '#': 'Wall', '^': 'Hill', '.': 'Empty' }[t];
    let label = `${name}, row ${y + 1}, column ${x + 1}`;
    if (hasTower) label += ', tower';
    if (t === L.TILE.HOUSE) label += isCovered ? ', has signal' : ', no signal';
    return label;
  }

  function preview(x, y) {
    clearPreview();
    if (state.won) return;
    for (const [cx, cy] of L.towerCoverage(state.grid, x, y)) cellAt(cx, cy).classList.add('preview');
  }

  function clearPreview() {
    board.querySelectorAll('.preview').forEach((el) => el.classList.remove('preview'));
  }

  function win() {
    state.won = true;
    clearPreview();
    const prev = progress[state.index];
    const isBest = prev == null || state.moves < prev;
    if (isBest) { progress[state.index] = state.moves; saveProgress(); }
    const last = state.index === LEVELS.length - 1;
    $('win-title').textContent = last ? 'Every town connected!' : 'All houses connected!';
    $('win-stats').textContent =
      `Solved in ${state.moves} move${state.moves === 1 ? '' : 's'} using ${state.towers.length} tower${state.towers.length === 1 ? '' : 's'}.` +
      (isBest && prev != null ? ' New best!' : !isBest ? ` Best: ${prev}.` : '') +
      (last ? ' You finished all levels.' : '');
    $('win-next').hidden = last;
    $('win-screen').hidden = false;
    (last ? $('win-levels') : $('win-next')).focus();
  }

  // ---------- Wiring ----------
  $('back-btn').addEventListener('click', renderLevelSelect);
  $('reset-btn').addEventListener('click', () => startLevel(state.index));
  $('win-levels').addEventListener('click', renderLevelSelect);
  $('win-replay').addEventListener('click', () => startLevel(state.index));
  $('win-next').addEventListener('click', () => startLevel(state.index + 1));
  document.addEventListener('keydown', (e) => {
    if (screens.game.hidden) return;
    if (e.key === 'r' || e.key === 'R') startLevel(state.index);
    if (e.key === 'Escape') renderLevelSelect();
  });

  renderLevelSelect();
})();
