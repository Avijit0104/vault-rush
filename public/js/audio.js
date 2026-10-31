/* Vault Rush — synthesized sound effects + procedural heist music (Web Audio, no files needed). */
const SETTINGS = (() => {
  const def = { sfx: true, music: true, vibrate: true, fastAnim: false };
  let s = { ...def, ...JSON.parse(localStorage.getItem('vr_settings') || '{}') };
  if (localStorage.getItem('vr_muted') === '1') { s.sfx = false; s.music = false; localStorage.removeItem('vr_muted'); }
  const save = () => localStorage.setItem('vr_settings', JSON.stringify(s));
  return {
    get: (k) => s[k],
    set(k, v) { s[k] = v; save(); },
  };
})();

const SFX = (() => {
  let ctx = null, master = null;

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, { type = 'sine', vol = 0.15, slide = 0, delay = 0, at = null, dest = null } = {}) {
    const a = ac(); if (!a) return;
    const t = at != null ? at : a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, { vol = 0.2, delay = 0, freq = 1200, at = null, dest = null, type = 'lowpass' } = {}) {
    const a = ac(); if (!a) return;
    const t = at != null ? at : a.currentTime + delay;
    const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = type; f.frequency.value = freq; g.gain.value = vol;
    src.connect(f).connect(g).connect(dest || master);
    src.start(t);
  }

  const on = () => SETTINGS.get('sfx');
  const sfx = (fn) => (...args) => { if (on()) fn(...args); };
  const buzz = (ms) => { if (SETTINGS.get('vibrate') && navigator.vibrate) navigator.vibrate(ms); };

  /* ---------- music: lookahead step sequencer ---------- */
  const Music = (() => {
    let timer = null, step = 0, next = 0, level = 0, bus = null;
    const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // A-minor heist groove
    const bass = [45, 0, 45, 0, 48, 0, 45, 0, 43, 0, 43, 0, 40, 0, 43, 0];
    const arp = [69, 72, 76, 72, 69, 72, 76, 79, 67, 71, 74, 71, 64, 67, 71, 74];
    function schedule() {
      const a = ac(); if (!a) return;
      const bpm = level >= 2 ? 132 : level === 1 ? 108 : 84;
      const sp = 60 / bpm / 4;
      while (next < a.currentTime + 0.2) {
        const s = step % 16;
        if (level === 0) {
          if (s % 8 === 0) tone(N(bass[s] + 12), sp * 7, { type: 'triangle', vol: 0.05, at: next, dest: bus });
          if (s % 4 === 2) tone(N(arp[s]), sp * 2, { type: 'sine', vol: 0.025, at: next, dest: bus });
        } else {
          if (bass[s]) tone(N(bass[s]), sp * 1.8, { type: 'sawtooth', vol: level >= 2 ? 0.06 : 0.045, at: next, dest: bus });
          if (s % 4 === 0) tone(110, 0.18, { type: 'sine', vol: 0.18, slide: -70, at: next, dest: bus });
          if (s % 2 === 1) noise(0.04, { vol: 0.05, freq: 7000, type: 'highpass', at: next, dest: bus });
          if (level >= 2 && s % 4 === 2) noise(0.12, { vol: 0.08, freq: 1800, at: next, dest: bus });
          if (s % 2 === 0) tone(N(arp[s]), sp * 0.9, { type: 'square', vol: level >= 2 ? 0.022 : 0.015, at: next, dest: bus });
        }
        next += sp;
        step++;
      }
    }
    return {
      play(lv) {
        level = lv;
        if (!SETTINGS.get('music')) return this.stop();
        const a = ac(); if (!a) return;
        if (!bus) { bus = a.createGain(); bus.gain.value = 0.55; bus.connect(master); }
        if (timer) return;
        next = a.currentTime + 0.05;
        timer = setInterval(schedule, 50);
      },
      stop() { if (timer) clearInterval(timer); timer = null; },
      refresh() { if (SETTINGS.get('music')) this.play(level); else this.stop(); },
    };
  })();

  return {
    unlock: ac,
    Music,
    buzz,
    tap: sfx(() => tone(660, 0.06, { type: 'triangle', vol: 0.12 })),
    select: sfx(() => { tone(520, 0.07, { type: 'square', vol: 0.06 }); tone(780, 0.09, { type: 'square', vol: 0.06, delay: 0.05 }); }),
    tick: sfx((hard) => tone(hard ? 1100 : 900, 0.05, { type: 'square', vol: hard ? 0.09 : 0.04 })),
    drop: sfx(() => { tone(180, 0.25, { type: 'sine', vol: 0.25, slide: -120 }); noise(0.12, { vol: 0.08, freq: 600 }); }),
    coin: sfx((d = 0) => { tone(1320, 0.06, { type: 'square', vol: 0.04, delay: d }); tone(1760, 0.12, { type: 'square', vol: 0.04, delay: d + 0.06 }); }),
    secure: sfx(() => { tone(300, 0.25, { type: 'sawtooth', vol: 0.06, slide: 500 }); tone(990, 0.15, { type: 'triangle', vol: 0.12, delay: 0.25 }); noise(0.05, { vol: 0.15, delay: 0.25, freq: 3000 }); }),
    whoosh: sfx(() => noise(0.3, { vol: 0.12, freq: 2500 })),
    shield: sfx(() => { tone(400, 0.35, { type: 'sine', vol: 0.15, slide: 900 }); tone(1300, 0.25, { type: 'triangle', vol: 0.08, delay: 0.1 }); }),
    hit: (() => { const f = sfx(() => { noise(0.25, { vol: 0.35, freq: 900 }); tone(120, 0.25, { type: 'square', vol: 0.12, slide: -60 }); }); return () => { f(); buzz(80); }; })(),
    lifeLost: (() => { const f = sfx(() => { tone(500, 0.18, { type: 'square', vol: 0.08 }); tone(350, 0.18, { type: 'square', vol: 0.08, delay: 0.16 }); tone(220, 0.35, { type: 'square', vol: 0.08, delay: 0.32 }); }); return () => { f(); buzz([60, 40, 120]); }; })(),
    eliminated: (() => { const f = sfx(() => [440, 370, 311, 220].forEach((fr, i) => tone(fr, 0.3, { type: 'sawtooth', vol: 0.07, delay: i * 0.18 }))); return () => { f(); buzz(300); }; })(),
    alarm: sfx(() => [0, 0.3].forEach((d) => tone(880, 0.22, { type: 'sawtooth', vol: 0.07, slide: -300, delay: d }))),
    siren: sfx(() => { for (let i = 0; i < 3; i++) { tone(600, 0.45, { type: 'sawtooth', vol: 0.06, slide: 500, delay: i * 0.9 }); tone(1100, 0.45, { type: 'sawtooth', vol: 0.06, slide: -500, delay: i * 0.9 + 0.45 }); } }),
    event: sfx(() => [660, 880, 1320].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.1, delay: i * 0.1 }))),
    freeze: sfx(() => { tone(1500, 0.08, { type: 'square', vol: 0.08 }); noise(0.2, { vol: 0.1, freq: 4000 }); }),
    drumroll: sfx(() => {
      for (let i = 0; i < 14; i++) noise(0.05, { vol: 0.06 + i * 0.008, freq: 900, delay: i * 0.05 - i * i * 0.0006 });
      noise(0.5, { vol: 0.12, freq: 5000, type: 'highpass', delay: 0.62 });
      tone(90, 0.3, { type: 'sine', vol: 0.2, slide: -40, delay: 0.62 });
    }),
        pop: sfx(() => tone(900, 0.08, { type: 'sine', vol: 0.1, slide: 400 })),
    win: sfx(() => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.12, delay: i * 0.12 }))),
    lose: sfx(() => [392, 330, 262].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.1, delay: i * 0.2 }))),
    vaultOpen: sfx(() => { noise(0.5, { vol: 0.15, freq: 400 }); tone(90, 0.6, { type: 'sawtooth', vol: 0.08, slide: 40 }); tone(1200, 0.2, { type: 'triangle', vol: 0.08, delay: 0.55 }); }),
  };
})();
