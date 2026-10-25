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

// ?demo=1 (remembered for this tab) runs the whole app on in-browser sample data - see demo.js
const DEMO = (() => { if (/^\/r\/live-demo(\/|$)/.test(location.pathname)) return true; try { if (new URLSearchParams(location.search).has('demo')) sessionStorage.setItem('demo', '1'); return sessionStorage.getItem('demo') === '1'; } catch { return false; } })();
const App = {
  demo: DEMO,
  loadDemo() { return (App._dl ||= new Promise((res) => { const s = document.createElement('script'); s.src = '/demo.js'; s.onload = () => App.demoReady().then(res); s.onerror = res; document.head.appendChild(s); })); },
  slug: (location.pathname.match(/^\/r\/([^/]+)/) || [])[1] || null, authRole: null,
  config: null, ws: null, lang: null, mode: null, handlers: {},
  tr(k) { return (DICT[App.lang] && DICT[App.lang][k]) || DICT.en[k] || k; },
  nm(o) { return App.lang === 'ar' && o.name_ar ? o.name_ar : o.name; },
  money(n) { return Number(n || 0).toLocaleString(App.lang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + (App.config ? App.config.settings.currency : ''); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  // 80mm thermal-style receipt; r = {label, kind, customer, at, items[{name,qty,price}], gross, discount, discountNote, service, tax, tip, total, method, pay, by}
  receiptHTML(r) {
    const st = (App.config && App.config.settings) || {}, E = App.esc, M = (n) => Number(n || 0).toFixed(2);
    const rows = r.items.map((l) => `<tr><td colspan="2"><b>${E(l.name)}</b></td></tr><tr><td>${l.qty} x ${M(l.price)}</td><td class="r">${M(l.qty * l.price)}</td></tr>`).join('');
    const ln = (a, b) => `<tr><td>${a}</td><td class="r">${b}</td></tr>`;
    const pay = r.pay || {};
    return `<!doctype html><meta charset="utf-8"><title>Receipt</title><style>@page{size:80mm auto;margin:4mm}body{font:12px/1.35 monospace;width:72mm;margin:0;color:#000}table{width:100%;border-collapse:collapse}.r{text-align:right}hr{border:0;border-top:1px dashed #000;margin:6px 0}.c{text-align:center}.big td{font-size:15px;font-weight:bold}</style>
    <div class="c"><b style="font-size:16px">${E(st.name || '')}</b>${st.address ? '<br>' + E(st.address) : ''}${st.phone ? '<br>' + E(st.phone) : ''}${st.taxId ? '<br>Tax ID: ' + E(st.taxId) : ''}<br>${new Date(r.at || Date.now()).toLocaleString()}<br>${r.kind && r.kind !== 'table' ? E(r.kind) + ' ' : 'Table '}${E(r.label)}${r.by ? ' · ' + E(r.by) : ''}</div>
    ${r.customer && (r.customer.name || r.customer.phone || r.customer.address) ? `<div>${E(r.customer.name || '')} ${E(r.customer.phone || '')}<br>${E(r.customer.address || '')}</div>` : ''}<hr><table>${rows}</table><hr><table>
    ${ln('Subtotal', M(r.gross))}${r.discount ? ln('Discount' + (r.discountNote ? ' (' + E(r.discountNote) + ')' : ''), '-' + M(r.discount)) : ''}${ln('Service', M(r.service))}${ln('Tax', M(r.tax))}${r.tip ? ln('Tip', M(r.tip)) : ''}<tr class="big"><td>TOTAL</td><td class="r">${M(r.total)} ${E(st.currency || '')}</td></tr></table><hr>
    ${r.pre ? '<div class="c"><b>— BILL · NOT A RECEIPT —</b></div>' : `<table>${ln('Paid by', E(r.method || ''))}${pay.cash ? ln('Cash', M(pay.cash)) : ''}${pay.card ? ln('Card', M(pay.card)) : ''}${pay.tendered && pay.cash ? ln('Received', M(pay.tendered)) + ln('Change', M(pay.change)) : ''}</table>`}<hr>
    <div class="c">${E(st.receiptFooter || 'Thank you - see you soon!')}</div>`;
  },
  printHTML(html) { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0'; f.srcdoc = html; f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => f.remove(), 60000); }; document.body.appendChild(f); },
  ago(ts) { const m =Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? 'now' : m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; },
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
    const skin = App.skinChoice(), maison = skin !== 'default';
    if (maison) mode = skin === 'maison-light' ? 'light' : 'dark';
    const name = s.theme === 'dark' ? 'espresso' : s.theme;
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; };
    let p;
    if (name === 'custom' && s.palette) {
      const b = App.PRESETS.bloom[mode], c = s.palette;
      p = (mode === 'dark') === (lum(c.bg) < 0.5) ? { ...c } : { ...b, accent: c.accent, accent2: c.accent2 };
    } else p = { ...(App.PRESETS[name] || App.PRESETS.bloom)[mode] };
    const dark = mode === 'dark';
    const r = document.documentElement, set = (k, v) => r.style.setProperty(k, v);
    if (maison) {   // the Maison skin brings its own tokens (maison.css); drop any inline palette so they apply
      ['--accent', '--accent2', '--bg', '--card', '--text', '--muted', '--line', '--card2', '--on-accent', '--shadow'].forEach((k) => r.style.removeProperty(k));
      r.dataset.theme = dark ? 'maison' : 'maison-light';
    } else {
      delete r.dataset.theme;
      set('--accent', p.accent); set('--accent2', p.accent2); set('--bg', p.bg); set('--card', p.card); set('--text', p.text);
      set('--muted', dark ? 'rgba(255,255,255,.58)' : 'rgba(0,0,0,.52)');
      set('--line', dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.09)');
      set('--card2', dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.045)');
      set('--on-accent', lum(p.accent) > 0.6 ? '#111' : '#fff');
      set('--shadow', dark ? '0 14px 40px -14px rgba(0,0,0,.7)' : '0 14px 40px -16px rgba(60,45,20,.35)');
    }
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
  // ---- looks: the restaurant's own theme ('default') or Maison dark / light; the pick is remembered per signed-in user
  skinKey() { return `skin:${App.slug || '_'}:${App.who() || App.authRole || 'guest'}`; },
  skinChoice() { const v = App.ls(App.skinKey()), d = App.config && App.config.settings && App.config.settings.skin; return ['default', 'maison-dark', 'maison-light'].includes(v) ? v : ['maison-dark', 'maison-light'].includes(d) ? d : 'default'; },
  setSkin(v, ev) { App.transition(() => { App.ls(App.skinKey(), v); App.applyTheme(); App.handlers.render && App.handlers.render(); }, ev); },
  skinMenu(ev) {
    ev && ev.stopPropagation && ev.stopPropagation();
    const old = document.getElementById('skinmenu'); if (old) return old.remove();
    const cur = App.skinChoice(), b = ev && ev.currentTarget ? ev.currentTarget.getBoundingClientRect() : { right: innerWidth - 10, bottom: 56, left: 10 };
    const m = document.createElement('div'); m.id = 'skinmenu';
    m.style.cssText = `position:fixed;z-index:200;top:${Math.min(b.bottom + 6, innerHeight - 200)}px;${document.dir === 'rtl' || b.left > innerWidth / 2 ? `right:${Math.max(8, innerWidth - b.right)}px` : `left:${Math.max(8, b.left)}px`};min-width:200px;padding:8px;border-radius:16px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);display:flex;flex-direction:column;gap:4px`;
    m.innerHTML = [['maison-dark', '🌙 Maison · dark'], ['maison-light', '☀️ Maison · light'], ['default', '🎨 Restaurant theme']].map(([k, l]) => `<button data-k="${k}" style="text-align:start;${cur === k ? 'outline:2px solid var(--accent)' : ''}">${l}${cur === k ? ' ✓' : ''}</button>`).join('');
    m.onclick = (e) => { const k = e.target.closest('[data-k]'); if (k) { m.remove(); App.setSkin(k.dataset.k, e); } };
    document.body.appendChild(m); setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
  },
  countUps(root = document) {
    root.querySelectorAll('[data-count]').forEach((el) => {
      const to = parseFloat(el.dataset.count) || 0, dec = +(el.dataset.dec || 0), t0 = performance.now(), dur = 1100;
      const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const tick = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(to * e) + (el.dataset.suf || ''); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  },
  toggleMode(ev) { const sk = App.skinChoice(); if (sk !== 'default') return App.setSkin(sk === 'maison-dark' ? 'maison-light' : 'maison-dark', ev); App.transition(() => { App.ls('mode', App.isDark() ? 'light' : 'dark'); App.applyTheme(); App.handlers.render && App.handlers.render(); }, ev); },
  toggleLang(ev) { App.transition(() => { App.ls('lang', App.lang === 'ar' ? 'en' : 'ar'); App.applyTheme(); App.handlers.render && App.handlers.render(); }, ev); },

  // the owner's token also opens the captain and kitchen screens; a captain/kitchen token only opens its own
  tok(role) { const r = role || App.authRole, k = (x) => `tok:${App.slug || '_'}:${x}`; return App.ls(k(r)) || (r === 'captain' || r === 'kitchen' ? App.ls(k('admin')) : null); },
  logout() { const k = (x) => `tok:${App.slug || '_'}:${x}`; App.ls(k(App.authRole), ''); if (App.authRole !== 'admin' && App.authRole !== 'super') App.ls(k('admin'), ''); location.reload(); },
  // switch between the role screens of this restaurant without typing addresses
  roleMenu(ev) {
    ev && ev.stopPropagation && ev.stopPropagation();
    const old = document.getElementById('rolemenu'); if (old) return old.remove();
    const b = ev && ev.currentTarget ? ev.currentTarget.getBoundingClientRect() : { right: innerWidth - 10, bottom: 56, left: 10 }, base = App.slug ? '/r/' + App.slug : '';
    const m = document.createElement('div'); m.id = 'rolemenu';
    m.style.cssText = `position:fixed;z-index:200;top:${Math.min(b.bottom + 6, innerHeight - 220)}px;${document.dir === 'rtl' || b.left > innerWidth / 2 ? `right:${Math.max(8, innerWidth - b.right)}px` : `left:${Math.max(8, b.left)}px`};min-width:210px;padding:8px;border-radius:16px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);display:flex;flex-direction:column;gap:4px`;
    m.innerHTML = [['admin', '⚙️ Owner / admin'], ['captain', '🧑‍✈️ Captain'], ['kitchen', '🍳 Kitchen']].map(([k, l]) => `<a href="${base}/${k}" style="text-decoration:none;color:inherit;padding:10px 12px;border-radius:12px;background:var(--card2);${App.authRole === k ? 'outline:2px solid var(--accent)' : ''}">${l}${App.authRole === k ? ' ✓' : ''}</a>`).join('');
    document.body.appendChild(m); setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
  },
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
    if (App.demo) { await App.loadDemo(); return go(); }
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
    if (App.demo) { App.loadDemo().then(() => App.demoConnect({ ...joinMsg, slug: App.slug }, handlers)); return; }
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
  send(o) { if (App.demoSend) return App.demoSend(o); if (App.poll) return App.poll.call(o); App.ws && App.ws.readyState === 1 && App.ws.send(JSON.stringify(o)); },
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
        (j.notices || []).forEach((n) => App.toast(n));
        // Only redraw when something really changed (captain also refreshes once a minute for the 'x min' timers), so idle screens never flicker
        const sig = JSON.stringify(j.state);
        App.state = j.state; App.config = j.state.config;
        if (joinMsg.role === 'customer' && j.state.session) joinMsg.fresh = false;
        if (sig !== P.sig || Date.now() - (P.lastRender || 0) > (joinMsg.role === 'captain' ? 60000 : Infinity)) { P.sig = sig; P.lastRender = Date.now(); onMsg(j.state); }
      } catch { document.body.classList.add('offline'); }
    }));
    const tick = () => { clearTimeout(P.timer); if (!document.hidden) P.call(null); P.timer = setTimeout(tick, every); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    tick();
  },
  // who is signed in (from the token) - used to greet staff and label their actions
  who() { try { const t = App.tok(); return t ? JSON.parse(atob(t.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).n || '' : ''; } catch { return ''; } },
  // Web push so the phone alerts staff even when locked / in another app
  push: {
    supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; },
    async state() {
      if (!App.push.supported()) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      try { const reg = await navigator.serviceWorker.getRegistration('/'); const sub = reg && (await reg.pushManager.getSubscription()); return sub && Notification.permission === 'granted' ? 'on' : 'off'; } catch { return 'off'; }
    },
    async enable() {
      if (!App.push.supported()) throw new Error('This browser does not support notifications. On iPhone: add the page to your Home Screen first, then open it from there.');
      const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked in your browser settings.');
      const { key } = await (await fetch('/api/push/key')).json(); if (!key) throw new Error('Push is not configured on the server.');
      const pad = '='.repeat((4 - (key.length % 4)) % 4), raw = atob((key + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from([...raw].map((c) => c.charCodeAt(0))) }));
      const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON() }) });
      if (!r.ok) throw new Error('Could not save the subscription.');
      return 'on';
    },
    async disable() {
      const reg = await navigator.serviceWorker.getRegistration('/'); const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) { await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      return 'off';
    },
  },
  toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
  },
};

// Route relative /api/... calls to this restaurant, attach the auth token, and retry write conflicts (409)
(() => {
  const f = window.fetch.bind(window); App.rawFetch = f;
  window.fetch = async (u, o = {}) => {
    const api = typeof u === 'string' && u.startsWith('/api/');
    if (api && App.demo) { await App.loadDemo(); if (App.demoFetch) return App.demoFetch(u, o); }
    if (api) {
      if (App.slug && !/^\/api\/(r|super|public)\//.test(u)) u = '/api/r/' + App.slug + u.slice(4);
      const tk = App.tok(); if (tk) o = { ...o, headers: { ...(o.headers || {}), Authorization: 'Bearer ' + tk } };
    }
    let r = await f(u, o);
    for (let i = 0; api && i < 3 && r.status === 409 && (o.method || 'GET') !== 'GET'; i++) { await new Promise((x) => setTimeout(x, 150 + Math.random() * 300)); r = await f(u, o); }
    return r;
  };
})();

// button ripple (Maison looks)
document.addEventListener('click', (e) => {
  if (!(document.documentElement.dataset.theme || '').startsWith('maison')) return;
  const b = e.target.closest && e.target.closest('button'); if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), d = document.createElement('span');
  d.className = 'm-ripple'; d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`; b.appendChild(d); setTimeout(() => d.remove(), 600);
});

// make the staff pages installable (needs the service worker); remember the install prompt for a button
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); App.installEvt = e; document.dispatchEvent(new Event('app-installable')); });
if (/\/(captain|kitchen)(\/|$)/.test(location.pathname) && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
