/* Vault Rush — animation helpers (Web Animations API). */
const FX = (() => {
  const layer = () => document.getElementById('fx');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const speed = () => (SETTINGS.get('fastAnim') ? 0.6 : 1);
  const NS = 'http://www.w3.org/2000/svg';

  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  function spawn(cls, x, y, html) {
    const d = document.createElement('div');
    d.className = cls;
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    if (html != null) d.innerHTML = html;
    layer().appendChild(d);
    return d;
  }

  /* coins fly in an arc from one element to another */
  function coins(fromEl, toEl, count = 6, { onArrive } = {}) {
    if (!fromEl || !toEl) return wait(0);
    const a = center(fromEl), b = center(toEl);
    const n = Math.max(1, Math.min(10, count));
    let arrived = false;
    const jobs = [];
    for (let i = 0; i < n; i++) {
      const c = spawn('coin', a.x, a.y, ART.coin());
      const jx = (Math.random() - 0.5) * 40, jy = (Math.random() - 0.5) * 30;
      const mx = (a.x + b.x) / 2 + (Math.random() - 0.5) * 80 - a.x;
      const my = Math.min(a.y, b.y) - 60 - Math.random() * 40 - a.y;
      const anim = c.animate([
        { transform: 'translate(0,0) scale(.4)', opacity: 0 },
        { transform: `translate(${jx}px,${jy}px) scale(1.1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${mx}px,${my}px) scale(1)`, offset: 0.55 },
        { transform: `translate(${b.x - a.x}px,${b.y - a.y}px) scale(.6)`, opacity: 0.9 },
      ], { duration: (650 + Math.random() * 150) * speed(), delay: i * 55 * speed(), easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });
      jobs.push(anim.finished.then(() => {
        c.remove();
        if (!arrived) { arrived = true; onArrive && onArrive(); }
        SFX.coin();
      }));
    }
    return Promise.all(jobs);
  }

  function floatText(el, text, cls = 'plus', dy = -50) {
    if (!el) return;
    const p = center(el);
    const f = spawn('float ' + cls, p.x, p.y - 10, text);
    f.animate([
      { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.2 },
      { transform: `translate(-50%, calc(-50% + ${dy}px)) scale(1)`, opacity: 0 },
    ], { duration: 1500, easing: 'ease-out', fill: 'forwards' }).finished.then(() => f.remove());
  }

  function shield(el, dur = 1100) {
    if (!el) return;
    const p = center(el);
    const size = Math.max(p.w, p.h) * 1.25;
    const s = spawn('shield', p.x, p.y);
    s.style.width = s.style.height = size + 'px';
    s.animate([
      { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.08)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 },
    ], { duration: dur, easing: 'ease-out', fill: 'forwards' }).finished.then(() => s.remove());
  }

  function lunge(el, targetEl, bounce = false) {
    if (!el || !targetEl) return wait(0);
    const a = center(el), b = center(targetEl);
    const dx = (b.x - a.x) * 0.55, dy = (b.y - a.y) * 0.55;
    const frames = bounce
      ? [{ transform: 'translate(0,0)' }, { transform: `translate(${dx}px,${dy}px) scale(1.08)`, offset: 0.4 }, { transform: `translate(${-dx * 0.25}px,${-dy * 0.25}px) rotate(-6deg)`, offset: 0.7 }, { transform: 'translate(0,0)' }]
      : [{ transform: 'translate(0,0)' }, { transform: `translate(${dx}px,${dy}px) scale(1.08)`, offset: 0.45 }, { transform: 'translate(0,0)' }];
    el.style.zIndex = 10;
    return el.animate(frames, { duration: 650, easing: 'cubic-bezier(.5,0,.3,1)' }).finished.then(() => (el.style.zIndex = ''));
  }

  function burst(el, color = '#ffc94a', n = 14) {
    if (!el) return;
    const p = center(el);
    for (let i = 0; i < n; i++) {
      const d = spawn('burst', p.x, p.y);
      d.style.background = color;
      d.style.boxShadow = `0 0 8px ${color}`;
      const ang = (Math.PI * 2 * i) / n, dist = 40 + Math.random() * 40;
      d.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px) scale(.2)`, opacity: 0 }],
        { duration: 600 + Math.random() * 200, easing: 'ease-out', fill: 'forwards' }).finished.then(() => d.remove());
    }
  }

  function cls(el, c, ms = 600) {
    if (!el) return;
    el.classList.remove(c);
    void el.offsetWidth;
    el.classList.add(c);
    setTimeout(() => el.classList.remove(c), ms);
  }

  function confetti(n = 80) {
    const colors = ['#ffc94a', '#3ef3ff', '#ff3d6e', '#3dffa2', '#9b5cff', '#fff'];
    for (let i = 0; i < n; i++) {
      const d = spawn('confetti', Math.random() * innerWidth, -20);
      d.style.background = colors[i % colors.length];
      d.animate([
        { transform: `translate(0,0) rotate(0)` },
        { transform: `translate(${(Math.random() - 0.5) * 200}px, ${innerHeight + 60}px) rotate(${Math.random() * 1080}deg)` },
      ], { duration: 2200 + Math.random() * 1800, delay: Math.random() * 900, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' }).finished.then(() => d.remove());
    }
  }

  /* curved beam between two elements (raid lines, aim line) */
  function beamSvg() {
    let svg = layer().querySelector('svg.beams');
    if (!svg) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'beams');
      svg.innerHTML = '<defs></defs>';
      layer().prepend(svg);
    }
    return svg;
  }
  function beam(fromEl, toEl, color, cls = 'beam-line', key = '') {
    if (!fromEl || !toEl) return null;
    const svg = beamSvg();
    const a = center(fromEl), b = center(toEl);
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.18, my = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.12 - 20;
    const id = 'ah' + color.replace(/[^a-z0-9]/gi, '');
    if (!svg.querySelector('#' + id)) {
      svg.querySelector('defs').insertAdjacentHTML('beforeend',
        `<marker id="${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${color}"/></marker>`);
    }
    const path = document.createElementNS(NS, 'path');
    // stop a little short of the target centre so the arrow head is visible
    const ex = b.x - (b.x - mx) * 0.18, ey = b.y - (b.y - my) * 0.18;
    path.setAttribute('d', `M${a.x} ${a.y} Q${mx} ${my} ${ex} ${ey}`);
    path.setAttribute('class', cls);
    path.setAttribute('stroke', color);
    path.setAttribute('marker-end', `url(#${id})`);
    path.style.filter = `drop-shadow(0 0 4px ${color})`;
    if (key) path.dataset.key = key;
    svg.appendChild(path);
    return path;
  }
  function clearBeams(cls) {
    const svg = layer().querySelector('svg.beams');
    if (svg) svg.querySelectorAll(cls ? '.' + cls : 'path').forEach((p) => p.remove());
  }

  function tapLabel(x, y, text) {
    const t = spawn('tap-label', x, y - 8, text);
    t.animate([{ opacity: 0, transform: 'translate(-50%,-80%) scale(.7)' }, { opacity: 1, transform: 'translate(-50%,-110%) scale(1)', offset: 0.2 }, { opacity: 0, transform: 'translate(-50%,-190%)' }],
      { duration: 900, easing: 'ease-out', fill: 'forwards' }).finished.then(() => t.remove());
  }

  /* comic-book burst ("BLOCKED!", "STOLEN!", "KA-CHING!") */
  function comic(el, text, theme = 'gold') {
    if (!el) return;
    const p = center(el);
    const x = Math.max(70, Math.min(innerWidth - 70, p.x));
    const c = spawn('comic ' + theme, x, Math.max(40, p.y - p.h * 0.55 - 6), `<span>${text}</span>`);
    const rot = (Math.random() - 0.5) * 24;
    c.animate([
      { transform: `translate(-50%,-50%) scale(0) rotate(${rot - 30}deg)`, opacity: 0 },
      { transform: `translate(-50%,-50%) scale(1.25) rotate(${rot}deg)`, opacity: 1, offset: 0.15 },
      { transform: `translate(-50%,-50%) scale(1) rotate(${rot}deg)`, opacity: 1, offset: 0.3 },
      { transform: `translate(-50%,-50%) scale(1.05) rotate(${rot}deg)`, opacity: 1, offset: 0.8 },
      { transform: `translate(-50%,-70%) scale(.8) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 1500 * speed(), easing: 'ease-out', fill: 'forwards' }).finished.then(() => c.remove());
  }

  function clear() { layer().innerHTML = ''; }

  return { wait, coins, floatText, shield, lunge, burst, cls, confetti, clear, center, beam, clearBeams, tapLabel, speed, comic };
})();
