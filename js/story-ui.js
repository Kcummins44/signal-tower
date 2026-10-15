// Story presentation for "The Keeper of Wren Hollow" (Iris's design/story-spec.md):
// the dialogue scene player, the level postcard, the story cards (town card,
// catch-up offer, ending) and the town art. The story text and art come from
// js/story.js (generated from Iris's design files); nothing here is story text.
// game.js decides when things play; this file only shows them.
(function (root) {
  'use strict';
  const { STORY, STORY_ART } = root;
  const SPEAKERS = STORY.speakers;
  const SCENES = Object.fromEntries(STORY.scenes.map((s) => [s.id, s]));
  const CHAPTER_IDS = STORY.town.map((t) => t.chapter);
  let uid = 0;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- Art ----------
  function portraitSvg(name, mood) {
    const id = `sp${++uid}`;
    return `<svg viewBox="0 0 96 96" aria-hidden="true" focusable="false">${STORY_ART.portraits[name][mood || 'neutral'].split('{ID}').join(id)}</svg>`;
  }
  // The town hero with the given chapters lit. `reveal` (a chapter id) plays
  // its brighten-in; `slice` fills the box (backdrops) instead of fitting it.
  // Storm night, for the prologue (Forge's addition for Iris to review): the
  // tower has snapped and lies on the hill, its beacon dark, every window
  // unlit, with low cloud and rain. Drawn over the same scene, in its palette.
  const STORM = '<g class="storm-art" aria-hidden="true">' +
    '<g class="storm-cloud" fill="#26313d"><ellipse cx="70" cy="30" rx="70" ry="16"/><ellipse cx="140" cy="20" rx="60" ry="14"/><ellipse cx="250" cy="28" rx="80" ry="17"/><ellipse cx="200" cy="44" rx="50" ry="9" opacity="0.8"/><ellipse cx="40" cy="50" rx="44" ry="8" opacity="0.7"/></g>' +
    '<g class="storm-tower">' +
    '<ellipse cx="163" cy="170" rx="24" ry="5" fill="rgba(12,18,26,0.3)"/>' +
    '<rect x="140" y="158" width="40" height="11" rx="4.5" fill="#5b6878"/><rect x="140" y="156" width="40" height="8" rx="4" fill="#8d95a1"/>' +
    '<path d="M147 158 L149.6 136 M173 158 L170.4 136" stroke="#9aa7b5" stroke-width="4.5" stroke-linecap="round"/>' +
    '<path d="M149 146 L170 136 M171 146 L150.5 137" stroke="#5b6878" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M149.6 136 L147.4 131 M170.4 136 L173 132" stroke="#9aa7b5" stroke-width="3" stroke-linecap="round"/>' +
    '<g transform="rotate(96 160 142)">' +
    '<path d="M151 140 L156.5 72 M169 140 L163.5 72" stroke="#9aa7b5" stroke-width="4.5" stroke-linecap="round"/>' +
    '<path d="M151.5 124 L167 110 M168.5 124 L153 110 M154 106 L165.5 94 M166 106 L154.5 94" stroke="#5b6878" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M160 72 V62" stroke="#9aa7b5" stroke-width="2.5" stroke-linecap="round"/><circle cx="160" cy="58" r="5" fill="#3a4552"/></g></g>' +
    '<g class="storm-rain" stroke="#9aa7b5" stroke-width="1" stroke-linecap="round" opacity="0.28">' +
    Array.from({ length: 34 }, (_, i) => { const x = (i * 97) % 330 - 5, y = (i * 53) % 200; return `<path d="M${x} ${y} l-5 12"/>`; }).join('') +
    '</g></g>';
  function townSvg({ on = [], reveal = null, revealLater = false, slice = false, storm = false } = {}) {
    const id = `tw${++uid}`;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg class="town-svg" viewBox="0 0 320 220" preserveAspectRatio="xMidYMid ${slice ? 'slice' : 'meet'}" aria-hidden="true" focusable="false">${STORY_ART.town.split('{ID}').join(id)}</svg>`;
    const svg = wrap.firstChild;
    setTown(svg, on, reveal, revealLater);
    if (storm) {
      svg.classList.add('storm');
      const fade = [...svg.querySelectorAll('rect')].find((r) => (r.getAttribute('fill') || '').includes('hero-fade'));
      fade.insertAdjacentHTML('beforebegin', STORM);
    }
    return svg;
  }
  function setTown(svg, on, reveal = null, revealLater = false) {
    const lit = new Set(on);
    svg.querySelectorAll('.tl').forEach((g) => {
      const ch = g.dataset.chapter;
      g.classList.toggle('on', lit.has(ch));
      g.classList.toggle('reveal', ch === reveal);
      g.classList.toggle('later', ch === reveal && revealLater);
    });
  }
  const TOWER_GLYPH = '<svg class="st-glyph" viewBox="0 0 28 28" aria-hidden="true"><path d="M9 26 L14 8 L19 26" fill="none" stroke="#e8ebef" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="6" r="3" fill="#7fe0d0"/></svg>';
  const HOUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="1" fill="#e6dccb"/><path d="M3 11 L12 4 L21 11 Z" fill="#c47a5a"/><rect x="7.5" y="12.5" width="3" height="3" rx="0.6" fill="#ffd27a"/><rect x="13.5" y="12.5" width="3" height="3" rx="0.6" fill="#ffd27a"/></svg>';

  function create(ctx) {
    // ---------- Scene player DOM ----------
    const el = document.createElement('div');
    el.id = 'story';
    el.className = 'story';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML =
      '<div class="st-backdrop"></div><div class="st-dim"></div><div class="st-rings" aria-hidden="true"></div>' +
      '<div class="st-top" aria-hidden="true"><span class="st-context"></span></div>' +
      '<div class="st-controls">' +
      '<button type="button" class="st-ff" aria-label="Fast forward" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l7 6-7 6zM13 6l7 6-7 6z"/></svg></button>' +
      '<button type="button" class="st-skip" aria-label="Skip scene">Skip<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l9 6-9 6z"/><rect x="16" y="6" width="2.6" height="12" rx="1"/></svg></button>' +
      '</div>' +
      `<button type="button" class="st-card">${TOWER_GLYPH}<span class="st-portrait" aria-hidden="true"></span>` +
      '<span class="st-head" aria-hidden="true"><span class="st-name"></span><span class="st-role"></span></span>' +
      '<span class="st-text" aria-hidden="true"></span>' +
      '<span class="st-foot" aria-hidden="true"><span class="st-dots"></span><svg class="st-next" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span></button>' +
      '<div class="st-live sr-only" aria-live="polite"></div>';
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    const backdrop = q('.st-backdrop'), rings = q('.st-rings'), card = q('.st-card'), ffBtn = q('.st-ff'), skipBtn = q('.st-skip');
    const portrait = q('.st-portrait'), head = q('.st-head'), nameEl = q('.st-name'), roleEl = q('.st-role');
    const textEl = q('.st-text'), dotsEl = q('.st-dots'), live = q('.st-live');

    let run = null;
    const instant = () => ctx.reducedMotion() || ctx.speed() === 'instant';
    const fast = () => run && (run.ff || run.holdFF);

    // Plays scenes back to back as one sequence (one scene in normal play;
    // the catch-up "story so far" plays several). Skip ends the sequence.
    // opts: { replay, town (chapters lit on a town backdrop), backdrop, onDone }
    function play(ids, opts = {}) {
      const scenes = ids.map((id) => SCENES[id]).filter(Boolean);
      if (!scenes.length) { if (opts.onDone) opts.onDone(); return; }
      if (run) finish(true);
      run = { openedAt: performance.now(), scenes, si: 0, li: -1, opts, ff: false, holdFF: false, typed: false, chars: 0, timer: 0, auto: 0, hold: 0, last: null, returnFocus: document.activeElement };
      el.hidden = false;
      el.classList.remove('out');
      ffBtn.setAttribute('aria-pressed', 'false');
      // Restart the entrance animations.
      for (const n of [q('.st-dim'), card]) { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; }
      ctx.onOpen();
      startScene();
      card.focus({ preventScroll: true });
    }

    function startScene() {
      const scene = run.scenes[run.si];
      el.setAttribute('aria-label', `Story: ${scene.title}`);
      const kind = run.opts.backdrop || scene.backdrop;
      // Over the board or the map, a band holds the controls (so they never
      // sit on the dimmed header) and says where you are.
      q('.st-top').hidden = kind === 'town';
      q('.st-context').textContent = run.opts.context || '';
      backdrop.innerHTML = '';
      backdrop.classList.remove('settle');
      backdrop.hidden = kind !== 'town';
      if (kind === 'town') {
        const epilogue = scene.trigger.type === 'epilogue';
        const prologue = scene.trigger.type === 'prologue' && !run.opts.town;
        const on = run.opts.town || (epilogue ? CHAPTER_IDS : prologue ? [] : ctx.townState());
        backdrop.appendChild(townSvg({ on, storm: prologue }));
        if (epilogue && !run.opts.town) backdrop.classList.add('settle');
      }
      run.li = -1;
      run.last = null;
      next(true);
    }

    function showLine() {
      const scene = run.scenes[run.si], line = scene.lines[run.li];
      const sp = SPEAKERS[line.speaker];
      const narrator = !sp.portrait;
      card.classList.toggle('narrator', narrator);
      card.classList.remove('typed');
      card.style.setProperty('--sc', sp.color);
      el.style.setProperty('--sc', sp.color);
      const key = `${line.speaker}/${line.mood || 'neutral'}`;
      if (!narrator && run.last !== key) {
        portrait.innerHTML = portraitSvg(sp.portrait, line.mood);
        if (run.last) { portrait.classList.remove('swap'); void portrait.offsetWidth; portrait.classList.add('swap'); }
        if (run.last && run.last.split('/')[0] !== line.speaker) { head.classList.remove('swap'); void head.offsetWidth; head.classList.add('swap'); }
      }
      run.last = key;
      nameEl.textContent = sp.name;
      roleEl.textContent = sp.role;
      const n = scene.lines.length;
      dotsEl.innerHTML = scene.lines.map((_, i) => `<i class="${i === run.li ? 'cur' : ''}"></i>`).join('');
      card.setAttribute('aria-label', `Next line, ${run.li + 1} of ${n}`);
      // Screen readers get the whole line at once; the typed text is hidden from them.
      live.textContent = '';
      live.textContent = `${sp.name ? `${sp.name}: ` : ''}${line.text}`;
      drawRings(line, sp);
      run.typed = false;
      run.chars = 0;
      clearTimeout(run.timer); clearTimeout(run.auto);
      if (instant()) finishTyping();
      else typeStep();
    }

    function render() {
      const text = run.scenes[run.si].lines[run.li].text;
      // The untyped rest is laid out but invisible, so lines never re-wrap as
      // they type. Narrator lines are centred, so they show only what's typed.
      if (card.classList.contains('narrator')) { textEl.innerHTML = `<span>${esc(text.slice(0, run.chars))}</span>`; return; }
      textEl.innerHTML = `<span>${esc(text.slice(0, run.chars))}</span><span style="visibility:hidden">${esc(text.slice(run.chars))}</span>`;
    }
    function typeStep() {
      const text = run.scenes[run.si].lines[run.li].text;
      run.chars++;
      render();
      if (run.chars >= text.length) { finishTyping(); return; }
      const ch = text[run.chars - 1];
      let ms = 25 + (ch === ',' ? 60 : '.!?'.includes(ch) ? 140 : 0);
      ms /= fast() ? 4 : ctx.speed() === 'fast' ? 2 : 1;
      run.timer = setTimeout(typeStep, ms);
    }
    function finishTyping() {
      clearTimeout(run.timer);
      run.chars = run.scenes[run.si].lines[run.li].text.length;
      render();
      run.typed = true;
      card.classList.add('typed');
      scheduleAuto();
    }
    function scheduleAuto() {
      clearTimeout(run.auto);
      if (run.typed && fast()) run.auto = setTimeout(() => { if (run && run.typed) next(); }, 500);
    }

    // Tap, Enter or Space: finish the typing, else the next line, else close.
    function next(first) {
      if (!run) return;
      if (!first && !run.typed) { finishTyping(); return; }
      const scene = run.scenes[run.si];
      if (run.li + 1 < scene.lines.length) {
        run.li++;
        if (!first) ctx.sound('line');
        showLine();
        return;
      }
      if (!run.opts.replay) ctx.markSeen(scene.id);
      if (run.si + 1 < run.scenes.length) { run.si++; ctx.sound('line'); startScene(); return; }
      finish(false);
    }
    function skip() {
      if (!run) return;
      if (!run.opts.replay) for (let i = run.si; i < run.scenes.length; i++) ctx.markSeen(run.scenes[i].id);
      finish(false);
    }
    function setFF(on) {
      run.ff = on;
      ffBtn.setAttribute('aria-pressed', String(on));
      if (on && !run.typed && instant()) finishTyping();
      scheduleAuto();
    }
    function finish(now) {
      const r = run;
      run = null;
      clearTimeout(r.timer); clearTimeout(r.auto); clearTimeout(r.hold);
      const done = () => {
        if (run) return; // a new scene took over
        el.hidden = true;
        backdrop.innerHTML = '';
        rings.innerHTML = '';
        card.classList.remove('top');
        if (r.returnFocus && r.returnFocus.focus && document.contains(r.returnFocus)) r.returnFocus.focus({ preventScroll: true });
      };
      if (now) { done(); return; }
      el.classList.add('out');
      setTimeout(() => { done(); ctx.onClose(); if (r.opts.onDone) r.opts.onDone(); }, ctx.reducedMotion() ? 150 : 200);
    }

    // Focus rings on the board tiles (or tray chip) a line talks about. The
    // card moves to the top if a ring would sit under it.
    function drawRings(line) {
      rings.innerHTML = '';
      card.classList.remove('top');
      const kind = run.opts.backdrop || run.scenes[run.si].backdrop;
      if (!line.focus || kind !== 'board') return;
      const rects = ctx.focusRects(line.focus);
      for (const r of rects) {
        if (r.chip) {
          rings.insertAdjacentHTML('beforeend', `<span class="st-ring chip" style="left:${r.x - 4}px;top:${r.y - 4}px;width:${r.w + 8}px;height:${r.h + 8}px"></span>`);
          continue;
        }
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        for (const [f, cls] of [[0.92, 'outer'], [0.72, '']]) {
          const d = r.w * f;
          rings.insertAdjacentHTML('beforeend', `<span class="st-ring ${cls}" style="left:${cx - d / 2}px;top:${cy - d / 2}px;width:${d}px;height:${d}px"></span>`);
        }
      }
      const c = card.getBoundingClientRect();
      const pad = 8;
      if (rects.some((r) => r.x < c.right + pad && r.x + r.w > c.left - pad && r.y < c.bottom + pad && r.y + r.h > c.top - pad - 40)) card.classList.add('top');
    }

    // ---------- Input ----------
    const onControls = (t) => t && t.closest && t.closest('.st-controls');
    el.addEventListener('pointerdown', (e) => {
      if (!run || onControls(e.target)) return;
      e.preventDefault();
      run.press = e.pointerId;
      clearTimeout(run.hold);
      run.hold = setTimeout(() => { if (run && run.press !== undefined) { run.holdFF = true; if (instant() && !run.typed) finishTyping(); scheduleAuto(); } }, 400);
    });
    const release = (e, cancel) => {
      if (!run || run.press !== e.pointerId) return;
      run.press = undefined;
      clearTimeout(run.hold);
      if (run.holdFF) { run.holdFF = false; scheduleAuto(); return; }
      // The second tap of a double tap that opened the scene doesn't count.
      if (!cancel && performance.now() - run.openedAt >= 300) next();
    };
    el.addEventListener('pointerup', (e) => release(e, false));
    el.addEventListener('pointercancel', (e) => release(e, true));
    card.addEventListener('click', (e) => { if (e.detail === 0 && run) next(); }); // screen reader activation
    ffBtn.addEventListener('click', () => { if (run) setFF(!run.ff); });
    skipBtn.addEventListener('click', skip);

    // Rotation or resize: the rings follow the board.
    window.addEventListener('resize', () => requestAnimationFrame(() => { if (run && run.li >= 0) drawRings(run.scenes[run.si].lines[run.li]); }));

    let spaceHold = 0, spaceFF = false;
    window.addEventListener('keydown', (e) => {
      if (!run && !cardOpen) return;
      e.stopImmediatePropagation();
      if (cardOpen) { cardKey(e); return; }
      const k = e.key, onBtn = document.activeElement === ffBtn || document.activeElement === skipBtn;
      if (k === 'Tab') {
        e.preventDefault();
        const order = [card, ffBtn, skipBtn];
        const i = order.indexOf(document.activeElement);
        order[(i + (e.shiftKey ? order.length - 1 : 1) + order.length) % order.length].focus();
        return;
      }
      if (k === 'Escape') { e.preventDefault(); skip(); return; }
      if (k === 'f' || k === 'F') { e.preventDefault(); setFF(!run.ff); return; }
      if (k === 'Enter') { if (onBtn) return; e.preventDefault(); if (!e.repeat) next(); return; }
      if (k === ' ') {
        if (onBtn) return;
        e.preventDefault();
        if (e.repeat) return;
        spaceFF = false;
        clearTimeout(spaceHold);
        spaceHold = setTimeout(() => { if (run) { spaceFF = true; run.holdFF = true; if (instant() && !run.typed) finishTyping(); scheduleAuto(); } }, 400);
        return;
      }
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(k)) e.preventDefault();
    }, true);
    window.addEventListener('keyup', (e) => {
      if (!run && !cardOpen) return;
      e.stopImmediatePropagation();
      if (cardOpen || e.key !== ' ') return;
      const onBtn = document.activeElement === ffBtn || document.activeElement === skipBtn;
      if (onBtn) return;
      e.preventDefault();
      clearTimeout(spaceHold);
      if (spaceFF) { spaceFF = false; if (run) { run.holdFF = false; scheduleAuto(); } return; }
      next();
    }, true);

    // ---------- Story cards: town card, catch-up offer, ending ----------
    let cardOpen = null;
    // opts: { label, eyebrow, town: {on, reveal}, title, body, tap: minMs, buttons: [{label, primary, run}], escape: index, onDone }
    function storyCard(opts) {
      if (cardOpen) closeCard(true);
      const wrap = document.createElement('div');
      wrap.className = 'story-card-wrap';
      wrap.innerHTML = `<div class="story-card" role="dialog" aria-modal="true" tabindex="-1"></div>`;
      const box = wrap.firstChild;
      box.setAttribute('aria-label', opts.label || opts.title);
      if (opts.eyebrow) box.insertAdjacentHTML('beforeend', `<p class="sc-eyebrow">${esc(opts.eyebrow)}</p>`);
      if (opts.town) {
        const hero = document.createElement('div');
        hero.className = 'sc-hero';
        hero.appendChild(townSvg({ on: opts.town.on, reveal: opts.town.reveal, revealLater: true }));
        box.appendChild(hero);
      }
      const text = document.createElement('div');
      text.className = 'sc-text';
      text.innerHTML = `<p class="sc-title">${esc(opts.title)}</p>${opts.body ? `<p class="sc-body">${esc(opts.body)}</p>` : ''}`;
      box.appendChild(text);
      const tap = opts.tap !== undefined;
      if (tap) { text.insertAdjacentHTML('beforeend', '<p class="sc-tap" aria-hidden="true">Tap to continue</p>'); box.classList.add('tap'); }
      if (opts.buttons) {
        const row = document.createElement('div');
        row.className = `sc-buttons${opts.buttons.length > 1 && opts.row ? ' row' : ''}`;
        opts.buttons.forEach((b, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `btn${b.primary ? ' primary' : ''}`;
          btn.textContent = b.label;
          btn.dataset.i = i;
          btn.addEventListener('click', () => { Audio(); closeCard(false, () => b.run && b.run()); });
          row.appendChild(btn);
        });
        text.appendChild(row);
      }
      document.body.appendChild(wrap);
      const st = { wrap, box, opts, ready: !tap, returnFocus: document.activeElement };
      cardOpen = st;
      ctx.onOpen();
      if (tap) setTimeout(() => { if (cardOpen === st) { st.ready = true; box.classList.add('ready'); } }, opts.tap);
      wrap.addEventListener('pointerup', (e) => {
        if (cardOpen !== st || !tap || !st.ready || (e.target.closest && e.target.closest('button'))) return;
        closeCard(false, opts.onDone);
      });
      setTimeout(() => { if (cardOpen !== st) return; const b = box.querySelector('.btn.primary') || box; b.focus({ preventScroll: true }); }, 30);
      return st;
    }
    function Audio() { ctx.sound('click'); }
    function closeCard(now, then) {
      const st = cardOpen;
      if (!st) return;
      cardOpen = null;
      const done = () => {
        st.wrap.remove();
        if (st.returnFocus && st.returnFocus.focus && document.contains(st.returnFocus)) st.returnFocus.focus({ preventScroll: true });
      };
      if (now) { done(); return; }
      st.wrap.classList.add('out');
      setTimeout(() => { done(); ctx.onClose(); if (then) then(); }, ctx.reducedMotion() ? 150 : 200);
    }
    function cardKey(e) {
      const st = cardOpen, k = e.key;
      const btns = [...st.box.querySelectorAll('button')];
      if (k === 'Tab') {
        e.preventDefault();
        if (!btns.length) return;
        const i = btns.indexOf(document.activeElement);
        btns[(i + (e.shiftKey ? btns.length - 1 : 1) + btns.length) % btns.length].focus();
        return;
      }
      if (st.opts.tap !== undefined && (k === 'Enter' || k === ' ' || k === 'Escape')) {
        e.preventDefault();
        if (st.ready && !e.repeat) closeCard(false, st.opts.onDone);
        return;
      }
      if (k === 'Escape' && st.opts.escape !== undefined) { e.preventDefault(); btns[st.opts.escape].click(); return; }
      if ((k === 'Enter' || k === ' ') && btns.includes(document.activeElement)) return; // the button's own click
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(k)) e.preventDefault();
    }

    // ---------- Level postcard ----------
    let postcardEl = null;
    function postcard({ container, level, name, text, ms, onGone }) {
      dismissPostcard(true);
      const pc = document.createElement('div');
      pc.className = 'postcard';
      pc.setAttribute('role', 'status');
      pc.innerHTML = `<span class="pc-house" aria-hidden="true">${HOUSE_ICON}</span><span><span class="pc-k">Level ${level}, ${esc(name)}</span><span class="pc-t">${esc(text)}</span></span>`;
      container.appendChild(pc);
      const st = { pc, onGone, timer: setTimeout(() => dismissPostcard(false), ms) };
      postcardEl = st;
      // Taps pass straight through to the map (game.js dismisses it on any tap),
      // so it never blocks a circle.
      return st;
    }
    function dismissPostcard(now) {
      const st = postcardEl;
      if (!st) return;
      postcardEl = null;
      clearTimeout(st.timer);
      const gone = () => { st.pc.remove(); if (st.onGone) st.onGone(); };
      if (now) { st.pc.remove(); return; }
      st.pc.classList.add('out');
      setTimeout(gone, 200);
    }

    // ---------- Story log ----------
    // groups: [{ title, rows: [{ id, title, where, seen, lock }] }]
    function renderLog(list, groups, { onPlay, onRead }) {
      list.innerHTML = '';
      for (const g of groups) {
        const h = document.createElement('h3');
        h.textContent = g.title;
        list.appendChild(h);
        for (const r of g.rows) {
          const row = document.createElement('div');
          row.className = `story-row${r.seen ? '' : ' locked'}`;
          row.dataset.scene = r.id;
          row.innerHTML = `<span class="sr-t"><span class="sr-title">${esc(r.title)}</span><span class="sr-where">${esc(r.where)}</span></span>`;
          if (r.seen) {
            row.insertAdjacentHTML('beforeend',
              `<button type="button" class="icon-btn sr-play" aria-label="Play ${esc(r.title)}"><svg><use href="#i-play"/></svg></button>` +
              `<button type="button" class="icon-btn sr-read" aria-label="Read ${esc(r.title)}"><svg><use href="#i-book"/></svg></button>`);
            row.querySelector('.sr-play').addEventListener('click', () => onPlay(r.id));
            row.querySelector('.sr-read').addEventListener('click', () => onRead(r.id));
          } else {
            row.insertAdjacentHTML('beforeend', `<span class="sr-lock"><svg aria-hidden="true"><use href="#i-lock"/></svg>${esc(r.lock)}</span>`);
          }
          list.appendChild(row);
        }
      }
    }
    function transcript(box, id) {
      const s = SCENES[id];
      box.innerHTML = `<h3>${esc(s.title)}</h3>` + s.lines.map((l) => {
        const sp = SPEAKERS[l.speaker];
        return `<p>${sp.name ? `<b style="--sc:${sp.color}">${esc(sp.name)}:</b> ` : ''}${esc(l.text)}</p>`;
      }).join('');
    }

    return {
      play, skip, next, postcard, dismissPostcard, storyCard, closeCard, renderLog, transcript, townSvg, setTown,
      get active() { return !!run || !!cardOpen; },
      get state() {
        return {
          scene: run ? run.scenes[run.si].id : null, line: run ? run.li : -1, typed: run ? run.typed : false,
          ff: run ? run.ff : false, chars: run ? run.chars : 0, top: card.classList.contains('top'),
          card: cardOpen ? cardOpen.box.getAttribute('aria-label') : null, postcard: !!postcardEl,
          live: live.textContent,
        };
      },
    };
  }

  root.SignalStory = { create, SCENES, SPEAKERS, CHAPTER_IDS, portraitSvg, townSvg };
})(window);
