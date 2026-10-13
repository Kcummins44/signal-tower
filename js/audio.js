// Small synthesized sound effects with WebAudio. No audio files.
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let enabled = true;

  // Browsers only allow audio after a user gesture, so create lazily.
  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One enveloped oscillator note, optionally sliding in pitch.
  function tone({ freq, to = freq, type = 'sine', start = 0, dur = 0.15, vol = 0.3, attack = 0.005 }) {
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime + start;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const sfx = {
    click() { tone({ freq: 900, type: 'triangle', dur: 0.05, vol: 0.12 }); },
    place() {
      tone({ freq: 320, to: 760, type: 'triangle', dur: 0.14, vol: 0.28 });
      tone({ freq: 1520, type: 'sine', start: 0.08, dur: 0.18, vol: 0.08 });
    },
    remove() { tone({ freq: 620, to: 240, type: 'triangle', dur: 0.14, vol: 0.22 }); },
    connect(count = 1) {
      for (let i = 0; i < Math.min(count, 4); i++)
        tone({ freq: 1046 * Math.pow(1.122, i), type: 'sine', start: 0.06 + i * 0.05, dur: 0.22, vol: 0.12 });
    },
    invalid() { tone({ freq: 150, to: 110, type: 'square', dur: 0.16, vol: 0.07 }); },
    undo() { tone({ freq: 520, to: 360, type: 'sine', dur: 0.1, vol: 0.18 }); },
    hint() {
      tone({ freq: 660, type: 'sine', dur: 0.15, vol: 0.15 });
      tone({ freq: 990, type: 'sine', start: 0.12, dur: 0.2, vol: 0.15 });
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, type: 'triangle', start: i * 0.1, dur: 0.35, vol: 0.2 }));
      tone({ freq: 1568, type: 'sine', start: 0.42, dur: 0.6, vol: 0.08 });
    },
    star(i) { tone({ freq: 880 * Math.pow(1.26, i), type: 'sine', dur: 0.25, vol: 0.18 }); },
  };

  root.SignalAudio = {
    play(name, ...args) {
      if (!enabled || !sfx[name]) return;
      try { sfx[name](...args); } catch { /* audio is best-effort */ }
    },
    setEnabled(on) {
      enabled = on;
      if (!on && ctx && ctx.state === 'running') ctx.suspend();
    },
    get enabled() { return enabled; },
  };
})(window);
