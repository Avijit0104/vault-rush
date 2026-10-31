/* Vault Rush — client app: screens, rendering, input and resolution animations.
 * The client never calculates money/lives; it only renders authoritative state. */
(() => {
  'use strict';
  const C = VR_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const AVATARS = ART.HUMAN_IDS;

  let savedAv = localStorage.getItem('vr_avatar');
  if (!AVATARS.includes(savedAv)) savedAv = AVATARS[Math.floor(Math.random() * AVATARS.length)];

  const S = {
    conn: null,
    me: null,
    view: null,
    screen: 'home',
    name: localStorage.getItem('vr_name') || '',
    avatar: savedAv,
    soloRounds: +localStorage.getItem('vr_rounds') || C.AVAILABLE_ROUNDS[0],
    soloBots: +localStorage.getItem('vr_bots') || 3,
    soloTimer: +localStorage.getItem('vr_timer') || C.ACTION_TIME_SECONDS,
    localAction: undefined,
    lastRound: 0,
    lastTime: null,
    podsKey: '',
    animating: false,
    animatedRound: 0,
    queued: null,
    display: null,
    resultsShown: false,
    wakeLock: null,
    log: [],
    recap: null,
    tutorialPending: false,
    suppressClick: false,
    qrCode: null,
    musicLevel: 0,
    profile: loadProfile(),
  };
  let refreshPreview = () => {};

  /* ---------- utils ---------- */
  const fmt = (n) => C.CURRENCY + Math.round(n).toLocaleString('en-IN');
  function short(n) {
    n = Math.round(n);
    if (n >= 100000) return C.CURRENCY + (n / 100000).toFixed(n >= 1000000 ? 0 : 1).replace(/\.0$/, '') + 'L';
    if (n >= 1000) return C.CURRENCY + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return C.CURRENCY + n;
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hearts = (lives) => Array.from({ length: C.STARTING_LIVES }, (_, i) => `<span class="h ${i < lives ? '' : 'gone'}">❤️</span>`).join('');
  const colorOf = (p) => ART.colorOf(p ? p.seat : 0);
  const avatarOf = (p) => ART.avatar(p.avatar, colorOf(p), p.look && p.look.acc);
  const sp = () => FX.speed();

  let toastT;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), ms);
  }
  function loading(on, text) {
    $('#loading').classList.toggle('show', !!on);
    if (text) $('#loading-text').textContent = text;
  }
  function confirmBox(text, yes) {
    $('#modal-text').textContent = text;
    $('#modal').classList.add('show');
    $('#modal-yes').onclick = () => { $('#modal').classList.remove('show'); yes(); };
    $('#modal-no').onclick = () => $('#modal').classList.remove('show');
  }

  function show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + id));
    S.screen = id;
    document.body.classList.toggle('in-game', id === 'game');
    if (id !== 'game') { FX.clearBeams(); $('#emote-picker').classList.remove('on'); }
    setMusic(id === 'game' ? (S.view && S.view.endgame ? 2 : 1) : 0);
  }

  function setMusic(level) {
    S.musicLevel = level;
    if (S.audioUnlocked) SFX.Music.play(level);
  }

  /* ---------- splash + background ---------- */
  function splash() {
    if (sessionStorage.getItem('vr_splash')) return;
    sessionStorage.setItem('vr_splash', '1');
    const el = $('#splash');
    el.classList.add('show');
    const end = () => { el.classList.add('open'); setTimeout(() => el.classList.remove('show'), 1000); };
    const t1 = setTimeout(() => el.classList.add('spin'), 250);
    const t2 = setTimeout(end, 1250);
    el.onclick = () => { clearTimeout(t1); clearTimeout(t2); end(); };
  }

  function cashRain() {
    const box = $('#cash-rain');
    let html = '';
    for (let i = 0; i < 14; i++) {
      const bill = i % 3 === 0;
      const style = `left:${Math.random() * 100}%;animation-duration:${8 + Math.random() * 9}s;animation-delay:${-Math.random() * 15}s`;
      html += bill ? `<i class="bill" style="${style}"></i>` : `<i style="${style}">${ART.coin()}</i>`;
    }
    box.innerHTML = html;
  }

  /* ---------- sheets (settings, log, player info) ---------- */
  function openSheet(name) {
    if (name === 'settings') {
      $$('[data-setting]').forEach((i) => (i.checked = !!SETTINGS.get(i.dataset.setting)));
      $('#btn-game-leave').style.display = S.conn && S.screen !== 'home' ? '' : 'none';
    }
    if (name === 'log') renderLog();
    $('#sheet-' + name).classList.add('show');
    SFX.tap();
  }
  function closeSheets() { $$('.sheet-wrap').forEach((s) => s.classList.remove('show')); }

  function initSheets() {
    document.addEventListener('click', (e) => {
      const o = e.target.closest('[data-open]');
      if (o) openSheet(o.dataset.open);
      if (e.target.closest('[data-close]') || e.target.classList.contains('sheet-wrap')) closeSheets();
    });
    $$('[data-setting]').forEach((i) => (i.onchange = () => {
      SETTINGS.set(i.dataset.setting, i.checked);
      if (i.dataset.setting === 'music') SFX.Music.refresh();
      SFX.tap();
    }));
    $('#btn-reset-tut').onclick = () => { localStorage.removeItem('vr_tut'); toast('Tutorial will show in your next solo game'); };
    $('#btn-game-leave').onclick = () => { closeSheets(); confirmBox('Leave this heist?', () => leave()); };
  }

  /* ---------- home ---------- */
  function initHome() {
    const row = $('#avatar-row');
    row.innerHTML = AVATARS.map((a) => `<button class="avatar-opt ${a === S.avatar ? 'sel' : ''}" data-av="${a}">${ART.avatar(a, '#3ef3ff')}</button>`).join('');
    const preview = (refreshPreview = () => {
      $('#me-preview').innerHTML = ART.avatar(S.avatar, '#ffc94a', S.profile.acc);
      $('#char-name').textContent = '· ' + ART.CHARS[+S.avatar.slice(1)][4];
    });
    preview();
    row.onclick = (e) => {
      const b = e.target.closest('[data-av]'); if (!b) return;
      S.avatar = b.dataset.av; localStorage.setItem('vr_avatar', S.avatar);
      $$('.avatar-opt').forEach((x) => x.classList.toggle('sel', x === b));
      preview();
      SFX.tap();
    };
    const name = $('#name-input');
    name.value = S.name;
    name.oninput = () => { S.name = name.value.trim(); localStorage.setItem('vr_name', S.name); };

    $$('[data-go]').forEach((b) => (b.onclick = () => { SFX.tap(); show(b.dataset.go); }));

    chips($('#solo-rounds'), C.AVAILABLE_ROUNDS.map((r) => ({ v: r, label: r, sub: 'ROUNDS' })), S.soloRounds, (v) => { S.soloRounds = v; localStorage.setItem('vr_rounds', v); });
    chips($('#solo-bots'), [3, 4, 5].map((b) => ({ v: b, label: b, sub: `${b + 1} PLAYERS` })), S.soloBots, (v) => { S.soloBots = v; localStorage.setItem('vr_bots', v); });
    chips($('#solo-timer'), C.ACTION_TIME_OPTIONS.map((t) => ({ v: t, label: t, sub: 'SECONDS' })), S.soloTimer, (v) => { S.soloTimer = v; localStorage.setItem('vr_timer', v); });

    $('#btn-solo-start').onclick = startSolo;
    $('#btn-create').onclick = () => needName() && goOnline(() => S.conn.send('create', identity()));
    $('#btn-join').onclick = () => {
      const code = $('#code-input').value.trim().toUpperCase();
      if (code.length !== 4) return toast('Enter the 4-letter room code');
      if (!needName()) return;
      goOnline(() => S.conn.send('join', { code, ...identity() }));
    };
    $('#code-input').oninput = (e) => (e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''));
    document.addEventListener('pointerdown', () => {
      if (S.audioUnlocked) return;
      S.audioUnlocked = true;
      SFX.unlock();
      SFX.Music.play(S.musicLevel);
    });
  }

  function chips(el, items, current, onPick) {
    el.innerHTML = items.map((i) => `<button class="chip ${i.v === current ? 'sel' : ''}" data-v="${i.v}">${i.label}<small>${i.sub || ''}</small></button>`).join('');
    el.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b || el.classList.contains('locked')) return;
      $$('.chip', el).forEach((x) => x.classList.toggle('sel', x === b));
      SFX.tap();
      onPick(+b.dataset.v);
    };
  }

  function needName() {
    if (S.name) return true;
    S.name = 'Player' + Math.floor(100 + Math.random() * 900);
    $('#name-input').value = S.name;
    localStorage.setItem('vr_name', S.name);
    return true;
  }
  const identity = () => ({ name: S.name, avatar: S.avatar, look: { acc: S.profile.acc, crate: S.profile.crate } });

  /* ---------- profile + locker (unlockable looks, stored on this phone) ---------- */
  function loadProfile() {
    const p = JSON.parse(localStorage.getItem('vr_profile') || '{}');
    return { games: p.games || 0, wins: p.wins || 0, acc: p.acc || 'none', crate: p.crate || 'wood' };
  }
  const saveProfile = () => localStorage.setItem('vr_profile', JSON.stringify(S.profile));
  const allLooks = () => [...C.COSMETICS.acc, ...C.COSMETICS.crate];
  const isUnlocked = (it, pr = S.profile) => !it.need || ((it.need.games == null || pr.games >= it.need.games) && (it.need.wins == null || pr.wins >= it.need.wins));
  const needText = (n) => (n.wins ? `Win ${n.wins} heist${n.wins > 1 ? 's' : ''}` : `Play ${n.games} heists`);

  function renderLocker() {
    const pr = S.profile;
    $('#lk-av').innerHTML = ART.avatar(S.avatar, '#ffc94a', pr.acc);
    $('#lk-crate').innerHTML = ART.lootCrate(3, pr.crate);
    $('#lk-stats').innerHTML = `<div><b>${pr.games}</b>played</div><div><b>${pr.wins}</b>won</div>
      <div><b>${allLooks().filter((it) => isUnlocked(it)).length}/${allLooks().length}</b>unlocked</div>`;
    const tile = (kind, it) => {
      const un = isUnlocked(it), sel = pr[kind] === it.id;
      const art = kind === 'acc' ? ART.avatar(S.avatar, '#3ef3ff', it.id) : ART.lootCrate(3, it.id);
      return `<button class="lk-item ${un ? '' : 'locked'} ${sel ? 'sel' : ''}" data-kind="${kind}" data-id="${it.id}">
        <div class="lk-art">${art}</div><b>${it.name}</b><small>${un ? (sel ? 'EQUIPPED' : 'TAP TO WEAR') : '🔒 ' + needText(it.need)}</small></button>`;
    };
    $('#lk-acc').innerHTML = C.COSMETICS.acc.map((it) => tile('acc', it)).join('');
    $('#lk-crates').innerHTML = C.COSMETICS.crate.map((it) => tile('crate', it)).join('');
  }
  function initLocker() {
    $('#btn-locker').onclick = () => { SFX.tap(); renderLocker(); show('locker'); };
    $('#screen-locker').addEventListener('click', (e) => {
      const b = e.target.closest('.lk-item'); if (!b) return;
      const it = C.COSMETICS[b.dataset.kind].find((x) => x.id === b.dataset.id);
      if (!isUnlocked(it)) { SFX.tap(); toast(`🔒 ${needText(it.need)} to unlock the ${it.name}`); return; }
      S.profile[b.dataset.kind] = it.id;
      saveProfile();
      SFX.select();
      renderLocker();
      refreshPreview();
    });
  }
  function recordGame(won) {
    const before = { ...S.profile };
    S.profile.games++;
    if (won) S.profile.wins++;
    saveProfile();
    const fresh = allLooks().filter((it) => it.need && isUnlocked(it) && !isUnlocked(it, before));
    if (fresh.length) setTimeout(() => toast(`🎁 NEW UNLOCK: ${fresh.map((f) => f.name).join(', ')}! Wear it from the Locker`, 4500), 2000);
  }

  /* ---------- connections ---------- */
  function wire(conn) {
    conn.on('joined', (d) => {
      S.me = d.playerId;
      if (d.token) localStorage.setItem('vr_session', JSON.stringify({ code: d.code, token: d.token, t: Date.now() }));
      if (d.spectator) toast('👀 Heist in progress: you are spectating until the next game');
      loading(false);
    });
    conn.on('state', onState);
    conn.on('emote', showEmote);
    conn.on('errorMsg', (m) => { loading(false); toast(m); });
    conn.on('kicked', () => { toast('You were removed from the room'); leave(true); });
  }

  function startSolo() {
    needName();
    closeConn();
    S.conn = new LocalConn();
    wire(S.conn);
    S.tutorialPending = !localStorage.getItem('vr_tut');
    S.conn.send('create', identity());
    S.conn.send('settings', { rounds: S.soloRounds, actionTime: S.soloTimer });
    for (let i = 0; i < S.soloBots; i++) S.conn.send('addBot');
    S.conn.send('start');
    SFX.tap();
  }

  function goOnline(after) {
    if (!window.io) return toast('Online play needs the game server. Try "Play vs Bots"!', 3500);
    closeConn();
    loading(true, 'Connecting to the server…');
    const slow = setTimeout(() => loading(true, 'Waking up the free server… this can take up to a minute the first time. Hang tight!'), 4000);
    S.conn = new OnlineConn();
    wire(S.conn);
    let first = true;
    S.conn.on('connect', () => {
      clearTimeout(slow);
      if (first) { first = false; after(); }
      else tryRejoin();
    });
    S.conn.on('disconnect', () => { if (S.view) toast('Connection lost: reconnecting…'); });
    S.conn.on('rejoinFailed', () => { localStorage.removeItem('vr_session'); toast('Your game has ended'); leave(true); });
  }

  function tryRejoin() {
    const sess = JSON.parse(localStorage.getItem('vr_session') || 'null');
    if (sess && S.conn) S.conn.send('rejoin', sess);
  }

  function resumeSession() {
    const sess = JSON.parse(localStorage.getItem('vr_session') || 'null');
    if (!sess || !window.io || Date.now() - sess.t > 3 * 3600 * 1000) return false;
    goOnline(tryRejoin);
    S.conn.on('rejoinFailed', () => { localStorage.removeItem('vr_session'); loading(false); closeConn(); });
    return true;
  }

  function closeConn() {
    if (S.conn) S.conn.close();
    Object.assign(S, { conn: null, view: null, me: null, podsKey: '', lastRound: 0, animatedRound: 0, animating: false, queued: null, log: [], recap: null, display: null });
    hideCoach();
    FX.clear();
  }

  function leave(silent) {
    localStorage.removeItem('vr_session');
    closeConn();
    releaseWake();
    loading(false);
    closeSheets();
    show('home');
    if (!silent) SFX.tap();
  }

  /* ---------- state routing ---------- */
  function onState(v) {
    if (S.animating) { S.queued = v; return; }
    S.view = v;
    if (v.phase === 'LOBBY') {
      S.resultsShown = false;
      if (S.conn && S.conn.mode === 'solo') return;
      renderLobby(v);
      if (S.screen !== 'lobby') show('lobby');
      return;
    }
    if (v.phase === 'GAMEOVER') {
      if (!S.resultsShown) showResults(v);
      return;
    }
    if (S.screen !== 'game') { show('game'); S.podsKey = ''; requestWake(); }
    renderGame(v);
  }

  /* ---------- lobby ---------- */
  function renderLobby(v) {
    const isHost = v.hostId === v.youId;
    $('#lobby-code').textContent = v.code;
    $('#lobby-count').textContent = `(${v.players.length}/${C.MAX_PLAYERS})`;
    const rows = v.players.map((p) => `
      <div class="lobby-row" style="--pc:${colorOf(p)}">
        <div class="av">${avatarOf(p)}</div>
        <div class="nm">${esc(p.name)}</div>
        ${p.id === v.hostId ? '<span class="tag host">HOST</span>' : ''}
        ${p.id === v.youId ? '<span class="tag you">YOU</span>' : ''}
        ${p.isBot ? '<span class="tag">BOT</span>' : ''}
        ${!p.connected ? '<span class="tag off">OFFLINE</span>' : ''}
        ${isHost && p.id !== v.youId ? `<button class="x" data-rm="${p.id}" data-bot="${p.isBot ? 1 : 0}">✕</button>` : ''}
      </div>`);
    for (let i = v.players.length; i < C.MAX_PLAYERS; i++) {
      rows.push(isHost ? '<button class="lobby-row empty add" data-add="1">＋ ADD BOT</button>' : '<div class="lobby-row empty">Waiting for player…</div>');
    }
    $('#lobby-list').innerHTML = rows.join('');
    $('#lobby-list').onclick = (e) => {
      const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-rm]');
      if (add) { SFX.tap(); S.conn.send('addBot'); }
      if (rm) { SFX.tap(); S.conn.send(rm.dataset.bot === '1' ? 'removeBot' : 'kick', rm.dataset.rm); }
    };
    const need = C.MIN_PLAYERS - v.players.length;
    $('#lobby-hint').textContent = need > 0
      ? `Share the code with friends! ${need} empty seat${need > 1 ? 's' : ''} will be filled with bots when the heist starts.`
      : 'Crew is ready. 4–6 players per heist.';
    const rc = $('#lobby-rounds'), tc = $('#lobby-timer');
    chips(rc, C.AVAILABLE_ROUNDS.map((r) => ({ v: r, label: r, sub: 'ROUNDS' })), v.settings.rounds, (r) => S.conn.send('settings', { rounds: r }));
    chips(tc, C.ACTION_TIME_OPTIONS.map((t) => ({ v: t, label: t, sub: 'SECONDS' })), v.settings.actionTime, (t) => S.conn.send('settings', { actionTime: t }));
    rc.classList.toggle('locked', !isHost);
    tc.classList.toggle('locked', !isHost);
    $('#btn-start').style.display = isHost ? '' : 'none';
    $('#lobby-wait').style.display = isHost ? 'none' : '';
    renderQR(v.code);
  }

  const inviteUrl = (code) => `${location.origin}${location.pathname}?room=${code}`;
  function renderQR(code) {
    if (S.qrCode === code || !window.qrcode) return;
    try {
      const q = window.qrcode(0, 'M');
      q.addData(inviteUrl(code));
      q.make();
      $('#qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      $('#qr').classList.add('on');
      S.qrCode = code;
    } catch (_) { /* QR is optional */ }
  }

  function initLobby() {
    $('#btn-start').onclick = () => { SFX.tap(); S.conn.send('start'); };
    $('#btn-lobby-leave').onclick = () => leave();
    $('#btn-share').onclick = async () => {
      const code = S.view && S.view.code;
      const url = inviteUrl(code);
      const text = `Join my Vault Rush heist! Room code: ${code}`;
      try {
        if (navigator.share) await navigator.share({ title: 'Vault Rush', text, url });
        else { await navigator.clipboard.writeText(`${text}\n${url}`); toast('Invite link copied!'); }
      } catch (_) { /* user cancelled */ }
    };
  }

  /* ---------- game rendering ---------- */
  const meP = () => S.view.players.find((p) => p.id === S.view.youId);
  const opponents = () => S.view.players.filter((p) => p.id !== S.view.youId);
  const podEl = (id) => $(`[data-pid="${id}"]`);
  const boxEl = (id) => $(`[data-box="${id}"]`);
  const dispOf = (p) => (S.display && S.display[p.id]) || p;
  const nameOf = (id) => {
    if (S.view && id === S.view.youId) return '<span style="color:var(--cyan)">You</span>';
    const p = S.view && S.view.players.find((x) => x.id === id);
    return p ? `<span style="color:${colorOf(p)}">${esc(p.name)}</span>` : '?';
  };

  const seatPart = (id, sel) => { const el = podEl(id); return el ? $(sel, el) : null; };
  const avEl = (id) => seatPart(id, '.av');
  const lootEl = (id) => seatPart(id, '.loot');
  const bankEl = (id) => seatPart(id, '.bank');

  // A seat = character on a glowing ledge + loot crate (unsecured, fills with coins) + bank safe (secured).
  function seatHTML(p, isMe) {
    return `<div class="seat ${isMe ? 'me' : ''}" data-pid="${p.id}" ${isMe ? '' : `data-attack="${p.id}"`} style="--pc:${colorOf(p)}">
        <div class="stash">
          <div class="loot">${ART.lootCrate(0)}</div>
          <div class="amt u"></div>
          <div class="bank" ${isMe ? 'id="vault" data-secure="1"' : ''}>${ART.bank()}<span class="amt s"></span>${isMe ? '<span class="bank-hint">SECURE</span>' : ''}</div>
        </div>
        <div class="hero">
          <span class="crown">👑</span>
          <span class="tag-top raid">⚔ RAID</span><span class="tag-top bounty">👑 BOUNTY</span>${isMe ? '<span class="tag-top you">YOU</span>' : ''}
          <div class="av">${avatarOf(p)}<span class="ready">✓</span></div>
          <div class="nm">${esc(p.name)}${p.isBot ? '<i class="bot">BOT</i>' : ''}</div>
          <div class="lives"></div>
          <div class="habit"></div>
        </div>
      </div>`;
  }

  // Seats run down the left and right edges; I always sit bottom-left, others follow clockwise.
  function buildPods() {
    const key = S.view.players.map((p) => p.id).join(',') + (S.view.spectating ? ':spec' : '');
    if (key === S.podsKey) return;
    S.podsKey = key;
    const ps = S.view.players;
    const me = meP();
    const L = Math.ceil(ps.length / 2);
    let left, right;
    if (me) {
      const i = ps.indexOf(me);
      const others = [...ps.slice(i + 1), ...ps.slice(0, i)];
      left = [...others.slice(0, L - 1).reverse(), me];
      right = others.slice(L - 1);
    } else {
      left = ps.slice(0, L);
      right = ps.slice(L);
    }
    $('#side-left').innerHTML = left.map((p) => seatHTML(p, p === me)).join('');
    $('#side-right').innerHTML = right.map((p) => seatHTML(p, false)).join('');
  }

  function updatePod(p) {
    const el = podEl(p.id); if (!el) return;
    const d = dispOf(p);
    $('.lives', el).innerHTML = hearts(d.lives);
    $('.amt.u', el).textContent = short(d.unsecured);
    $('.amt.s', el).textContent = '🔒' + short(d.secured);
    const lv = ART.lootLevel(d.unsecured);
    const skin = (p.look && p.look.crate) || 'wood';
    if (el.dataset.lv !== lv + skin) { $('.loot', el).innerHTML = ART.lootCrate(lv, skin); el.dataset.lv = lv + skin; }
    el.classList.toggle('tempting', lv >= 3 && !d.eliminated); // danger meter: juicy unsecured pile
    el.classList.toggle('overflow', lv >= 4 && !d.eliminated);
    $('.bank', el).classList.toggle('full', d.secured > 0);
    const st = p.stats || {};
    $('.habit', el).textContent = p.id !== S.view.youId && st.rounds ? `🔒${st.secures}/${st.rounds} · ⚔${st.attacks}` : '';
    el.classList.toggle('dead', !!d.eliminated);
    el.classList.toggle('offline', !p.isBot && !p.connected);
    el.classList.toggle('acted', S.view.phase === 'ACTION' && p.hasActed && p.id !== S.view.youId);
    el.classList.toggle('leader', S.view.leaderId === p.id && !d.eliminated && S.view.phase !== 'RESOLVING');
  }

  function boxHTML(b) {
    const tier = b.tier || 'MYSTERY';
    return `<div class="box ${tier} ${b.golden ? 'golden' : ''}" data-box="${b.id}">
        <div class="chute">${ART.parachute(b.golden ? '#ffc94a' : ['#ff4fa3', '#3ef3ff', '#9b5cff', '#ff8a3d', '#7dff6b'][+b.id.slice(4) % 5])}</div>
        <span class="pick">YOUR PICK</span>
        ${b.golden ? '<span class="ribbon">×2</span>' : ''}
        <div class="crate">${ART.crate(tier, b.golden)}</div>
        <div class="val">${b.value == null ? '???' : fmt(b.value)}</div>
      </div>`;
  }
  function buildBoxes() {
    const bx = $('#boxes');
    bx.className = 'boxes n' + S.view.boxes.length;
    bx.innerHTML = S.view.boxes.map(boxHTML).join('');
  }

  // Blackout: swap mystery crates for the real ones when the round resolves
  function revealBoxes(boxes) {
    boxes.forEach((b) => {
      const el = boxEl(b.id); if (!el || !el.classList.contains('MYSTERY')) return;
      el.className = `box ${b.tier} ${b.golden ? 'golden' : ''}`;
      $('.crate', el).innerHTML = ART.crate(b.tier, b.golden);
      $('.val', el).textContent = fmt(b.value);
      FX.burst(el, '#9b5cff', 10);
    });
  }

  function currentAction() {
    return S.localAction !== undefined ? S.localAction : S.view.yourAction;
  }

  function renderGame(v) {
    buildPods();
    const newRound = v.round !== S.lastRound;
    if (newRound) {
      S.lastRound = v.round;
      S.localAction = undefined;
      S.lastTime = null;
      S.recap = null;
      FX.clear();
      $$('.reveal').forEach((r) => r.remove());
      buildBoxes();
      introBanner(v);
    }
    if (S.localAction !== undefined && JSON.stringify(v.yourAction) === JSON.stringify(S.localAction)) S.localAction = undefined;

    // HUD
    $('#hud-round').textContent = `${v.round}/${v.maxRounds}`;
    const chip = $('#hud-chip');
    chip.className = 'eg-pill';
    if (v.endgame) { chip.textContent = `🔥 ${v.endgame.label} ×${v.endgame.multiplier}`; chip.classList.add('on', 'endgame'); }
    else if (v.event) { chip.textContent = `${v.event.icon} ${v.event.label}`; chip.classList.add('on', 'event'); }
    const arena = $('#arena');
    arena.classList.remove('heat', 'danger', 'final');
    if (v.endgame) arena.classList.add(v.endgame.secureDisabled ? 'final' : v.endgame.multiplier >= 2 ? 'danger' : 'heat');
    arena.classList.toggle('frozen', v.phase !== 'ACTION');
    $('.alarm').classList.toggle('on', !!v.endgame && (v.endgame.multiplier >= 2));
    if (S.screen === 'game') { const lv = v.endgame ? 2 : 1; if (lv !== S.musicLevel) setMusic(lv); }
    renderTimer(v);

    v.players.forEach(updatePod);

    // selection highlight
    const a = currentAction();
    const me = meP();
    $$('.box').forEach((b) => b.classList.toggle('sel', !!a && a.type === 'CLAIM' && a.targetId === b.dataset.box));
    $$('.pod').forEach((p) => p.classList.toggle('target', !!a && a.type === 'ATTACK' && a.targetId === p.dataset.pid));
    const vault = $('#vault');
    if (vault) {
      const jammed = !!(v.endgame && v.endgame.secureDisabled);
      vault.classList.toggle('sel', !!a && a.type === 'SECURE');
      vault.classList.toggle('jammed', jammed || me.eliminated);
      $('.bank-hint', vault).textContent = jammed ? 'JAMMED' : a && a.type === 'SECURE' ? 'LOCKING ✓' : 'SECURE';
    }

    renderActionBar(v, a, me);
    drawAim(v, a, me);

    if (v.phase === 'ACTION' && S.tutorialPending && me && S.conn.mode === 'solo') { S.tutorialPending = false; startTutorial(); }
    if (v.phase === 'RESOLVING' && v.resolution && S.animatedRound !== v.resolution.round) runResolution(v);
  }

  function drawAim(v, a, me) {
    FX.clearBeams('aim-line');
    if (v.phase !== 'ACTION' || !a || !me || a.type === 'SECURE') return;
    const from = $('.seat.me .av');
    const to = a.type === 'CLAIM' ? $(`[data-box="${a.targetId}"] .crate`) : $(`[data-pid="${a.targetId}"] .av`);
    FX.beam(from, to, a.type === 'CLAIM' ? '#3ef3ff' : '#ff3d6e', 'aim-line');
  }

  function renderTimer(v) {
    const el = $('#timer');
    const t = v.phase === 'ACTION' ? v.timeLeft : v.phase === 'INTRO' ? v.actionTime : 0;
    $('#timer-num').textContent = v.phase === 'RESOLVING' ? '🔒' : v.paused ? '⏸' : t;
    $('#timer-ring').style.strokeDashoffset = 119.4 * (1 - t / v.actionTime);
    el.classList.toggle('warn', v.phase === 'ACTION' && t <= 10 && t > 5);
    el.classList.toggle('urgent', v.phase === 'ACTION' && t <= 5 && !v.paused);
    el.classList.toggle('frozen', v.phase === 'RESOLVING' || v.paused);
    if (v.phase === 'ACTION' && S.lastTime !== null && t < S.lastTime && t <= 10) SFX.tick(t <= 5);
    S.lastTime = v.phase === 'ACTION' ? t : null;
  }

  function renderActionBar(v, a, me) {
    const txt = $('#action-text'), lock = $('#btn-lock');
    txt.className = 'action-text';
    let html;
    if (!me) html = '👀 SPECTATING<span class="sub">Long-press anyone to see their stats</span>';
    else if (S.recap && v.phase === 'RESOLVING') { txt.classList.add('recap'); html = S.recap; }
    else if (me.eliminated) html = '👻 ELIMINATED<span class="sub">You are spectating: watch the heist unfold</span>';
    else if (v.phase === 'INTRO') html = '💰 Cash incoming…<span class="sub">Get ready to choose</span>';
    else if (v.phase === 'RESOLVING') html = '⏳ RESOLVING…<span class="sub">All choices revealed</span>';
    else if (!a) html = '👆 Tap a box, a rival or your vault<span class="sub">Hidden until time runs out · long-press for stats</span>';
    else if (a.type === 'CLAIM') {
      const b = v.boxes.find((x) => x.id === a.targetId);
      txt.classList.add('claim');
      html = `📦 CLAIM ${b && b.value != null ? fmt(b.value) : 'MYSTERY BOX'}<span class="sub">Split equally if others pick it too</span>`;
    } else if (a.type === 'ATTACK') {
      const t = v.players.find((x) => x.id === a.targetId);
      const pct = t && t.id === v.leaderId ? 60 : 50;
      txt.classList.add('attack');
      html = `⚔ RAID ${t ? esc(t.name) : ''}<span class="sub">Steal ${pct}% of ${t ? fmt(t.unsecured) : ''}, unless they secure</span>`;
    } else if (a.type === 'SECURE') {
      txt.classList.add('secure');
      html = `🔒 SECURE ${fmt(me.unsecured)}<span class="sub">Locks your cash & blocks every raid</span>`;
    }
    txt.innerHTML = html;
    const canLock = v.phase === 'ACTION' && me && !me.eliminated && !!a && !v.youLocked;
    lock.disabled = !canLock;
    lock.textContent = v.youLocked ? 'LOCKED ✓' : 'LOCK IN';
    lock.classList.toggle('done', !!v.youLocked);
    lock.style.display = !me || me.eliminated ? 'none' : '';
    $('#btn-emote').style.display = me ? '' : 'none';
  }

  function introBanner(v) {
    const eg = v.endgame;
    let sub = 'Pick your move!', cls = '', title = `ROUND ${v.round}`;
    if (eg) {
      cls = 'red';
      title = eg.label;
      sub = eg.secureDisabled ? `Prizes ×${eg.multiplier} · VAULTS JAMMED!` : `Prizes ×${eg.multiplier} · Stakes rising!`;
      if (eg.secureDisabled) SFX.siren(); else SFX.alarm();
      SFX.buzz([100, 60, 100]);
    }
    let extra = '';
    if (v.event) {
      extra = `<span class="ev"><b>${v.event.icon} ${v.event.label}</b>${v.event.desc}</span>`;
      setTimeout(SFX.event, 500);
      cls += ' long';
    }
    banner(title, sub, cls, extra);
    setTimeout(SFX.drop, 300);
  }

  function banner(title, sub, cls = '', extra = '') {
    const b = $('#banner');
    b.className = 'banner';
    b.innerHTML = `<h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}${extra}`;
    void b.offsetWidth;
    b.className = 'banner show ' + cls;
  }

  /* ---------- emotes ---------- */
  function initEmotes() {
    const pk = $('#emote-picker');
    pk.innerHTML = C.EMOTES.map((e) => `<button data-emo="${e}">${e}</button>`).join('');
    $('#btn-emote').onclick = (e) => { e.stopPropagation(); pk.classList.toggle('on'); SFX.tap(); };
    pk.onclick = (e) => {
      const b = e.target.closest('[data-emo]'); if (!b) return;
      if (S.conn) S.conn.send('emote', b.dataset.emo);
      pk.classList.remove('on');
    };
    document.addEventListener('click', (e) => { if (!e.target.closest('#emote-picker, #btn-emote')) pk.classList.remove('on'); });
  }
  function angry(id) {
    const av = avEl(id); if (!av) return;
    const m = document.createElement('span');
    m.className = 'anger';
    m.textContent = '💢';
    av.appendChild(m);
    setTimeout(() => m.remove(), 3200);
  }
  function showEmote({ playerId, emoji }) {
    const el = seatPart(playerId, '.hero'); if (!el) return;
    const b = document.createElement('span');
    b.className = 'bubble';
    b.textContent = emoji;
    el.appendChild(b);
    SFX.pop();
    setTimeout(() => b.remove(), 2300);
  }

  /* ---------- player info (long-press) ---------- */
  function openPlayer(id) {
    const v = S.view; if (!v) return;
    const p = v.players.find((x) => x.id === id); if (!p) return;
    const st = p.stats || {};
    const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');
    const box = $('#player-info');
    box.style.setProperty('--pc', colorOf(p));
    box.innerHTML = `
      <div class="sheet-head" style="width:100%"><span></span><button class="icon-btn small" data-close>✕</button></div>
      <div class="pav">${avatarOf(p)}</div>
      <h3>${esc(p.name)} ${p.isBot ? '🤖' : ''} ${v.leaderId === p.id ? '👑' : ''}</h3>
      <div>${hearts(p.lives)}</div>
      <div class="pstats">
        <div>Unsecured<b style="color:var(--green)">${fmt(p.unsecured)}</b></div>
        <div>Vault<b style="color:var(--gold)">${fmt(p.secured)}</b></div>
        <div>Secures<b>${st.secures || 0}/${st.rounds || 0} · ${pct(st.secures, st.rounds)}</b></div>
        <div>Raids launched<b>${st.attacks || 0}</b></div>
        <div>Raids bounced<b>${st.failedRaids || 0}</b></div>
        <div>Raids blocked<b>${st.blocks || 0}</b></div>
        <div>Loot stolen<b>${fmt(st.lootGained || 0)}</b></div>
        <div>Box claims<b>${st.claims || 0}</b></div>
      </div>
      ${v.leaderId === p.id ? '<p class="hint">👑 Current leader: raiding them steals 60%!</p>' : ''}`;
    $('#sheet-player').classList.add('show');
    SFX.tap();
    SFX.buzz(20);
  }

  /* ---------- input ---------- */
  function initGame() {
    const arena = $('#arena');
    let lp = null;
    const cancelLP = () => { if (lp) clearTimeout(lp); lp = null; };
    arena.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-pid]'); if (!t) return;
      cancelLP();
      lp = setTimeout(() => { lp = null; S.suppressClick = true; openPlayer(t.dataset.pid); }, 480);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => arena.addEventListener(ev, cancelLP));
    arena.addEventListener('contextmenu', (e) => {
      const t = e.target.closest('[data-pid]'); if (!t) return;
      e.preventDefault(); cancelLP(); openPlayer(t.dataset.pid);
    });

    arena.addEventListener('click', (e) => {
      if (S.suppressClick) { S.suppressClick = false; return; }
      const v = S.view;
      if (!v || v.phase !== 'ACTION' || S.animating) return;
      const me = meP();
      if (!me || me.eliminated) return;
      if (v.youLocked) { toast('You locked in your move'); return; }
      const cur = currentAction();
      let a = null, label = '';
      const box = e.target.closest('[data-box]');
      const pod = e.target.closest('[data-attack]');
      const vault = e.target.closest('[data-secure]');
      if (box) { a = { type: 'CLAIM', targetId: box.dataset.box }; label = '📦 CLAIM'; }
      else if (pod) {
        const t = v.players.find((p) => p.id === pod.dataset.attack);
        if (!t || t.eliminated) return;
        a = { type: 'ATTACK', targetId: t.id }; label = '⚔ RAID';
      } else if (vault) {
        if (v.endgame && v.endgame.secureDisabled) { toast('🚫 Vaults are jammed in the Final Heist!'); FX.cls($('#vault'), 'shake', 450); return; }
        a = { type: 'SECURE' }; label = '🔒 SECURE';
      } else return;
      if (cur && cur.type === a.type && cur.targetId === a.targetId) { a = null; label = '✖ CANCELLED'; } // tap again = deselect
      S.localAction = a;
      S.conn.send('action', a || { type: 'NONE' });
      FX.tapLabel(e.clientX, e.clientY, label);
      if (a) SFX.select(); else SFX.tap();
      SFX.buzz(15);
      renderGame(v);
    });
    $('#btn-lock').onclick = () => { SFX.secure(); S.conn.send('lockIn'); };
    window.addEventListener('resize', () => { if (S.screen === 'game' && S.view && !S.animating) renderGame(S.view); });
  }

  /* ---------- tutorial (first solo game) ---------- */
  const TUT = [
    { sel: '#boxes', text: '📦 <b>Tap a box to CLAIM it.</b> If other players pick the same box, the cash is <b>split</b> between you. The biggest box is often the most crowded!' },
    { sel: '#side-right', text: '⚔ <b>Tap a rival to RAID them</b> and steal 50% of their unsecured (green) cash. But if they secure that round, you\'re <b>blocked</b>: −1 ❤️ and half your cash goes to them!' },
    { sel: '.seat.me', text: '🧺 This is <b>you</b>. Your crate fills with coins as you earn: that cash is <b>unsecured</b> and can be stolen. 🏦 <b>Tap your SAFE to secure it</b> forever (5% fee). Securing also blocks every raid on you that round.' },
    { sel: '#timer', text: '⏱ Everyone chooses <b>secretly</b> at the same time. When the timer hits 0, all moves happen at once. Hit <b>LOCK IN</b> to skip the wait. Good luck, robber!' },
  ];
  let tutStep = 0;
  function startTutorial() {
    S.conn.send('pause', true);
    tutStep = 0;
    $('#coach').classList.add('show');
    showTutStep();
  }
  function showTutStep() {
    const step = TUT[tutStep];
    const el = $(step.sel);
    if (!el) return endTutorial();
    const r = el.getBoundingClientRect();
    const pad = 8;
    Object.assign($('#coach-hole').style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const card = $('#coach-card');
    const below = r.top + r.height / 2 < innerHeight / 2;
    $('#coach-text').innerHTML = step.text;
    $('#coach-step').textContent = `${tutStep + 1} / ${TUT.length}`;
    $('#coach-next').textContent = tutStep === TUT.length - 1 ? "LET'S GO!" : 'NEXT';
    card.style.top = below ? Math.min(innerHeight - card.offsetHeight - 30, r.bottom + 18) + 'px' : Math.max(10, r.top - 18 - card.offsetHeight) + 'px';
  }
  function endTutorial() {
    hideCoach();
    localStorage.setItem('vr_tut', '1');
    if (S.conn) S.conn.send('pause', false);
  }
  function hideCoach() { $('#coach').classList.remove('show'); }
  function initTutorial() {
    $('#coach-next').onclick = () => { SFX.tap(); tutStep++; if (tutStep >= TUT.length) endTutorial(); else showTutStep(); };
  }

  /* ---------- resolution animation ---------- */
  function revealLabel(a, v, boxes) {
    if (!a || a.type === 'NONE') return '💤 idle';
    if (a.type === 'SECURE') return '🔒 secure';
    if (a.type === 'CLAIM') { const b = boxes.find((x) => x.id === a.targetId); return '📦 ' + (b ? short(b.value) : ''); }
    const t = v.players.find((x) => x.id === a.targetId);
    return '⚔ ' + (t ? esc(t.name) : '');
  }

  function bumpPod(id) {
    const el = podEl(id); if (!el) return;
    const p = S.view.players.find((x) => x.id === id);
    if (p) updatePod(p);
    FX.cls($('.stash', el), 'bump', 400);
  }

  function caption(html) {
    const c = $('#caption');
    if (!html) { c.classList.remove('on'); return; }
    c.innerHTML = html;
    c.classList.add('on');
  }
  function light(els) {
    $$('#arena .lit').forEach((e) => e.classList.remove('lit'));
    els.forEach((e) => e && e.classList.add('lit'));
  }

  function eventLine(e, boxes) {
    const n = (id) => nameOf(id);
    switch (e.type) {
      case 'secure': return `🔒 ${n(e.playerId)} secured <b>${fmt(e.amount - e.fee)}</b>${e.fee ? ` <small>(fee ${fmt(e.fee)})</small>` : ''}`;
      case 'blocked': return `🛡️ ${n(e.defenderId)} BLOCKED ${n(e.attackerId)}! <span class="r">−1❤️${e.penalty ? ' −' + fmt(e.penalty) : ''}</span>`;
      case 'loot': return e.total > 0
        ? `⚔ ${e.shares.map((s) => n(s.playerId)).join(' & ')} raided ${n(e.targetId)} for <b>${fmt(e.total)}</b>${e.bounty ? ' 👑 BOUNTY' : ''}`
        : `⚔ ${e.shares.map((s) => n(s.playerId)).join(' & ')} raided ${n(e.targetId)}… <span class="r">empty pockets!</span>`;
      case 'claim': {
        const b = boxes.find((x) => x.id === e.boxId);
        return `📦 ${b && b.golden ? '🌟 ' : ''}<b>${fmt(e.value)}</b> → ${e.shares.map((s) => n(s.playerId)).join(', ')}${e.shares.length > 1 ? ` <span class="c">(split ${e.shares.length} ways)</span>` : ''}`;
      }
      case 'eliminated': return `💀 ${n(e.playerId)} is <span class="r">ELIMINATED</span>`;
      default: return '';
    }
  }

  async function runResolution(v) {
    const res = v.resolution;
    S.animatedRound = res.round;
    S.animating = true;
    S.display = {};
    res.before.forEach((p) => (S.display[p.id] = { ...p }));
    v.players.forEach(updatePod);
    FX.clearBeams();
    revealBoxes(res.boxes);
    SFX.freeze();
    const arena = $('#arena');
    const slow = !!(v.endgame && v.endgame.secureDisabled);
    if (slow) { banner('FINAL REVEAL', 'Slow motion… 🥁', 'red'); arena.classList.add('slowmo'); }
    else banner("TIME'S UP!", '', 'gold');
    const D = (id) => S.display[id];
    const shown = res.events.filter((e) => e.type !== 'unclaimed');
    const drum = slow ? 850 : 0;
    const per = Math.max(700, Math.min(slow ? 2400 : 1400, (res.duration - 2400 - drum * shown.length) / Math.max(1, shown.length))) * sp();
    const lines = [];

    await FX.wait(700 * sp());
    // reveal everyone's choice + raid beams
    res.before.forEach((p) => {
      if (p.eliminated) return;
      const el = podEl(p.id); if (!el) return;
      const r = document.createElement('div');
      r.className = 'reveal';
      r.innerHTML = revealLabel(res.actions[p.id], v, res.boxes);
      $('.hero', el).appendChild(r);
      const a = res.actions[p.id];
      if (a && a.type === 'ATTACK') FX.beam($('.av', el), $(`[data-pid="${a.targetId}"] .av`), colorOf(p), 'beam-line');
    });
    SFX.whoosh();
    await FX.wait(1200 * sp());
    arena.classList.add('spotlight');

    let claimsStarted = false;
    for (const e of res.events) {
      if ((e.type === 'claim' || e.type === 'unclaimed') && !claimsStarted) {
        claimsStarted = true;
        FX.clearBeams('beam-line');
        res.events.filter((x) => x.type === 'unclaimed').forEach((x) => boxEl(x.boxId) && boxEl(x.boxId).classList.add('empty'));
      }
      if (e.type === 'unclaimed') continue;
      if (slow) { light([]); caption('🥁 <b>…</b>'); SFX.drumroll(); await FX.wait(drum * sp()); }
      const line = eventLine(e, res.boxes);
      lines.push(line);
      caption(line);

      if (e.type === 'secure') {
        const seat = podEl(e.playerId), bk = bankEl(e.playerId);
        light([seat]);
        SFX.secure();
        FX.comic(bk, 'LOCKED!', 'gold');
        if (e.amount > 0) {
          FX.coins(lootEl(e.playerId), bk, Math.ceil(e.amount / 2000) + 2, { onArrive: () => {
            D(e.playerId).unsecured -= e.amount; D(e.playerId).secured += e.amount - e.fee;
            bumpPod(e.playerId);
            FX.cls(bk, 'cheer', 600);
          } });
        }
        FX.burst(bk, '#ffc94a', 10);
        FX.floatText(bk, e.amount > 0 ? '🔒 ' + short(e.amount - e.fee) : '🔒 LOCKED', 'gold');
        if (e.playerId === v.youId) $('#vault').classList.add('sel');
      }

      if (e.type === 'blocked') {
        const att = avEl(e.attackerId), def = avEl(e.defenderId);
        light([podEl(e.attackerId), podEl(e.defenderId)]);
        SFX.whoosh();
        FX.lunge(att, def, true);
        await FX.wait(260 * sp());
        FX.shield(def); SFX.shield();
        FX.comic(def, 'BLOCKED!', 'blue');
        await FX.wait(320 * sp());
        SFX.hit(); FX.cls(att, 'hurt', 500);
        D(e.attackerId).lives -= e.lifeLoss;
        FX.floatText(att, '-1 ❤️', 'minus big');
        angry(e.attackerId);
        bumpPod(e.attackerId);
        setTimeout(SFX.lifeLost, 150);
        if (e.attackerId === v.youId) FX.cls($('#arena'), 'shake', 450);
        if (e.penalty > 0) {
          FX.coins(lootEl(e.attackerId), bankEl(e.defenderId), Math.ceil(e.penalty / 2000) + 2, { onArrive: () => {
            D(e.attackerId).unsecured -= e.penalty; D(e.defenderId).secured += e.penalty;
            bumpPod(e.attackerId); bumpPod(e.defenderId);
            FX.floatText(bankEl(e.defenderId), '+' + short(e.penalty), 'gold');
            FX.cls(def, 'cheer', 600);
          } });
        }
      }

      if (e.type === 'loot') {
        const tgt = avEl(e.targetId);
        light([podEl(e.targetId), ...e.shares.map((s) => podEl(s.playerId))]);
        SFX.whoosh();
        e.shares.forEach((s) => FX.lunge(avEl(s.playerId), tgt));
        await FX.wait(300 * sp());
        SFX.hit(); FX.cls(tgt, 'hurt', 500);
        if (e.targetId === v.youId) FX.cls($('#arena'), 'shake', 450);
        FX.burst(lootEl(e.targetId), '#ff3d6e', 12);
        FX.comic(tgt, e.total > 0 ? (e.bounty ? 'BOUNTY!' : 'STOLEN!') : 'EMPTY!', 'red');
        if (e.total > 0) {
          FX.floatText(lootEl(e.targetId), '-' + short(e.total), 'minus big');
          D(e.targetId).unsecured -= e.total; bumpPod(e.targetId);
          e.shares.forEach((s) => FX.coins(lootEl(e.targetId), lootEl(s.playerId), Math.ceil(s.amount / 2000) + 2, { onArrive: () => {
            D(s.playerId).unsecured += s.amount; bumpPod(s.playerId);
            FX.floatText(lootEl(s.playerId), '+' + short(s.amount), 'plus');
            FX.cls(avEl(s.playerId), 'cheer', 600);
          } }));
        }
      }

      if (e.type === 'claim') {
        const b = boxEl(e.boxId);
        light([b, ...e.shares.map((s) => podEl(s.playerId))]);
        if (b) b.classList.add('open');
        FX.burst(b, '#ffc94a', 16);
        FX.comic(b, e.shares.length > 1 ? 'SPLIT!' : e.golden ? 'JACKPOT!' : 'KA-CHING!', e.shares.length > 1 ? 'purple' : 'gold');
        if (e.shares.length > 1 && b) {
          const spn = document.createElement('span'); spn.className = 'split'; spn.textContent = e.shares.length + '-WAY'; b.appendChild(spn);
        }
        await FX.wait(250 * sp());
        e.shares.forEach((s) => FX.coins(b, lootEl(s.playerId), Math.ceil(s.amount / 1500) + 2, { onArrive: () => {
          D(s.playerId).unsecured += s.amount; bumpPod(s.playerId);
          FX.floatText(lootEl(s.playerId), '+' + short(s.amount), 'plus');
          FX.cls(avEl(s.playerId), 'cheer', 600);
        } }));
      }

      if (e.type === 'eliminated') {
        light([podEl(e.playerId)]);
        D(e.playerId).eliminated = true;
        bumpPod(e.playerId);
        SFX.eliminated();
        FX.comic(avEl(e.playerId), 'BUSTED!', 'red');
        if (e.playerId === v.youId) setTimeout(() => banner('ELIMINATED', 'You are now spectating', 'red'), 400);
      }
      await FX.wait(per);
    }

    arena.classList.remove('spotlight', 'slowmo');
    light([]);
    caption('');
    FX.clearBeams();

    // log + personal recap
    const label = res.event ? ` · ${C.EVENTS[res.event].icon} ${C.EVENTS[res.event].label}` : v.endgame ? ` · 🔥 ${v.endgame.label}` : '';
    S.log.unshift({ round: res.round, label, lines: lines.length ? lines : ['😴 A quiet round. Nobody did anything.'] });
    const before = res.before.find((p) => p.id === v.youId);
    const after = S.view && S.view.players.find((p) => p.id === v.youId);
    if (before && after && !before.eliminated) {
      const dm = after.unsecured + after.secured - (before.unsecured + before.secured);
      const dl = after.lives - before.lives;
      const parts = [dm >= 0 ? `+${fmt(dm)}` : `−${fmt(-dm)}`];
      if (dl) parts.push(`${dl} ❤️`);
      S.recap = `📊 THIS ROUND: ${parts.join(' · ')}<span class="sub">Tap 📜 to see the full round log</span>`;
    }

    await FX.wait(300);
    S.display = null;
    S.animating = false;
    if (S.view) { S.view.players.forEach(updatePod); if (S.view.phase === 'RESOLVING') renderActionBar(S.view, null, meP()); }
    if (S.queued) { const q = S.queued; S.queued = null; onState(q); }
  }

  function renderLog() {
    const box = $('#log-list');
    if (!S.log.length) { box.innerHTML = '<p class="hint">Nothing yet. Play a round!</p>'; return; }
    box.innerHTML = S.log.map((r) => `<div class="log-round"><h4>ROUND ${r.round}${r.label}</h4>${r.lines.map((l) => `<div>${l}</div>`).join('')}</div>`).join('');
  }

  /* ---------- results ---------- */
  function showResults(v) {
    S.resultsShown = true;
    releaseWake();
    hideCoach();
    const r = v.ranking;
    const byId = Object.fromEntries(r.map((p) => [p.id, p]));
    const w = r[0];
    const mine = r.find((p) => p.id === v.youId);
    const iWon = mine && mine.rank === 1;
    if (mine) recordGame(iWon);
    $('#winner').innerHTML = `
      <div class="wcrown">👑</div>
      <div class="wav dance">${ART.avatar(w.avatar, ART.colorOf(w.seat), w.look && w.look.acc)}</div>
      <div class="wname">${iWon ? 'YOU WIN!' : esc(w.name) + ' WINS!'}</div>
      <div class="wamt">${fmt(w.total)}</div>`;
    $('#awards').innerHTML = (v.awards || []).map((a, i) => {
      const p = byId[a.playerId];
      return `<div class="award" style="animation-delay:${0.6 + i * 0.12}s"><span class="ai">${a.icon}</span><div>
        <div class="at">${a.title.toUpperCase()}</div><div class="an" style="color:${ART.colorOf(p.seat)}">${esc(p.name)}${p.id === v.youId ? ' (you)' : ''}</div>
        <div class="av2">${a.count ? a.value : fmt(a.value)} ${a.unit}</div></div></div>`;
    }).join('');
    $('#result-list').innerHTML = r.map((p) => `
      <div class="rr ${p.id === v.youId ? 'me' : ''} ${p.eliminated ? 'dead' : ''}" style="--pc:${ART.colorOf(p.seat)}">
        <div class="rk">#${p.rank}</div>
        <div class="av">${ART.avatar(p.avatar, ART.colorOf(p.seat), p.look && p.look.acc)}</div>
        <div class="nm">${esc(p.name)}${p.isBot ? ' 🤖' : ''}${p.eliminated ? ' <span class="elim">ELIMINATED</span>' : ''}
          <small>🔒 ${short(p.secured)} · 💵 ${short(p.unsecured)} · ${p.lives ? '❤️×' + p.lives : '💀'}</small></div>
        <div class="tot">${fmt(p.total)}</div>
      </div>`).join('');
    const isHost = v.hostId === v.youId;
    const again = $('#btn-again');
    again.disabled = !isHost;
    again.textContent = isHost ? '🔁 PLAY AGAIN' : '⏳ WAITING FOR HOST…';
    show('results');
    if (iWon) { SFX.win(); FX.confetti(120); setTimeout(() => FX.confetti(60), 1200); } else SFX.lose();
  }

  function initResults() {
    $('#btn-again').onclick = () => {
      SFX.tap();
      S.resultsShown = false;
      Object.assign(S, { lastRound: 0, animatedRound: 0, podsKey: '', log: [] });
      S.conn.send('playAgain');
      if (S.conn.mode === 'solo') S.conn.send('start');
    };
    $('#btn-home').onclick = () => leave();
  }

  /* ---------- screen wake lock (keeps phones awake mid-game) ---------- */
  async function requestWake() {
    try { if ('wakeLock' in navigator && !S.wakeLock) S.wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
  function releaseWake() { if (S.wakeLock) { S.wakeLock.release().catch(() => {}); S.wakeLock = null; } }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.screen === 'game') { S.wakeLock = null; requestWake(); }
    if (document.visibilityState === 'hidden') SFX.Music.stop(); else if (S.audioUnlocked) SFX.Music.play(S.musicLevel);
  });

  /* ---------- boot ---------- */
  splash();
  cashRain();
  initSheets(); initHome(); initLocker(); initLobby(); initGame(); initEmotes(); initTutorial(); initResults();
  const roomParam = new URLSearchParams(location.search).get('room');
  if (roomParam) {
    $('#code-input').value = roomParam.toUpperCase().slice(0, 4);
    history.replaceState(null, '', location.pathname);
    localStorage.removeItem('vr_session');
    show('join');
  } else resumeSession();

  // wake the (free-tier) server early while the player is still on the menu
  if (window.io && location.protocol.startsWith('http')) fetch('healthz').catch(() => {});

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
