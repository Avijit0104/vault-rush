/* Vault Rush — synthesized sound effects + heist music (Web Audio, no music files are shipped with the game). */
const SETTINGS = (() => {
  const def = { sfx: true, music: true, vibrate: true, fastAnim: false, musicTrack: 'bella', musicVol: 40, mySong: 'all', shuffle: true };
  const saved = JSON.parse(localStorage.getItem('vr_settings') || '{}');
  let s = { ...def, ...saved };
  if (saved.music === false && !('musicTrack' in saved)) s.musicTrack = 'off'; // old "music off" setting
  if (localStorage.getItem('vr_muted') === '1') { s.sfx = false; s.musicTrack = 'off'; localStorage.removeItem('vr_muted'); }
  const save = () => localStorage.setItem('vr_settings', JSON.stringify(s));
  return {
    get: (k) => s[k],
    set(k, v) { s[k] = v; save(); },
  };
})();

/* Songs the player adds from their own phone. Stored only in this browser (IndexedDB), never uploaded. */
const MySongs = (() => {
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('vr_music', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('songs', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function run(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('songs', mode);
      const req = fn(t.objectStore('songs'));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
    });
  }
  return {
    list: () => run('readonly', (s) => s.getAll()).then((a) => (a || []).map(({ id, name }) => ({ id, name }))).catch(() => []),
    get: (id) => run('readonly', (s) => s.get(id)).catch(() => null),
    add: (file) => run('readwrite', (s) => s.put({ id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), blob: file })),
    remove: (id) => run('readwrite', (s) => s.delete(id)),
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

  /* ---------- music ----------
   * Synth tracks (public-domain melodies, our own arrangement) + "My songs" played from the player's own phone. */
  const Music = (() => {
    let timer = null, level = 0, bus = null, track = null, st = null;
    let audio = null, myList = [], myIdx = 0, myUrl = null;
    const N = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const vol = () => (SETTINGS.get('musicVol') ?? 40) / 100;
    const busGain = () => 0.6 * vol();

    // Classic Vault Rush groove (the original music), A minor, 16th-note steps
    const cBass = [45, 0, 45, 0, 48, 0, 45, 0, 43, 0, 43, 0, 40, 0, 43, 0];
    const cArp = [69, 72, 76, 72, 69, 72, 76, 79, 67, 71, 74, 71, 64, 67, 71, 74];
    function classic(a) {
      const bpm = level >= 2 ? 132 : level === 1 ? 108 : 84;
      const sp = 60 / bpm / 4;
      while (st.next < a.currentTime + 0.2) {
        const s = st.step % 16, at = st.next;
        if (level === 0) {
          if (s % 8 === 0) tone(N(cBass[s] + 12), sp * 7, { type: 'triangle', vol: 0.05, at, dest: bus });
          if (s % 4 === 2) tone(N(cArp[s]), sp * 2, { type: 'sine', vol: 0.025, at, dest: bus });
        } else {
          if (cBass[s]) tone(N(cBass[s]), sp * 1.8, { type: 'sawtooth', vol: level >= 2 ? 0.06 : 0.045, at, dest: bus });
          if (s % 4 === 0) tone(110, 0.18, { type: 'sine', vol: 0.18, slide: -70, at, dest: bus });
          if (s % 2 === 1) noise(0.04, { vol: 0.05, freq: 7000, type: 'highpass', at, dest: bus });
          if (level >= 2 && s % 4 === 2) noise(0.12, { vol: 0.08, freq: 1800, at, dest: bus });
          if (s % 2 === 0) tone(N(cArp[s]), sp * 0.9, { type: 'square', vol: level >= 2 ? 0.022 : 0.015, at, dest: bus });
        }
        st.next += sp;
        st.step++;
      }
    }

    // Melodic tracks: [midi note (0 = rest), beats, chord root midi (optional: changes the bass)]
    const TRACKS = {
      // "Bella Ciao" — traditional Italian folk melody (public domain), heist arrangement in D minor
      bella: {
        bpm: [96, 116, 138], wave: 'triangle', legato: 0.85, lead: 0.06,
        notes: [
          [57, .5, 38], [62, .5], [64, .5], [65, .5], [62, 2],
          [57, .5], [62, .5], [64, .5], [65, .5], [62, 2],
          [57, .5], [62, .5], [64, .5], [65, 1.5],
          [64, .5], [62, .5], [65, 1.5],
          [64, .5], [62, .5], [69, 1], [69, 1], [69, 1],
          [69, .5, 43], [67, .5], [65, 1], [65, 1],
          [67, .5, 48], [65, .5], [64, 1], [64, 1],
          [65, .5, 45], [64, .5], [62, 1], [61, 1],
          [62, 3, 38], [0, 1],
        ],
      },
      // "In the Hall of the Mountain King" — Edvard Grieg, 1875 (public domain), B minor; speeds up every loop
      mountain: {
        bpm: [104, 124, 150], wave: 'square', legato: 0.45, lead: 0.035, accel: true,
        notes: [
          [59, .5, 47], [61, .5], [62, .5], [64, .5], [66, .5], [62, .5], [66, 1],
          [65, .5, 49], [61, .5], [65, 1],
          [64, .5, 48], [60, .5], [64, 1],
          [59, .5, 47], [61, .5], [62, .5], [64, .5], [66, .5], [62, .5], [66, .5], [71, .5],
          [69, .5, 42], [66, .5], [62, .5], [66, .5], [69, 2],
        ],
      },
    };

    function melodic(a, T) {
      const beat = 60 / (T.bpm[Math.min(2, level)] * (st.accel || 1));
      while (st.nextNote < a.currentTime + 0.25) {
        const [m, b, ch] = T.notes[st.idx];
        if (ch) st.chord = ch;
        if (m) {
          tone(N(m), b * beat * T.legato, { type: T.wave, vol: T.lead, at: st.nextNote, dest: bus });
          if (level >= 1) tone(N(m + 12), b * beat * T.legato * 0.6, { type: 'sine', vol: T.lead * 0.35, at: st.nextNote, dest: bus });
        }
        st.nextNote += b * beat;
        if (++st.idx >= T.notes.length) {
          st.idx = 0;
          if (T.accel) st.accel = Math.min(1.45, (st.accel || 1) + 0.07);
        }
      }
      while (st.nextBeat < a.currentTime + 0.25) {
        const at = st.nextBeat, k = st.beat8 % 8;
        if (k % 2 === 0) tone(N(st.chord), beat * 0.85, { type: level === 0 ? 'sine' : 'triangle', vol: 0.07, at, dest: bus });
        if (level >= 1) {
          if (k % 2 === 0) tone(105, 0.16, { type: 'sine', vol: 0.14, slide: -65, at, dest: bus });
          else noise(0.035, { vol: 0.04, freq: 7000, type: 'highpass', at, dest: bus });
        }
        if (level >= 2 && (k === 2 || k === 6)) noise(0.1, { vol: 0.07, freq: 1800, at, dest: bus });
        st.nextBeat += beat / 2;
        st.beat8++;
      }
    }

    function tick() {
      const a = ac(); if (!a || !st) return;
      if (track === 'classic') classic(a);
      else if (TRACKS[track]) melodic(a, TRACKS[track]);
    }

    function startSynth() {
      const a = ac(); if (!a) return;
      if (!bus) { bus = a.createGain(); bus.connect(master); }
      bus.gain.value = busGain();
      if (timer) return;
      const t0 = a.currentTime + 0.05;
      st = st || { step: 0, next: t0, idx: 0, nextNote: t0, nextBeat: t0, beat8: 0, chord: 38, accel: 1 };
      st.next = st.nextNote = st.nextBeat = t0;
      timer = setInterval(tick, 50);
    }

    /* ----- My songs (files the player added on their own phone) ----- */
    async function startMine() {
      const songs = await MySongs.list();
      if (track !== 'mine' || !songs.length) return;
      const sel = SETTINGS.get('mySong');
      let ids = songs.map((s) => s.id);                       // order added
      if (SETTINGS.get('shuffle') !== false) ids = ids.sort(() => Math.random() - 0.5);
      if (sel && sel !== 'all' && ids.includes(sel)) ids = [sel, ...ids.filter((x) => x !== sel)]; // tapped song plays first
      myList = ids;
      myIdx = 0;
      playMineAt();
    }
    async function playMineAt() {
      const rec = await MySongs.get(myList[myIdx % myList.length]);
      if (track !== 'mine' || !rec) return;
      if (!audio) {
        audio = new Audio();
        audio.addEventListener('ended', () => { myIdx++; playMineAt(); });
      }
      if (myUrl) URL.revokeObjectURL(myUrl);
      myUrl = URL.createObjectURL(rec.blob);
      audio.src = myUrl;
      audio.loop = myList.length === 1;
      audio.volume = Math.min(1, 0.6 * vol());
      audio.play().catch(() => {});
    }

    function halt() {
      if (timer) clearInterval(timer);
      timer = null;
      if (audio) audio.pause();
    }

    return {
      play(lv) {
        if (lv === 0 && level !== 0 && st) st.accel = 1; // back on the menu: Mountain King starts slow again
        level = lv;
        const want = SETTINGS.get('musicTrack') || 'bella';
        if (want === 'off') return this.stop();
        if (want !== track) { this.stop(); track = want; st = null; }
        if (track === 'mine') {
          if (audio && audio.src && myList.length) { if (audio.paused) audio.play().catch(() => {}); }
          else startMine();
          return;
        }
        startSynth();
      },
      stop() { halt(); },            // pause (keeps position — used when the app goes to background)
      refresh() { halt(); track = null; st = null; myList = []; if (audio) audio.removeAttribute('src'); this.play(level); },
      setVolume() {
        if (bus) bus.gain.value = busGain();
        if (audio) audio.volume = Math.min(1, 0.6 * vol());
      },
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
