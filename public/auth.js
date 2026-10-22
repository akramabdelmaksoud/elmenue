// Luxury auth UI: Auth.show({ kind: 'admin'|'pin'|'super', brand, submit }) -> Promise resolved after the success animation
const Auth = (() => {
  const T = {
    en: { welcome: 'Welcome back', admin: 'Owner sign-in', pin: 'Staff access', super: 'Platform control', email: 'Email address', password: 'Password', pinLabel: 'Enter your captain PIN', signin: 'Sign in', enter: 'Unlock', caps: 'Caps Lock is on', secure: 'Encrypted session', ok: 'Welcome', h1a: 'Hospitality,', h1b: 'perfected.', sub: 'The quiet luxury of a floor that runs itself. Every table, every guest, every order - in one calm, living view.', f1: 'Live tables', f2: 'Group ordering', f3: 'Split bills', failed: 'Something went wrong', show: 'Show', hide: 'Hide' },
    ar: { welcome: 'أهلاً بعودتك', admin: 'دخول المالك', pin: 'دخول الطاقم', super: 'لوحة المنصة', email: 'البريد الإلكتروني', password: 'كلمة المرور', pinLabel: 'أدخل رمز الكابتن', signin: 'تسجيل الدخول', enter: 'فتح', caps: 'زر Caps Lock مفعّل', secure: 'جلسة مشفّرة', ok: 'أهلاً بك', h1a: 'الضيافة،', h1b: 'في أبهى صورها.', sub: 'رفاهية هادئة لصالة تُدار بنفسها. كل طاولة وكل ضيف وكل طلب في شاشة واحدة حيّة.', f1: 'طاولات حيّة', f2: 'طلب جماعي', f3: 'تقسيم الحساب', failed: 'حدث خطأ ما', show: 'إظهار', hide: 'إخفاء' },
  };
  const t = (k) => (T[App.lang] || T.en)[k] || T.en[k] || k;
  const I = {
    mail: '<path d="M3 6h18v12H3z"/><path d="M3 7l9 7 9-7"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6C3.6 9.4 2 12 2 12s4 7 10 7c1.4 0 2.7-.3 3.9-.8"/>',
    leaf: '<path d="M12 21V11"/><path d="M12 11C12 6 8 4 4 4c0 5 3 8 8 7z"/><path d="M12 14c0-4 3-6 8-6 0 4-3 7-8 6z"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>', check: '<path d="M5 13l4 4 10-10"/>', del: '<path d="M21 5H9l-6 7 6 7h12z"/><path d="M13 9l4 6M17 9l-4 6"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5 12v8h14v-8"/>', coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6v2M12 16v2"/>', key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  };
  const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;
  const rnd = (a, b) => a + Math.random() * (b - a);
  let cur = null;

  function scene() {
    const el = document.createElement('div'); el.className = 'auth-scene';
    el.innerHTML = `<div class="aurora"><i></i><i></i><i></i></div><div class="grain"></div>
      <div class="dust">${Array.from({ length: 28 }, () => `<b style="--x:${rnd(0, 100).toFixed(1)}%;--s:${rnd(3, 9).toFixed(1)}px;--d:${rnd(9, 20).toFixed(1)}s;--dl:${(-rnd(0, 20)).toFixed(1)}s;--dx:${rnd(-60, 60).toFixed(0)}px"></b>`).join('')}</div>
      <div class="auth-top"><button class="ib" id="a-lang" aria-label="language"></button><button class="ib" id="a-mode" aria-label="theme"><span class="ico sun">${ic('sun')}</span><span class="ico moon">${ic('moon')}</span></button></div><div class="auth-shell"></div>`;
    el.querySelector('#a-lang').onclick = (e) => App.toggleLang(e);
    el.querySelector('#a-mode').onclick = (e) => App.toggleMode(e);
    // pointer parallax + glow on the card
    el.addEventListener('pointermove', (e) => {
      const c = el.querySelector('.auth-card'); if (!c) return; const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (e.pointerType === 'mouse') { c.style.setProperty('--ry', ((x - .5) * 7).toFixed(2) + 'deg'); c.style.setProperty('--rx', ((.5 - y) * 6).toFixed(2) + 'deg'); }
      c.style.setProperty('--px', (x * 100) + '%'); c.style.setProperty('--py', (y * 100) + '%');
    });
    el.addEventListener('pointerleave', () => { const c = el.querySelector('.auth-card'); if (c) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); } });
    document.body.appendChild(el);
    refreshTop(el);
    return el;
  }
  function refreshTop(el) { const l = el.querySelector('#a-lang'); if (l) l.textContent = App.lang === 'ar' ? 'EN' : 'ع'; }
  const emblem = () => `<div class="emblem"><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47"/></svg><svg class="leaf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${I.leaf}</svg></div>`;
  const hero = () => `<div class="auth-hero"><div class="kick">${'ELMENU'}</div><h1><span class="foil">${t('h1a')}</span><span>${t('h1b')}</span></h1><p>${t('sub')}</p>
    <div class="minifloor">${Array.from({ length: 10 }, (_, i) => `<i style="--dl:${(-i * 0.9).toFixed(1)}s"></i>`).join('')}</div>
    <div class="feats"><div><b class="foil">24/7</b>${t('f1')}</div><div><b class="foil">∞</b>${t('f2')}</div><div><b class="foil">1-tap</b>${t('f3')}</div></div></div>`;
  function ripple(btn, e) { const r = btn.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2, i = document.createElement('span'); i.className = 'ripple'; i.style.cssText = `width:${s}px;height:${s}px;left:${(e.clientX || r.left + r.width / 2) - r.left - s / 2}px;top:${(e.clientY || r.top + r.height / 2) - r.top - s / 2}px`; btn.appendChild(i); setTimeout(() => i.remove(), 700); }
  function success(el, text) {
    el.insertAdjacentHTML('beforeend', `<div class="auth-ok"><div class="c"><svg viewBox="0 0 140 140"><circle cx="70" cy="70" r="54"/><path d="M44 72l18 18 36-38"/></svg></div><h3 class="foil">${text}</h3></div>`);
    requestAnimationFrame(() => el.classList.add('done'));
    return new Promise((res) => setTimeout(() => { el.classList.add('leave'); setTimeout(() => { el.remove(); res(); }, 750); }, 1900));
  }
  function fail(el, msg) { const c = el.querySelector('.auth-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); const h = el.querySelector('.hint'); if (h) { h.textContent = msg; h.classList.add('err'); } }

  function show(opts) {
    return new Promise((resolve) => {
      const kind = opts.kind, el = scene(); let pin = '', busy = false;
      const brand = opts.brand || {}, brandName = (App.lang === 'ar' && brand.name_ar ? brand.name_ar : brand.name) || '';
      const keyHandler = (e) => { if (kind !== 'pin') return; if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter') press('go'); };
      async function go(values) {
        if (busy) return; busy = true;
        const btn = el.querySelector('.gold-btn'); if (btn) btn.classList.add('load');
        try { await opts.submit(values); document.removeEventListener('keydown', keyHandler); await success(el, t('ok')); resolve(); }
        catch (e) { busy = false; if (btn) btn.classList.remove('load'); fail(el, e.message || t('failed')); pin = ''; if (kind === 'pin') dots(); }
      }
      function dots() { const d = el.querySelector('.pin-dots'); if (d) d.innerHTML = Array.from({ length: Math.max(4, pin.length) }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); }
      function press(k) {
        if (busy) return;
        const h = el.querySelector('.hint'); if (h) { h.textContent = ''; h.classList.remove('err'); }
        if (k === 'del') pin = pin.slice(0, -1); else if (k === 'go') { if (pin.length >= 4) return go({ pin }); } else if (pin.length < 8) pin += k;
        dots();
        const b = el.querySelector(`.pad [data-k="${k}"]`); if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 130); }
      }
      function render() {
        refreshTop(el);
        const shell = el.querySelector('.auth-shell');
        const title = kind === 'admin' ? t('admin') : kind === 'pin' ? t('pin') : t('super');
        let body;
        if (kind === 'pin') {
          body = `<p class="kick rz" style="--i:0;margin-bottom:12px">${t('pinLabel')}</p><div class="pin-dots rz" style="--i:1"></div>
          <div class="pad rz" style="--i:2">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => `<button type="button" data-k="${n}" style="--i:${i}">${n}</button>`).join('')}<button type="button" class="del" data-k="del" style="--i:9">${ic('del')}</button><button type="button" data-k="0" style="--i:10">0</button><button type="button" class="go" data-k="go" style="--i:11">${ic('check')}</button></div><div class="hint" style="text-align:center;margin-top:14px"></div>`;
        } else {
          body = `<form id="af" autocomplete="on">
            <div class="fld rz" style="--i:0">${ic('mail')}<input name="email" type="email" placeholder=" " autocomplete="username" required><label>${t('email')}</label></div>
            <div class="fld rz" style="--i:1">${ic('lock')}<input name="password" type="password" placeholder=" " autocomplete="current-password" required><label>${t('password')}</label><button type="button" class="eye" tabindex="-1" aria-label="${t('show')}">${ic('eye')}</button></div>
            <div class="hint rz" style="--i:2"></div>
            <button class="gold-btn rz" style="--i:3"><span>${t('signin')}</span>${ic('arrow')}</button></form>`;
        }
        shell.innerHTML = `${hero()}<div class="auth-card"><div class="rz" style="--i:-3">${emblem()}</div><div class="kick rz" style="--i:-2">${t('welcome')}</div><h2 class="rz" style="--i:-1"><span class="foil">${title}</span></h2><div class="brand rz" style="--i:0">${App.esc(brandName)}</div>${body}<div class="secure rz" style="--i:5">${ic('shield')} ${t('secure')}</div></div>`;
        if (kind === 'pin') {
          dots();
          shell.querySelectorAll('.pad button').forEach((b) => (b.onpointerdown = (e) => ripple(b, e)));
          shell.querySelectorAll('.pad button').forEach((b) => (b.onclick = () => press(b.dataset.k)));
        } else {
          const f = shell.querySelector('#af'), pw = f.querySelector('[name=password]');
          f.onsubmit = (e) => { e.preventDefault(); go(Object.fromEntries(new FormData(f))); };
          shell.querySelector('.eye').onclick = (e) => { const s = pw.type === 'password'; pw.type = s ? 'text' : 'password'; e.currentTarget.innerHTML = ic(s ? 'eyeoff' : 'eye'); };
          pw.addEventListener('keyup', (e) => { const h = shell.querySelector('.hint'); if (e.getModifierState && e.getModifierState('CapsLock')) h.textContent = t('caps'); else if (h.textContent === t('caps')) h.textContent = ''; });
          const gb = shell.querySelector('.gold-btn'); gb.onpointerdown = (e) => ripple(gb, e);
          setTimeout(() => { const first = f.querySelector('input'); first && first.focus({ preventScroll: true }); }, 900);
        }
      }
      document.addEventListener('keydown', keyHandler);
      App.handlers = { render: () => render() };
      cur = { render };
      render();
    });
  }
  return { show, scene, ic, t, ripple, success, emblem, I, hero };
})();
