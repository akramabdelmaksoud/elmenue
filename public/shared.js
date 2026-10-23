// Shared client runtime: websocket, theme engine, i18n, helpers
const DICT = {
  en: {
    menu: 'Menu', cart: 'Cart', bill: 'Bill', service: 'Service', tax: 'Tax', tip: 'Tip', total: 'Total', subtotal: 'Subtotal',
    add: 'Add', youPayAll: 'You are paying for the whole table', paysAll: 'is paying for the whole table', nothingToPay: 'You have nothing to pay.', sendAll: "Also send everyone's items", send: 'Send to kitchen', myItems: 'My items', tableOrder: 'Table order', welcome: 'Welcome', pickName: 'Your name',
    pickAvatar: 'Choose an avatar', join: 'Join table', table: 'Table', yourCart: 'Your cart (not sent yet)', empty: 'Nothing here yet',
    payMine: 'Pay for myself', payTable: 'Pay for entire table', payCustom: 'Custom split', cash: 'Cash', card: 'Card',
    reqBill: 'Request check', callWaiter: 'Call waiter', water: 'Water / napkins', urgent: 'Speed up order', note: 'Note (optional)',
    sent: 'Sent', received: 'Received', kitchen: 'In kitchen', served: 'Served', closed: 'Closed', who: 'Who', youLabel: 'You',
    checkSent: 'Check requested — the captain is on the way', cancel: 'Cancel', share: 'Share', perPerson: 'Per person',
    orders: 'Orders', requests: 'Requests', floor: 'Floor map', empty_: 'Empty', seated: 'Browsing', ordered: 'Ordered', urgent_: 'Urgent', check: 'Check',
    sessionEnded: 'This session has ended. Rescan the QR code to start again.', requestSent: 'Request sent!', yourShare: 'Your share', sessionTotal: 'Table total',
    total_due: 'Amount to pay', percent: '%', assign: 'Amount per guest', addToCart: 'Added to cart', orderSent: 'Order sent to the kitchen',
  },
  ar: {
    menu: 'القائمة', cart: 'السلة', bill: 'الحساب', service: 'الخدمة', tax: 'الضريبة', tip: 'البقشيش', total: 'الإجمالي', subtotal: 'المجموع',
    add: 'أضف', youPayAll: 'أنت تدفع حساب الطاولة كلها', paysAll: 'يدفع حساب الطاولة كلها', nothingToPay: 'لا يوجد مبلغ عليك.', sendAll: 'أرسل طلبات الجميع أيضًا', send: 'إرسال للمطبخ', myItems: 'طلباتي', tableOrder: 'طلب الطاولة', welcome: 'أهلاً بك', pickName: 'اسمك',
    pickAvatar: 'اختر صورة رمزية', join: 'انضم للطاولة', table: 'طاولة', yourCart: 'سلتك (لم تُرسل بعد)', empty: 'لا شيء هنا بعد',
    payMine: 'أدفع حسابي فقط', payTable: 'أدفع للطاولة كلها', payCustom: 'تقسيم مخصص', cash: 'نقدًا', card: 'بطاقة',
    reqBill: 'اطلب الحساب', callWaiter: 'نداء الكابتن', water: 'مياه / مناديل', urgent: 'استعجال الطلب', note: 'ملاحظة (اختياري)',
    sent: 'تم الإرسال', received: 'تم الاستلام', kitchen: 'في المطبخ', served: 'تم التقديم', closed: 'مغلق', who: 'من', youLabel: 'أنت',
    checkSent: 'تم طلب الحساب — الكابتن في الطريق', cancel: 'إلغاء', share: 'مشاركة', perPerson: 'لكل شخص',
    orders: 'الطلبات', requests: 'الطلبات الخاصة', floor: 'خريطة الصالة', empty_: 'فارغة', seated: 'يتصفح', ordered: 'طلب مُرسل', urgent_: 'عاجل', check: 'حساب',
    sessionEnded: 'انتهت الجلسة. امسح الرمز مرة أخرى للبدء.', requestSent: 'تم إرسال الطلب!', yourShare: 'حصتك', sessionTotal: 'إجمالي الطاولة',
    total_due: 'المبلغ المطلوب', percent: '%', assign: 'المبلغ لكل ضيف', addToCart: 'تمت الإضافة للسلة', orderSent: 'تم إرسال الطلب للمطبخ',
  },
};

Object.assign(DICT.en, {
  home: 'Home', order: 'Order', tableTab: 'Table', profile: 'Profile', dayItem: 'Dish of the day', viewDetails: 'Add to table', quickAct: 'Quick actions', popular: 'Popular picks', atTable: 'At your table', featured: 'Featured', orderNow: 'Order now', seeAll: 'See all', search: 'Search the menu…',
  menuTitle: 'Our menu', menuSub: 'Fresh, made to order. Share the table, split the bill.', hello: 'Hello', changeName: 'Change name', leave: 'Edit profile', theme: 'Appearance', language: 'Language', light: 'Light', dark: 'Dark', save: 'Save', tableFor: 'Table', callQ: 'Call waiter', billQ: 'Request check', statusReceived: 'Received', statusKitchen: 'Preparing', statusServed: 'Served', nothingFound: 'Nothing found', tagline: 'Brew Happy, Live Bold', taglineSub: 'Good food. Great people. Better every day.', guests: 'guests', yourOrder: 'Your picks', cartEmpty: 'Your cart is empty - pick something tasty!', tapToAdd: 'Tap + to add to the table', sendFor: 'Send my picks',
});
Object.assign(DICT.ar, {
  home: 'الرئيسية', order: 'اطلب', tableTab: 'الطاولة', profile: 'حسابي', dayItem: 'طبق اليوم', viewDetails: 'أضف للطاولة', quickAct: 'إجراءات سريعة', popular: 'الأكثر طلبًا', atTable: 'على طاولتك', featured: 'مميز', orderNow: 'اطلب الآن', seeAll: 'عرض الكل', search: 'ابحث في القائمة…',
  menuTitle: 'قائمتنا', menuSub: 'طازج ويُحضَّر عند الطلب. شاركوا الطاولة وقسّموا الحساب.', hello: 'مرحبًا', changeName: 'تغيير الاسم', leave: 'عدّل حسابك', theme: 'المظهر', language: 'اللغة', light: 'فاتح', dark: 'داكن', save: 'حفظ', tableFor: 'طاولة', callQ: 'نداء الكابتن', billQ: 'اطلب الحساب', statusReceived: 'تم الاستلام', statusKitchen: 'قيد التحضير', statusServed: 'تم التقديم', nothingFound: 'لا توجد نتائج', tagline: 'اشرب بسعادة، عش بجرأة', taglineSub: 'طعام لذيذ. أجواء رائعة. وأفضل كل يوم.', guests: 'ضيوف', yourOrder: 'اختياراتك', cartEmpty: 'سلتك فارغة - اختر شيئًا لذيذًا!', tapToAdd: 'اضغط + للإضافة إلى الطاولة', sendFor: 'أرسل اختياراتي',
});

const App = {
  slug: (location.pathname.match(/^\/r\/([^/]+)/) || [])[1] || null, authRole: null,
  config: null, ws: null, lang: null, mode: null, handlers: {},
  tr(k) { return (DICT[App.lang] && DICT[App.lang][k]) || DICT.en[k] || k; },
  nm(o) { return App.lang === 'ar' && o.name_ar ? o.name_ar : o.name; },
  money(n) { return Number(n || 0).toLocaleString(App.lang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + (App.config ? App.config.settings.currency : ''); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  ago(ts) { const m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? 'now' : m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; },
  ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } },

  // ---- floor plan helpers (24 x 16 grid; old layouts without fx/fy are converted on the fly)
  tpos(t) { if (t.fx !== undefined) return { fx: t.fx, fy: t.fy, fw: t.fw || 4, fh: t.fh || 4 }; const lg = t.shape === 'long'; return { fx: ((t.x || 1) - 1) * 2 + 0.5, fy: ((t.y || 1) - 1) * 2 + 0.5, fw: lg ? 5 : 3, fh: lg ? 2.5 : 3 }; },
  floor() { const f = (App.config && App.config.settings && App.config.settings.floor) || {}; return { cols: f.cols || 24, rows: f.rows || 16, decor: f.decor || [] }; },
  chairs(shape, seats) {
    const n = Math.max(0, Math.min(seats || 0, 12)); let out = '';
    if (shape === 'round') for (let i = 0; i < n; i++) { const a = (2 * Math.PI * i) / n - Math.PI / 2; out += `<i class="chair" style="left:${(50 + 60 * Math.cos(a)).toFixed(1)}%;top:${(50 + 60 * Math.sin(a)).toFixed(1)}%"></i>`; }
    else { const top = Math.ceil(n / 2), bot = n - top; for (let j = 0; j < top; j++) out += `<i class="chair" style="left:${(((j + 1) / (top + 1)) * 100).toFixed(1)}%;top:-8%"></i>`; for (let j = 0; j < bot; j++) out += `<i class="chair" style="left:${(((j + 1) / (bot + 1)) * 100).toFixed(1)}%;top:108%"></i>`; }
    return out;
  },
  decorIcon: { bar: '🍸', kitchen: '🍳', wall: '', plant: '🪴', door: '🚪' },
  decorHTML(d, F, extra = '') { return `<div class="fl-d ${d.type} ${extra}" data-id="${d.id}" style="left:${d.fx / F.cols * 100}%;top:${d.fy / F.rows * 100}%;width:${d.fw / F.cols * 100}%;height:${d.fh / F.rows * 100}%;--m:${Math.min(d.fw, d.fh)}"><div>${App.decorIcon[d.type] || ''}${d.label ? `<small>${App.esc(d.label)}</small>` : ''}</div></div>`; },
  PRESETS: {
    bloom: { light: { bg: '#f2ebe0', card: '#fbf8f2', text: '#2a2b25', accent: '#1f4a35', accent2: '#b98a3e' }, dark: { bg: '#0f1813', card: '#17251d', text: '#f0e9db', accent: '#4f9a6e', accent2: '#e0bb73' } },
    espresso: { light: { bg: '#f4ece4', card: '#fffaf5', text: '#2b1d14', accent: '#6b3f23', accent2: '#d08a3c' }, dark: { bg: '#14110f', card: '#1f1b18', text: '#f4ede4', accent: '#e8a64a', accent2: '#ff7b54' } },
    pink: { light: { bg: '#fff0f6', card: '#ffffff', text: '#3a1428', accent: '#e0357f', accent2: '#8e4bff' }, dark: { bg: '#1a0f16', card: '#26151f', text: '#fbe9f1', accent: '#ff5d9e', accent2: '#b98aff' } },
    white: { light: { bg: '#fafafa', card: '#ffffff', text: '#111111', accent: '#111111', accent2: '#6b7280' }, dark: { bg: '#0c0c0d', card: '#161618', text: '#f5f5f5', accent: '#f5f5f5', accent2: '#9ca3af' } },
  },
  isDark() { return document.documentElement.dataset.dark === '1'; },
  applyTheme() {
    const s = (App.config && App.config.settings) || { theme: 'bloom', lang: 'en' };
    App.lang = App.ls('lang') || s.lang || 'en';
    let mode = App.ls('mode');
    if (mode !== 'light' && mode !== 'dark') mode = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const name = s.theme === 'dark' ? 'espresso' : s.theme;
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
    let p;
    if (name === 'custom' && s.palette) {
      const b = App.PRESETS.bloom[mode], c = s.palette;
      p = (mode === 'dark') === (lum(c.bg) < 0.5) ? { ...c } : { ...b, accent: c.accent, accent2: c.accent2 };
    } else p = { ...(App.PRESETS[name] || App.PRESETS.bloom)[mode] };
    const dark = mode === 'dark';
    const r = document.documentElement, set = (k, v) => r.style.setProperty(k, v);
    set('--accent', p.accent); set('--accent2', p.accent2); set('--bg', p.bg); set('--card', p.card); set('--text', p.text);
    set('--muted', dark ? 'rgba(255,255,255,.58)' : 'rgba(0,0,0,.52)');
    set('--line', dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.09)');
    set('--card2', dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.045)');
    set('--on-accent', lum(p.accent) > 0.6 ? '#111' : '#fff');
    set('--shadow', dark ? '0 14px 40px -14px rgba(0,0,0,.7)' : '0 14px 40px -16px rgba(60,45,20,.35)');
    r.dataset.dark = dark ? '1' : '0';
    r.lang = App.lang; r.dir = App.lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i]').forEach((el) => (el.textContent = App.tr(el.dataset.i)));
  },
  // Theme / language switches use a circular reveal (View Transitions API) when available
  transition(apply, ev) {
    ev = ev || window.event;
    const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduced) return apply();
    const x = ev && ev.clientX != null ? ev.clientX : innerWidth / 2, y = ev && ev.clientY != null ? ev.clientY : 0;
    const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const t = document.startViewTransition(apply);
    t.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] }, { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
  },
  toggleMode(ev) { App.transition(() => { App.ls('mode', App.isDark() ? 'light' : 'dark'); App.applyTheme(); App.handlers.render && App.handlers.render(); }, ev); },
  toggleLang(ev) { App.transition(() => { App.ls('lang', App.lang === 'ar' ? 'en' : 'ar'); App.applyTheme(); App.handlers.render && App.handlers.render(); }, ev); },

  tok(role) { return App.ls(`tok:${App.slug || '_'}:${role || App.authRole}`); },
  logout() { App.ls(`tok:${App.slug || '_'}:${App.authRole}`, ''); location.reload(); },
  loadAuth() {
    if (window.Auth) return Promise.resolve();
    return new Promise((res) => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/auth.css'; document.head.appendChild(l);
      const sc = document.createElement('script'); sc.src = '/auth.js'; sc.onload = res; sc.onerror = res; document.head.appendChild(sc);
    });
  },
  // Luxury sign-in for admin (email + password) or captain (PIN). Calls go() once authenticated.
  async gate(role, go) {
    App.authRole = role;
    const t = App.tok(role);
    if (t) { const r = await fetch(`/api/r/${App.slug}/me?role=${role}`); if (r.ok) return go(); if (r.status === 404 || r.status === 403) { document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif">This restaurant is unavailable.</div>'; return; } }
    await App.loadAuth();
    let cfg = null;
    try { const r = await fetch(`/api/r/${App.slug}/config`); if (r.ok) { cfg = await r.json(); App.config = cfg; } } catch {}
    App.applyTheme();
    await Auth.show({
      kind: role === 'admin' ? 'admin' : 'pin',
      brand: cfg && cfg.settings,
      async submit(values) {
        const body = { ...values, role };
        const r = await fetch(`/api/r/${App.slug}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Failed');
        App.ls(`tok:${App.slug}:${role}`, j.token);
      },
    });
    go();
  },
  connect(joinMsg, handlers) {
    App.handlers = handlers;
    joinMsg = { ...joinMsg, slug: App.slug }; if (joinMsg.role !== 'customer') joinMsg.token = App.tok(joinMsg.role);
    const onMsg = (m) => {
      if (m.t === 'state') { App.state = m; App.config = m.config; App.applyTheme(); handlers.render && handlers.render(m); }
      else if (m.t === 'error' && m.msg === 'auth') { App.ls(`tok:${App.slug}:${App.authRole}`, ''); location.reload(); }
      else if (handlers[m.t]) handlers[m.t](m);
    };
    // Prefer websockets; if the host cannot do them (e.g. Vercel) fall back to polling automatically.
    let everOpened = false, fellBack = false;
    const fallback = () => { if (fellBack) return; fellBack = true; App.startPolling(joinMsg, handlers, onMsg); };
    const open = () => {
      if (fellBack) return;
      let ws, guard;
      try { ws = App.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch { return fallback(); }
      guard = setTimeout(() => { if (!everOpened) { try { ws.close(); } catch {} fallback(); } }, 4000);
      ws.onopen = () => { everOpened = true; clearTimeout(guard); ws.send(JSON.stringify(joinMsg)); document.body.classList.remove('offline'); };
      ws.onclose = () => { clearTimeout(guard); if (!everOpened) return fallback(); document.body.classList.add('offline'); setTimeout(open, 1500); };
      ws.onmessage = (e) => onMsg(JSON.parse(e.data));
    };
    open();
  },
  send(o) { if (App.poll) return App.poll.call(o); App.ws && App.ws.readyState === 1 && App.ws.send(JSON.stringify(o)); },
  startPolling(joinMsg, handlers, onMsg) {
    const P = (App.poll = { since: -1, chain: Promise.resolve(), timer: null });
    document.body.classList.remove('offline');
    const every = joinMsg.role === 'captain' ? 2000 : joinMsg.role === 'admin' ? 5000 : 2500;
    P.call = (msg) => (P.chain = P.chain.then(async () => {   // serialised so actions keep their order
      try {
        const r = await fetch(`/api/r/${App.slug}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ join: joinMsg, msg, since: P.since }) });
        if (r.status === 401) return onMsg({ t: 'error', msg: 'auth' });
        const j = await r.json();
        if (!r.ok) { if (r.status === 404 || r.status === 403) onMsg({ t: 'error', msg: j.error }); else document.body.classList.add('offline'); return; }
        document.body.classList.remove('offline');
        if (j.guestId && joinMsg.guestId !== j.guestId) { joinMsg.guestId = j.guestId; onMsg({ t: 'you', guestId: j.guestId }); }
        if (P.since >= 0) j.alerts.forEach((a) => onMsg({ t: 'alert', ...a }));
        P.since = j.alertSeq;
        // Only redraw when something really changed (captain also refreshes once a minute for the 'x min' timers), so idle screens never flicker
        const sig = JSON.stringify(j.state);
        App.state = j.state; App.config = j.state.config;
        if (sig !== P.sig || Date.now() - (P.lastRender || 0) > (joinMsg.role === 'captain' ? 60000 : Infinity)) { P.sig = sig; P.lastRender = Date.now(); onMsg(j.state); }
      } catch { document.body.classList.add('offline'); }
    }));
    const tick = () => { clearTimeout(P.timer); if (!document.hidden) P.call(null); P.timer = setTimeout(tick, every); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    tick();
  },
  toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
  },
};

// Route relative /api/... calls to this restaurant, attach the auth token, and retry write conflicts (409)
(() => {
  const f = window.fetch.bind(window);
  window.fetch = async (u, o = {}) => {
    const api = typeof u === 'string' && u.startsWith('/api/');
    if (api) {
      if (App.slug && !/^\/api\/(r|super|public)\//.test(u)) u = '/api/r/' + App.slug + u.slice(4);
      const tk = App.tok(); if (tk) o = { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + tk } };
    }
    let r = await f(u, o);
    for (let i = 0; api && i < 3 && r.status === 409 && (o.method || 'GET') !== 'GET'; i++) { await new Promise((x) => setTimeout(x, 150 + Math.random() * 300)); r = await f(u, o); }
    return r;
  };
})();
