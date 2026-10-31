/* Vault Rush — hand-built SVG art: robber characters, robot bots, crates/safes/chests, parachutes.
 * Everything is vector, so it is crisp on every phone and costs zero downloads. */
const ART = (() => {
  // Player colours by seat — used for pods, beams, names.
  const COLORS = ['#3ef3ff', '#ff4fa3', '#ffc94a', '#7dff6b', '#b58cff', '#ff8a3d'];
  const colorOf = (seat) => COLORS[(seat || 0) % COLORS.length];

  const SKIN = ['#f6d0b1', '#e8b48f', '#c98c62', '#9c6644', '#6e4630', '#f2c6a0'];

  // [skin, hat, extra, hatColor, name]
  const CHARS = [
    [0, 'beanie', 'none', '#e53950', 'Red'],
    [2, 'fedora', 'mustache', '#2b2b38', 'Professor'],
    [1, 'cap', 'goldtooth', '#2d6cdf', 'Ace'],
    [3, 'hood', 'none', '#4b4b5e', 'Shadow'],
    [4, 'bandana', 'beard', '#ff8a3d', 'Brick'],
    [5, 'hair', 'lipstick', '#3a2215', 'Vixen'],
    [1, 'headphones', 'none', '#7dff6b', 'Hacker'],
    [2, 'beanie', 'beard', '#2fbf8f', 'Grizzly'],
    [0, 'cap', 'scarf', '#ffc94a', 'Goldie'],
    [3, 'hair', 'goldtooth', '#111', 'Smooth'],
    [4, 'fedora', 'none', '#7b3fe4', 'Boss'],
    [5, 'bun', 'none', '#c0392b', 'Ninja'],
  ];
  const HUMAN_IDS = CHARS.map((_, i) => 'c' + i);

  function hat(kind, c) {
    switch (kind) {
      case 'beanie': return `<path d="M24 42c0-17 11-27 26-27s26 10 26 27z" fill="${c}"/><rect x="21" y="38" width="58" height="10" rx="5" fill="${c}" stroke="#0003" stroke-width="2"/><circle cx="50" cy="13" r="6" fill="#fff"/>`;
      case 'fedora': return `<ellipse cx="50" cy="35" rx="38" ry="7" fill="${c}"/><path d="M30 35c0-14 6-22 20-22s20 8 20 22z" fill="${c}"/><rect x="30" y="28" width="40" height="5" fill="#c0392b"/>`;
      case 'cap': return `<path d="M25 40c0-15 11-24 25-24s25 9 25 24z" fill="${c}"/><path d="M50 40h34c0 4-6 6-14 6H50z" fill="${c}" stroke="#0003" stroke-width="1.5"/><circle cx="50" cy="17" r="3" fill="#fff6"/>`;
      case 'hood': return `<path d="M14 92c0-50 14-78 36-78s36 28 36 78z" fill="${c}"/><path d="M26 92c0-36 10-60 24-60s24 24 24 60z" fill="#0004"/>`;
      case 'bandana': return `<path d="M25 38c0-14 11-22 25-22s25 8 25 22z" fill="${c}"/><circle cx="36" cy="28" r="2" fill="#fff8"/><circle cx="58" cy="24" r="2" fill="#fff8"/><circle cx="64" cy="33" r="2" fill="#fff8"/><path d="M75 34l10 6-8 3z" fill="${c}"/>`;
      case 'headphones': return `<path d="M24 50c0-22 12-34 26-34s26 12 26 34" fill="none" stroke="#222" stroke-width="6"/><rect x="17" y="44" width="11" height="18" rx="5" fill="${c}"/><rect x="72" y="44" width="11" height="18" rx="5" fill="${c}"/><path d="M30 30c4-10 12-14 20-14s16 4 20 14c-6-4-12-6-20-6s-14 2-20 6z" fill="#3a2215"/>`;
      case 'hair': return `<path d="M24 52c-4-24 8-38 26-38s30 14 26 38c-4-10-10-16-26-16s-22 6-26 16z" fill="${c}"/><path d="M24 52c-2 10 0 26 4 34l6-30z M76 52c2 10 0 26-4 34l-6-30z" fill="${c}"/>`;
      case 'bun': return `<circle cx="50" cy="13" r="9" fill="#222"/><path d="M25 46c0-18 11-28 25-28s25 10 25 28c-6-8-14-12-25-12s-19 4-25 12z" fill="#222"/><rect x="22" y="38" width="56" height="7" fill="${c}"/><path d="M78 40l10 4-10 4z" fill="${c}"/>`;
      default: return '';
    }
  }

  function extra(kind, skin) {
    switch (kind) {
      case 'mustache': return `<path d="M38 66c4-4 8-4 12-1 4-3 8-3 12 1-4 3-8 2-12 0-4 2-8 3-12 0z" fill="#2a1a10"/>`;
      case 'beard': return `<path d="M30 60c2 18 10 26 20 26s18-8 20-26c-4 6-10 8-20 8s-16-2-20-8z" fill="#3a2215"/><path d="M42 69h16" stroke="#7a3b2a" stroke-width="3" stroke-linecap="round"/>`;
      case 'goldtooth': return `<path d="M41 68q9 6 18 0" fill="#fff" stroke="#5a2a1a" stroke-width="2"/><rect x="51" y="68" width="4" height="4" fill="#ffc94a"/>`;
      case 'lipstick': return `<path d="M43 68q7 5 14 0q-7 2-14 0z" fill="#e5304f" stroke="#a01c35" stroke-width="1.5"/>`;
      case 'scarf': return `<path d="M30 74c8 6 32 6 40 0l2 8c-10 6-34 6-44 0z" fill="#e53950"/>`;
      default: return `<path d="M43 68q7 5 14 0" fill="none" stroke="#5a2a1a" stroke-width="2.5" stroke-linecap="round"/>`;
    }
  }

  function human(i, color) {
    const [s, h, x, hc] = CHARS[i % CHARS.length];
    const skin = SKIN[s];
    const back = h === 'hood' ? hat('hood', hc) : '';
    return `<svg viewBox="0 0 100 100" class="art-av">
      ${back}
      <path d="M14 100c2-16 16-24 36-24s34 8 36 24z" fill="${color}"/>
      <path d="M40 76l10 12 10-12" fill="#fff" opacity=".9"/>
      <rect x="44" y="64" width="12" height="14" fill="${skin}"/>
      <ellipse cx="50" cy="52" rx="24" ry="25" fill="${skin}"/>
      <ellipse cx="27" cy="54" rx="4" ry="6" fill="${skin}"/><ellipse cx="73" cy="54" rx="4" ry="6" fill="${skin}"/>
      <path d="M24 46h52v11c-6 3-12 3-17-1-3-2-6-2-9 0s-6 2-9 0c-5 4-11 4-17 1z" fill="#14101f"/>
      <ellipse cx="39" cy="51" rx="6" ry="4.5" fill="#fff"/><ellipse cx="61" cy="51" rx="6" ry="4.5" fill="#fff"/>
      <circle cx="40" cy="51.5" r="2.6" fill="#111"/><circle cx="62" cy="51.5" r="2.6" fill="#111"/>
      <path d="M33 44l10 2M67 44l-10 2" stroke="#14101f" stroke-width="3" stroke-linecap="round"/>
      ${extra(x, skin)}
      ${h !== 'hood' ? hat(h, hc) : ''}
    </svg>`;
  }

  function robot(i, color) {
    const heads = ['#b9c4d6', '#9aa7bd', '#c9b98f', '#8fb9b2', '#b79ac9', '#a3a3a3'];
    const hcol = heads[i % heads.length];
    const ant = i % 2 ? `<path d="M50 20V8" stroke="#555" stroke-width="3"/><circle cx="50" cy="7" r="5" fill="${color}"/>` :
      `<path d="M34 22l-6-12M66 22l6-12" stroke="#555" stroke-width="3"/><circle cx="28" cy="9" r="4" fill="${color}"/><circle cx="72" cy="9" r="4" fill="${color}"/>`;
    const eyes = i % 3 === 0
      ? `<rect x="28" y="40" width="44" height="12" rx="6" fill="#0b0b18"/><rect x="31" y="43" width="38" height="6" rx="3" fill="${color}" class="led"/>`
      : `<circle cx="38" cy="46" r="8" fill="#0b0b18"/><circle cx="62" cy="46" r="8" fill="#0b0b18"/><circle cx="38" cy="46" r="4.5" fill="${color}" class="led"/><circle cx="62" cy="46" r="4.5" fill="${color}" class="led"/>`;
    return `<svg viewBox="0 0 100 100" class="art-av">
      <path d="M16 100c2-14 14-22 34-22s32 8 34 22z" fill="#555c6e"/>
      <rect x="40" y="70" width="20" height="10" fill="#666"/>
      ${ant}
      <rect x="22" y="20" width="56" height="54" rx="14" fill="${hcol}" stroke="#0003" stroke-width="3"/>
      <rect x="14" y="38" width="8" height="18" rx="3" fill="#777"/><rect x="78" y="38" width="8" height="18" rx="3" fill="#777"/>
      ${eyes}
      <rect x="36" y="58" width="28" height="8" rx="3" fill="#0b0b18"/>
      <path d="M41 58v8M46 58v8M51 58v8M56 58v8M61 58v8" stroke="${color}" stroke-width="1.5" opacity=".7"/>
      <rect x="40" y="82" width="20" height="10" rx="3" fill="${color}" opacity=".85"/>
    </svg>`;
  }

  /* Unlockable accessories drawn on top of any character (100x100 space). */
  const ACC = {
    none: '',
    shades: `<g><rect x="26" y="44" width="21" height="12" rx="5" fill="#0d0d14"/><rect x="53" y="44" width="21" height="12" rx="5" fill="#0d0d14"/>
      <path d="M47 48h6M26 48l-4-2M74 48l4-2" stroke="#0d0d14" stroke-width="3"/><path d="M30 47h7M57 47h7" stroke="#fff8" stroke-width="2" stroke-linecap="round"/></g>`,
    partyhat: `<g><path d="M38 28L52 1l13 26z" fill="#ff4fa3" stroke="#a01c5a" stroke-width="2"/><path d="M43 18l14 4M47 10l10 3" stroke="#ffc94a" stroke-width="3"/>
      <circle cx="52" cy="2" r="5" fill="#ffc94a"/></g>`,
    tophat: `<g><rect x="33" y="3" width="34" height="22" rx="3" fill="#15121f" stroke="#000" stroke-width="1.5"/><rect x="33" y="17" width="34" height="5" fill="#c0392b"/>
      <ellipse cx="50" cy="26" rx="27" ry="5" fill="#15121f"/></g>`,
    chain: `<g><path d="M27 82q23 18 46 0" fill="none" stroke="#ffc94a" stroke-width="4" stroke-dasharray="5 2"/><circle cx="50" cy="92" r="6" fill="#ffc94a" stroke="#b86b00" stroke-width="2"/>
      <text x="50" y="95" font-size="8" font-weight="900" text-anchor="middle" fill="#8a4b00">₹</text></g>`,
    halo: `<g><ellipse cx="50" cy="10" rx="19" ry="5" fill="none" stroke="#fff6a8" stroke-width="4"/><ellipse cx="50" cy="10" rx="19" ry="5" fill="none" stroke="#ffc94a" stroke-width="1.5"/></g>`,
  };

  function avatar(id, color = '#3ef3ff', acc = 'none') {
    id = String(id || 'c0');
    let svg;
    if (id[0] === 'r') svg = robot(+id.slice(1) || 0, color);
    else if (id[0] === 'c') svg = human(+id.slice(1) || 0, color);
    else return `<span class="emoji-av">${id}</span>`; // legacy emoji
    const extra = ACC[acc] || '';
    return extra ? svg.replace(/<\/svg>\s*$/, extra + '</svg>') : svg;
  }

  /* -------- prize containers -------- */
  function crate(tier, golden) {
    if (tier === 'MYSTERY') return `<svg viewBox="0 0 100 90" class="art-box">
      <rect x="8" y="30" width="84" height="56" rx="6" fill="#2a2440" stroke="#000" stroke-opacity=".4" stroke-width="3"/>
      <g class="lid"><rect x="4" y="18" width="92" height="16" rx="5" fill="#3a3358"/></g>
      <text x="50" y="72" font-family="Bungee, Impact" font-size="34" text-anchor="middle" fill="#9b5cff">?</text></svg>`;
    if (tier === 'LOW') return `<svg viewBox="0 0 100 90" class="art-box">
      <rect x="8" y="30" width="84" height="56" rx="4" fill="#b8733f"/>
      <path d="M8 44h84M8 58h84M8 72h84" stroke="#8a4f26" stroke-width="2"/>
      <path d="M12 34l76 48M88 34L12 82" stroke="#d99a5c" stroke-width="7" opacity=".85"/>
      <rect x="8" y="30" width="84" height="56" rx="4" fill="none" stroke="#6b3a17" stroke-width="5"/>
      <g class="lid"><rect x="4" y="18" width="92" height="15" rx="3" fill="#c98446" stroke="#6b3a17" stroke-width="4"/></g>
      <circle cx="50" cy="58" r="12" fill="#6b3a17"/><text x="50" y="64" font-family="Bungee, Impact" font-size="16" text-anchor="middle" fill="#f0b28a">₹</text></svg>`;
    if (tier === 'MEDIUM') return `<svg viewBox="0 0 100 90" class="art-box">
      <rect x="8" y="24" width="84" height="62" rx="9" fill="#7f9bbd" stroke="#3f5a7a" stroke-width="4"/>
      <rect x="16" y="32" width="68" height="46" rx="5" fill="#9fb9d8" stroke="#5e7da3" stroke-width="2"/>
      <g class="lid"><rect x="16" y="32" width="68" height="46" rx="5" fill="#aec6e3" stroke="#5e7da3" stroke-width="2"/>
      <circle cx="44" cy="55" r="14" fill="#5e7da3"/><circle cx="44" cy="55" r="9" fill="#d6e6f7"/><path d="M44 46v6" stroke="#3f5a7a" stroke-width="3"/>
      <rect x="66" y="46" width="8" height="18" rx="3" fill="#3f5a7a"/></g>
      <rect x="14" y="84" width="12" height="5" fill="#3f5a7a"/><rect x="74" y="84" width="12" height="5" fill="#3f5a7a"/></svg>`;
    // HIGH — treasure chest
    const g1 = golden ? '#fff1a8' : '#ffd25a', g2 = golden ? '#ffb300' : '#c9871a';
    return `<svg viewBox="0 0 100 90" class="art-box">
      <defs><linearGradient id="chg${golden ? 'g' : ''}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g1}"/><stop offset="1" stop-color="${g2}"/></linearGradient></defs>
      <rect x="8" y="42" width="84" height="44" rx="5" fill="#7a3f12"/>
      <rect x="8" y="42" width="84" height="44" rx="5" fill="none" stroke="url(#chg${golden ? 'g' : ''})" stroke-width="5"/>
      <rect x="22" y="42" width="7" height="44" fill="url(#chg${golden ? 'g' : ''})"/><rect x="71" y="42" width="7" height="44" fill="url(#chg${golden ? 'g' : ''})"/>
      <g class="lid"><path d="M8 44V32c0-14 18-22 42-22s42 8 42 22v12z" fill="#8f4a16" stroke="url(#chg${golden ? 'g' : ''})" stroke-width="5"/>
      <rect x="22" y="12" width="7" height="32" fill="url(#chg${golden ? 'g' : ''})"/><rect x="71" y="12" width="7" height="32" fill="url(#chg${golden ? 'g' : ''})"/></g>
      <rect x="42" y="38" width="16" height="18" rx="3" fill="url(#chg${golden ? 'g' : ''})" stroke="#7a3f12" stroke-width="2"/><circle cx="50" cy="46" r="3" fill="#7a3f12"/></svg>`;
  }

  const parachute = (color = '#ff4fa3') => `<svg viewBox="0 0 100 70" class="art-chute">
    <path d="M6 34C10 12 30 2 50 2s40 10 44 32c-6-5-12-5-18 0-6-5-14-5-20 0-6-5-14-5-20 0-6-5-14-5-20 0z" fill="${color}"/>
    <path d="M30 34C32 16 40 6 50 2c10 4 18 14 20 32" fill="#fff" opacity=".35"/>
    <path d="M8 34l40 34M30 34l18 34M70 34L52 68M92 34L52 68" stroke="#ddd" stroke-width="1.2"/></svg>`;

  /* Open loot crate whose coin pile grows with the player's unsecured cash (level 0-4). */
  const SKINS = {
    wood: { body: '#b8733f', edge: '#6b3a17', line: '#8a4f26', inner: '#5a3416', band: '#8a96ab' },
    neon: { body: '#2a1d4a', edge: '#ff4fa3', line: '#3ef3ff', inner: '#120a2a', band: '#3ef3ff' },
    gold: { body: '#ffc94a', edge: '#a8740a', line: '#e0a31a', inner: '#7a4f08', band: '#fff1a8' },
    diamond: { body: '#9fe8ff', edge: '#2a7fa8', line: '#d8f7ff', inner: '#1d5a7a', band: '#ffffff' },
  };

  function lootCrate(level, skin = 'wood') {
    const k = SKINS[skin] || SKINS.wood;
    const peaks = [46, 38, 28, 16, 6];
    const pk = peaks[Math.max(0, Math.min(4, level))];
    let pile = '';
    if (level > 0) {
      pile += `<path d="M12 46 Q50 ${pk - 6} 88 46 Z" fill="url(#lcg)"/>`;
      const coins = [[30, 44], [50, 44], [70, 44], [40, 40], [60, 40], [50, 34], [35, 34], [65, 34], [50, 26], [42, 20], [58, 20], [50, 12]];
      coins.forEach(([x, y]) => { if (y >= pk + 2) pile += `<ellipse cx="${x}" cy="${y}" rx="7" ry="3.2" fill="#ffd25a" stroke="#b86b00" stroke-width="1.2"/>`; });
    }
    if (level >= 4) {
      pile += `<rect x="18" y="8" width="26" height="12" rx="2" fill="#5fd38a" stroke="#1b7a43" stroke-width="1.5" transform="rotate(-24 31 14)"/>
        <rect x="58" y="6" width="26" height="12" rx="2" fill="#5fd38a" stroke="#1b7a43" stroke-width="1.5" transform="rotate(20 71 12)"/>
        <path d="M84 6l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" class="spark"/><path d="M14 18l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#fff" class="spark"/>`;
    }
    return `<svg viewBox="0 0 100 84" class="art-loot">
      <defs><linearGradient id="lcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1a8"/><stop offset="1" stop-color="#e09a1a"/></linearGradient></defs>
      <path d="M10 46L16 26h68l6 20z" fill="${k.inner}"/>
      ${pile}
      <rect x="6" y="44" width="88" height="38" rx="5" fill="${k.body}" stroke="${k.edge}" stroke-width="4"/>
      <path d="M8 57h84M8 69h84" stroke="${k.line}" stroke-width="2"/>
      ${skin === 'diamond' ? '<path d="M22 50l10 0-14 26h-8zM60 50h6l-14 26h-6z" fill="#fff" opacity=".55"/>' : ''}
      <rect x="6" y="44" width="10" height="38" rx="3" fill="${k.band}"/><rect x="84" y="44" width="10" height="38" rx="3" fill="${k.band}"/>
      <circle cx="11" cy="50" r="1.6" fill="#444"/><circle cx="11" cy="76" r="1.6" fill="#444"/><circle cx="89" cy="50" r="1.6" fill="#444"/><circle cx="89" cy="76" r="1.6" fill="#444"/>
    </svg>`;
  }
  const lootLevel = (amt) => (amt <= 0 ? 0 : amt < 6000 ? 1 : amt < 15000 ? 2 : amt < 35000 ? 3 : 4);

  /* Personal bank safe (secured cash). */
  const bank = () => `<svg viewBox="0 0 64 60" class="art-bank">
      <rect x="4" y="4" width="56" height="50" rx="8" fill="#6f84a6" stroke="#38496a" stroke-width="3"/>
      <rect x="10" y="10" width="44" height="38" rx="5" fill="#8fa5c7" stroke="#4d6488" stroke-width="2"/>
      <circle cx="30" cy="29" r="11" fill="#4d6488"/><circle cx="30" cy="29" r="7" fill="#e3ecf7"/>
      <path d="M30 22v5M23 29h5M37 29h-5" stroke="#38496a" stroke-width="2"/>
      <rect x="45" y="22" width="5" height="14" rx="2" fill="#ffc94a"/>
      <rect x="9" y="54" width="10" height="4" fill="#38496a"/><rect x="45" y="54" width="10" height="4" fill="#38496a"/>
    </svg>`;

  const coin = () => `<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#ffc94a" stroke="#b86b00" stroke-width="2"/><text x="10" y="14.5" font-size="11" font-weight="900" text-anchor="middle" fill="#8a4b00">₹</text></svg>`;

  return { avatar, crate, parachute, coin, lootCrate, lootLevel, bank, colorOf, COLORS, HUMAN_IDS, CHARS, SKINS };
})();
