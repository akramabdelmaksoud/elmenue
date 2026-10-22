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

const App = {
  slug: (location.pathname.match(/^\/r\/([^/]+)/) || [])[1] || null, authRole: null,
  config: null, ws: null, lang: null, mode: null, handlers: {},
  tr(k) { return (DICT[App.lang] && DICT[App.lang][k]) || DICT.en[k] || k; },
  nm(o) { return App.lang === 'ar' && o.name_ar ? o.name_ar : o.name; },
  money(n) { return Number(n || 0).toLocaleString(App.lang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + (App.config ? App.config.settings.currency : ''); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  ago(ts) { const m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? 'now' : m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; },
  ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } },

  applyTheme() {
    const s = (App.config && App.config.settings) || { theme: 'dark', lang: 'en', presets: { dark: { accent: '#e8a64a', accent2: '#ff5d8f', bg: '#14110f', card: '#1f1b18', text: '#f4ede4' } } };
    App.lang = App.ls('lang') || s.lang || 'en';
    const mode = App.ls('mode') || 'auto';
    const base = s.theme === 'custom' ? s.palette : (s.presets[s.theme] || s.presets.dark);
    let p = { ...base };
    if (mode === 'dark') p = { ...p, bg: '#14110f', card: '#1f1b18', text: '#f4ede4' };
    if (mode === 'light') p = { ...p, bg: '#f7f3ee', card: '#ffffff', text: '#1c1612' };
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
    const dark = lum(p.bg) < 0.5;
    const r = document.documentElement;
    const set = (k, v) => r.style.setProperty(k, v);
    set('--accent', p.accent); set('--accent2', p.accent2); set('--bg', p.bg); set('--card', p.card); set('--text', p.text);
    set('--muted', dark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.5)');
    set('--line', dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)');
    set('--card2', dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)');
    set('--on-accent', lum(p.accent) > 0.6 ? '#111' : '#fff');
    r.dataset.dark = dark ? '1' : '0';
    r.lang = App.lang; r.dir = App.lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i]').forEach((el) => (el.textContent = App.tr(el.dataset.i)));
  },
  toggleMode() { App.ls('mode', document.documentElement.dataset.dark === '1' ? 'light' : 'dark'); App.applyTheme(); App.handlers.render && App.handlers.render(); },
  toggleLang() { App.ls('lang', App.lang === 'ar' ? 'en' : 'ar'); App.applyTheme(); App.handlers.render && App.handlers.render(); },

  tok(role) { return App.ls(`tok:${App.slug || '_'}:${role || App.authRole}`); },
  logout() { App.ls(`tok:${App.slug || '_'}:${App.authRole}`, ''); location.reload(); },
  // Login overlay for admin (email+password) or captain (PIN). Calls go() once authenticated.
  async gate(role, go) {
    App.authRole = role;
    const t = App.tok(role);
    if (t) { const r = await fetch(`/api/r/${App.slug}/me?role=${role}`); if (r.ok) return go(); if (r.status === 404 || r.status === 403) { document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif">This restaurant is unavailable.</div>'; return; } }
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;background:var(--bg);display:grid;place-items:center;z-index:2000;padding:20px';
    d.innerHTML = `<form class="card" style="width:min(380px,100%);animation:pop .3s"><h2 style="margin-top:0">${role === 'admin' ? '🔐 Admin sign-in' : '🧑‍✈️ Captain sign-in'}</h2><p class="muted" style="margin-top:-6px">${App.slug}</p>
      ${role === 'admin' ? '<input name="email" type="email" placeholder="Email" autocomplete="username" required><br><br><input name="password" type="password" placeholder="Password" autocomplete="current-password" required>' : '<input name="pin" inputmode="numeric" placeholder="Captain PIN" autocomplete="off" required style="font-size:24px;text-align:center;letter-spacing:8px">'}
      <p id="gerr" style="color:var(--bad);min-height:20px;margin:8px 0"></p><button class="primary" style="width:100%">Sign in</button></form>`;
    document.body.appendChild(d);
    d.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target)); body.role = role;
      const r = await fetch(`/api/r/${App.slug}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) return (d.querySelector('#gerr').textContent = j.error || 'Failed');
      App.ls(`tok:${App.slug}:${role}`, j.token); d.remove(); go();
    };
  },
  connect(joinMsg, handlers) {
    App.handlers = handlers;
    joinMsg = { ...joinMsg, slug: App.slug }; if (joinMsg.role !== 'customer') joinMsg.token = App.tok(joinMsg.role);
    const open = () => {
      const ws = (App.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'));
      ws.onopen = () => { ws.send(JSON.stringify(joinMsg)); document.body.classList.remove('offline'); };
      ws.onclose = () => { document.body.classList.add('offline'); setTimeout(open, 1500); };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'state') { App.state = m; App.config = m.config; App.applyTheme(); handlers.render && handlers.render(m); }
        else if (m.t === 'error' && m.msg === 'auth') { App.ls(`tok:${App.slug}:${App.authRole}`, ''); location.reload(); }
        else if (handlers[m.t]) handlers[m.t](m);
      };
    };
    open();
  },
  send(o) { App.ws && App.ws.readyState === 1 && App.ws.send(JSON.stringify(o)); },
  toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
  },
};

// Route relative /api/... calls to this restaurant and attach the auth token
(() => {
  const f = window.fetch.bind(window);
  window.fetch = (u, o = {}) => {
    if (typeof u === 'string' && u.startsWith('/api/')) {
      if (App.slug && !/^\/api\/(r|super|public)\//.test(u)) u = '/api/r/' + App.slug + u.slice(4);
      const tk = App.tok(); if (tk) o = { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + tk } };
    }
    return f(u, o);
  };
})();
