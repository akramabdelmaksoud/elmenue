// Shared client runtime: websocket, theme engine, i18n, helpers
const DICT = {
  en: {
    menu: 'Menu', cart: 'Cart', bill: 'Bill', service: 'Service', tax: 'Tax', tip: 'Tip', total: 'Total', subtotal: 'Subtotal',
    add: 'Add', youPayAll: 'You are paying for the whole table', paysAll: 'is paying for the whole table', nothingToPay: 'You have nothing to pay.', sendAll: "Also send everyone's items", send: 'Send to kitchen', myItems: 'My items', tableOrder: 'Table order', welcome: 'Welcome', pickName: 'Your name',
    pickAvatar: 'Choose an avatar', join: 'Join table', table: 'Table', yourCart: 'Your cart (not sent yet)', empty: 'Nothing here yet',
    payMine: 'Pay for myself', payTable: 'Pay for entire table', payCustom: 'Custom split', cash: 'Cash', card: 'Card',
    reqBill: 'Request check', callWaiter: 'Call waiter', water: 'Water / napkins', urgent: 'Speed up order', note: 'Note (optional)',
    discount: 'Discount', sent: 'Sent', received: 'Received', kitchen: 'In kitchen', served: 'Served', closed: 'Closed', who: 'Who', youLabel: 'You',
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
    discount: 'خصم', sent: 'تم الإرسال', received: 'تم الاستلام', kitchen: 'في المطبخ', served: 'تم التقديم', closed: 'مغلق', who: 'من', youLabel: 'أنت',
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
// F7 offline queue for staff apps: an action is written to IndexedDB first, sent with an idempotency key, removed only after the server confirmed it.
const OQ = {
  role: '', join: null, busy: false, tbl: null,
  on() { const c = App.config; return !!(c && c.features && c.features.offline && c.settings && c.settings.offline && c.settings.offline.enabled) && (OQ.role === 'captain' || OQ.role === 'cashier'); },
  want(o) { return OQ.on() && !!o && ['staff_order', 'open_ticket', 'seat_table', 'resolve_request', 'order_status'].includes(o.t); },
  db() { return OQ.tbl || (OQ.tbl = new Promise((ok, no) => { try { const r = indexedDB.open('elmenue-oq', 1); r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'k' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } })); },
  async tx(mode, fn) { const d = await OQ.db(); return new Promise((ok, no) => { const t = d.transaction('q', mode), s = t.objectStore('q'), r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); },
  all() { return OQ.tx('readonly', (s) => s.getAll()).then((l) => (l || []).filter((x) => x.slug === App.slug).sort((a, b) => a.at - b.at)); },
  async add(o) {
    const item = { k: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)), slug: App.slug, at: Date.now(), msg: o };
    try { await OQ.tx('readwrite', (s) => s.put(item)); } catch { App.toast('This device cannot store offline actions'); return; }
    OQ.bar(); OQ.flush();
  },
  async post(it) {
    const j = { join: { ...OQ.join, since: -1 }, msg: { ...it.msg, k: it.k }, since: -1 };
    const r = await fetch('/api/r/' + App.slug + '/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(j) });
    return { r, j: await r.json().catch(() => ({})) };
  },
  async flush() {
    if (OQ.busy || !OQ.join) return; OQ.busy = true;
    try {
      for (const it of await OQ.all()) {
        let res; try { res = await OQ.post(it); } catch { break; }   // still offline: keep everything, retry later
        if (res.r.status === 401) { break; }
        if (res.r.status >= 500 || res.r.status === 409 || res.r.status === 429) break;
        await OQ.tx('readwrite', (s) => s.delete(it.k));   // confirmed (or refused for good: a notice explains why)
        (res.j.notices || []).filter((n) => n && n !== 'Already applied').forEach((n) => App.toast('⚠ ' + n));
        if (App.poll) App.poll.call(null);
      }
    } finally { OQ.busy = false; OQ.bar(); }
  },
  async bar() {
    let n = 0; try { n = (await OQ.all()).length; } catch {}
    let b = document.getElementById('oqbar'); if (!b) { b = document.createElement('div'); b.id = 'oqbar'; document.body.appendChild(b); }
    const off = navigator.onLine === false || document.body.classList.contains('offline');
    b.textContent = n ? (off ? '📴 Offline - ' : '⏳ ') + n + (n === 1 ? ' action' : ' actions') + ' waiting to send' : off && OQ.on() ? '📴 Offline - new orders will be saved and sent when you are back' : '';
    b.classList.toggle('on', !!b.textContent);
  },
  start(j) { OQ.role = j.role; OQ.join = { role: j.role, token: j.token }; if (OQ.on !== undefined && (j.role === 'captain' || j.role === 'cashier') && !OQ.t) { OQ.t = setInterval(() => { OQ.flush(); OQ.bar(); }, 4000); addEventListener('online', () => OQ.flush()); addEventListener('offline', OQ.bar); OQ.flush(); } },
};
const App = {
  demo: DEMO,
  loadDemo() { return (App._dl ||= new Promise((res) => { const s = document.createElement('script'); s.src = '/demo.js'; s.onload = () => App.demoReady().then(res); s.onerror = res; document.head.appendChild(s); })); },
  slug: (location.pathname.match(/^\/r\/([^/]+)/) || [])[1] || null, authRole: null,
  config: null, ws: null, lang: null, mode: null, handlers: {},
  tr(k) { return (DICT[App.lang] && DICT[App.lang][k]) || DICT.en[k] || k; },
  nm(o) { return App.lang === 'ar' && o.name_ar ? o.name_ar : o.name; },
  // numbers always use Western digits (0-9), even in Arabic; only the words are Arabic
  money(n) { const cur = App.config ? App.config.settings.currency : ''; return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + (App.lang === 'ar' && cur === 'EGP' ? 'ج.م' : cur); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  // 80mm thermal-style receipt; r = {label, kind, customer, at, items[{name,qty,price}], gross, discount, discountNote, service, tax, tip, total, method, pay, by}
  receiptHTML(r) {
    const st = (App.config && App.config.settings) || {}, E = App.esc, M = (n) => Number(n || 0).toFixed(2);
    const rows = r.items.map((l) => `<tr><td colspan="2"><b>${E(l.name)}</b></td></tr><tr><td>${l.qty} x ${M(l.price)}</td><td class="r">${M(l.qty * l.price)}</td></tr>`).join('');
    const ln = (a, b) => `<tr><td>${a}</td><td class="r">${b}</td></tr>`;
    const pay = r.pay || {};
    return `<!doctype html><meta charset="utf-8"><title>Receipt</title><style>@page{size:80mm auto;margin:4mm}body{font:12px/1.35 monospace;width:72mm;margin:0;color:#000}table{width:100%;border-collapse:collapse}.r{text-align:right}hr{border:0;border-top:1px dashed #000;margin:6px 0}.c{text-align:center}.big td{font-size:15px;font-weight:bold}</style>
    <div class="c"><b style="font-size:16px">${E(st.name || '')}</b>${st.address ? '<br>' + E(st.address) : ''}${st.phone ? '<br>' + E(st.phone) : ''}${st.taxId ? '<br>Tax ID: ' + E(st.taxId) : ''}<br>${new Date(r.at || Date.now()).toLocaleString('en-GB')}<br>${r.kind && r.kind !== 'table' ? E(r.kind) + ' ' : 'Table '}${E(r.label)}${r.by ? ' · ' + E(r.by) : ''}</div>
    ${r.customer && (r.customer.name || r.customer.phone || r.customer.address) ? `<div>${E(r.customer.name || '')} ${E(r.customer.phone || '')}<br>${E(r.customer.address || '')}</div>` : ''}<hr><table>${rows}</table><hr><table>
    ${ln('Subtotal', M(r.gross))}${r.discount ? ln('Discount' + (r.discountNote ? ' (' + E(r.discountNote) + ')' : ''), '-' + M(r.discount)) : ''}${ln('Service', M(r.service))}${ln('Tax', M(r.tax))}${r.tip ? ln('Tip', M(r.tip)) : ''}<tr class="big"><td>TOTAL</td><td class="r">${M(r.total)} ${E(st.currency || '')}</td></tr></table><hr>
    ${r.pre ? '<div class="c"><b>— BILL · NOT A RECEIPT —</b></div>' : `<table>${ln('Paid by', E(r.method || ''))}${pay.cash ? ln('Cash', M(pay.cash)) : ''}${pay.card ? ln('Card', M(pay.card)) : ''}${pay.tendered && pay.cash ? ln('Received', M(pay.tendered)) + ln('Change', M(pay.change)) : ''}</table>`}<hr>
    <div class="c">${E(st.receiptFooter || 'Thank you - see you soon!')}</div>`;
  },
  printHTML(html) { const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0'; f.srcdoc = html; f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => f.remove(), 60000); }; document.body.appendChild(f); },
  ago(ts) { const m =Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? (App.lang === 'ar' ? 'الآن' : 'now') : App.lang === 'ar' ? (m < 60 ? m + ' د' : Math.floor(m / 60) + ' س ' + (m % 60) + ' د') : m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; },
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
    // VIP "Fasheekh" looks - surface styling in fasheekh.css
    neon: { light: { bg: '#eef1ff', card: '#ffffff', text: '#12163a', accent: '#5b3df5', accent2: '#00b8d9' }, dark: { bg: '#070914', card: '#101531', text: '#e8ecff', accent: '#00e5ff', accent2: '#ff2bd6' } },
    luxury: { light: { bg: '#f7f4ee', card: '#ffffff', text: '#1c1a17', accent: '#1c1a17', accent2: '#b08d57' }, dark: { bg: '#0e0d0b', card: '#191714', text: '#f3eee4', accent: '#d6b46f', accent2: '#f3eee4' } },
    vibrant: { light: { bg: '#fff4e0', card: '#fffaf0', text: '#2d1606', accent: '#d62828', accent2: '#f4a300' }, dark: { bg: '#1b0f08', card: '#2a1810', text: '#fff1da', accent: '#ff5a3c', accent2: '#2ec4b6' } },
    // Maison de Luxe collection (VIP) - typography/ornament in luxe.css; fixed palettes (see LUXMODE)
    onyx: { light: { bg: '#060606', card: '#0f0f0f', text: '#f1ead9', accent: '#c9a45c', accent2: '#e2c98e' }, dark: { bg: '#060606', card: '#0f0f0f', text: '#f1ead9', accent: '#c9a45c', accent2: '#e2c98e' } },
    ivory: { light: { bg: '#ffffff', card: '#ffffff', text: '#0b0b0b', accent: '#0b0b0b', accent2: '#a88b4f' }, dark: { bg: '#ffffff', card: '#ffffff', text: '#0b0b0b', accent: '#0b0b0b', accent2: '#a88b4f' } },
    noir: { light: { bg: '#000000', card: '#050505', text: '#ececec', accent: '#e9e9e9', accent2: '#9a9a9a' }, dark: { bg: '#000000', card: '#050505', text: '#ececec', accent: '#e9e9e9', accent2: '#9a9a9a' } },
    champagne: { light: { bg: '#f6efe3', card: '#fffaf1', text: '#2a2118', accent: '#7a5b2e', accent2: '#c8a96a' }, dark: { bg: '#15110b', card: '#1f1912', text: '#f3ead8', accent: '#d8b676', accent2: '#a98650' } },
    emerald: { light: { bg: '#06140f', card: '#0c211a', text: '#efe9d6', accent: '#c8a85a', accent2: '#3f8f6e' }, dark: { bg: '#06140f', card: '#0c211a', text: '#efe9d6', accent: '#c8a85a', accent2: '#3f8f6e' } },
    bordeaux: { light: { bg: '#14070b', card: '#200c12', text: '#f6e8e4', accent: '#d9a38f', accent2: '#9c2a45' }, dark: { bg: '#14070b', card: '#200c12', text: '#f6e8e4', accent: '#d9a38f', accent2: '#9c2a45' } },
    marble: { light: { bg: '#f6f6f4', card: '#ffffff', text: '#1b1b1b', accent: '#1b1b1b', accent2: '#b49a62' }, dark: { bg: '#f6f6f4', card: '#ffffff', text: '#1b1b1b', accent: '#1b1b1b', accent2: '#b49a62' } },
    royal: { light: { bg: '#050b1a', card: '#0b1630', text: '#f2ead3', accent: '#d4af37', accent2: '#7f9cd6' }, dark: { bg: '#050b1a', card: '#0b1630', text: '#f2ead3', accent: '#d4af37', accent2: '#7f9cd6' } },
    // Pro Studio collection (VIP) - venue-type design systems, see pro.css
    slate: { light: { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', accent: '#2563eb', accent2: '#64748b' }, dark: { bg: '#0b1120', card: '#111a2e', text: '#e2e8f0', accent: '#60a5fa', accent2: '#94a3b8' } },
    nordic: { light: { bg: '#f5f2ec', card: '#fbf9f5', text: '#2b2a27', accent: '#5f7a62', accent2: '#b89a73' }, dark: { bg: '#141613', card: '#1d201c', text: '#ece8df', accent: '#9bb99e', accent2: '#c9ab84' } },
    bistro: { light: { bg: '#f6ecd9', card: '#fffdf6', text: '#2b1a14', accent: '#8b1e2d', accent2: '#b8893a' }, dark: { bg: '#f6ecd9', card: '#fffdf6', text: '#2b1a14', accent: '#8b1e2d', accent2: '#b8893a' } },
    zen: { light: { bg: '#f7f5f0', card: '#f7f5f0', text: '#1a1a1a', accent: '#c8341f', accent2: '#6b6b6b' }, dark: { bg: '#f7f5f0', card: '#f7f5f0', text: '#1a1a1a', accent: '#c8341f', accent2: '#6b6b6b' } },
    trattoria: { light: { bg: '#f8ecd2', card: '#fffaf0', text: '#2f1d12', accent: '#b24a2b', accent2: '#6b7a3a' }, dark: { bg: '#f8ecd2', card: '#fffaf0', text: '#2f1d12', accent: '#b24a2b', accent2: '#6b7a3a' } },
    roast: { light: { bg: '#e9dcc3', card: '#f3e9d4', text: '#2a1a0e', accent: '#c4551a', accent2: '#5a3a1e' }, dark: { bg: '#17110c', card: '#231a12', text: '#f1e4cc', accent: '#f08a3c', accent2: '#c9a679' } },
    steakhouse: { light: { bg: '#0f0f10', card: '#1b1b1d', text: '#f1ede6', accent: '#e25822', accent2: '#a8a29a' }, dark: { bg: '#0f0f10', card: '#1b1b1d', text: '#f1ede6', accent: '#e25822', accent2: '#a8a29a' } },
    rooftop: { light: { bg: '#070718', card: '#121232', text: '#ece9ff', accent: '#a78bfa', accent2: '#38bdf8' }, dark: { bg: '#070718', card: '#121232', text: '#ece9ff', accent: '#a78bfa', accent2: '#38bdf8' } },
    // Signature Dark collection (VIP) - dashboard-grade dark systems, see sig.css
    aurum: { light: { bg: '#0a0a0a', card: '#141414', text: '#f4eee2', accent: '#d8b673', accent2: '#a8803a' }, dark: { bg: '#0a0a0a', card: '#141414', text: '#f4eee2', accent: '#d8b673', accent2: '#a8803a' } },
    ember: { light: { bg: '#0a0a0a', card: '#111111', text: '#f5f5f5', accent: '#ff5a1f', accent2: '#ffa24d' }, dark: { bg: '#0a0a0a', card: '#111111', text: '#f5f5f5', accent: '#ff5a1f', accent2: '#ffa24d' } },
    sunset: { light: { bg: '#0f0b0a', card: '#181210', text: '#fbf1e8', accent: '#ff6a00', accent2: '#a86aa0' }, dark: { bg: '#0f0b0a', card: '#181210', text: '#fbf1e8', accent: '#ff6a00', accent2: '#a86aa0' } },
    platinum: { light: { bg: '#08090b', card: '#121418', text: '#eef2f7', accent: '#cfd8e4', accent2: '#8d98a6' }, dark: { bg: '#08090b', card: '#121418', text: '#eef2f7', accent: '#cfd8e4', accent2: '#8d98a6' } },
    rosegold: { light: { bg: '#0c0809', card: '#171011', text: '#f8ebe6', accent: '#ecb7a8', accent2: '#b66f7c' }, dark: { bg: '#0c0809', card: '#171011', text: '#f8ebe6', accent: '#ecb7a8', accent2: '#b66f7c' } },
    sapphire: { light: { bg: '#050a18', card: '#0c1428', text: '#e6eeff', accent: '#4f8cff', accent2: '#22d3ee' }, dark: { bg: '#050a18', card: '#0c1428', text: '#e6eeff', accent: '#4f8cff', accent2: '#22d3ee' } },
    jade: { light: { bg: '#040b09', card: '#0a1512', text: '#e6f6ef', accent: '#34d399', accent2: '#059669' }, dark: { bg: '#040b09', card: '#0a1512', text: '#e6f6ef', accent: '#34d399', accent2: '#059669' } },
    amethyst: { light: { bg: '#08050f', card: '#130d20', text: '#f1e9ff', accent: '#a78bfa', accent2: '#e879f9' }, dark: { bg: '#08050f', card: '#130d20', text: '#f1e9ff', accent: '#a78bfa', accent2: '#e879f9' } },
  },
  SIG: ['aurum', 'ember', 'sunset', 'platinum', 'rosegold', 'sapphire', 'jade', 'amethyst'],
  PRO: ['slate', 'nordic', 'bistro', 'zen', 'trattoria', 'roast', 'steakhouse', 'rooftop'],
  LUX: ['onyx', 'ivory', 'noir', 'champagne', 'emerald', 'bordeaux', 'marble', 'royal'],
  LUXMODE: { onyx: 'dark', ivory: 'light', noir: 'dark', emerald: 'dark', bordeaux: 'dark', marble: 'light', royal: 'dark', bistro: 'light', zen: 'light', trattoria: 'light', steakhouse: 'dark', rooftop: 'dark', aurum: 'dark', ember: 'dark', sunset: 'dark', platinum: 'dark', rosegold: 'dark', sapphire: 'dark', jade: 'dark', amethyst: 'dark' },   // champagne follows the day/night switch
  isDark() { return document.documentElement.dataset.dark === '1'; },
  applyTheme() {
    const s = (App.config && App.config.settings) || { theme: 'bloom', lang: 'en' };
    App.lang = App.ls('lang') || s.lang || 'en';
    if (App.langs && !App.langs().includes(App.lang)) App.lang = App.langs()[0];
    let mode = App.ls('mode');
    if (mode !== 'light' && mode !== 'dark') mode = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const skin = App.skinChoice(), maison = skin !== 'default';
    const _n = s.theme === 'dark' ? 'espresso' : s.theme, lux = App.LUX.concat(App.PRO, App.SIG).includes(_n) && !(App.config && App.config.features && App.config.features.themes === false) && !maison;
    if (lux && App.LUXMODE[_n]) mode = App.LUXMODE[_n];
    if (maison) mode = skin === 'maison-light' ? 'light' : 'dark';
    let name = s.theme === 'dark' ? 'espresso' : s.theme;
    const FLV = ['neon', 'luxury', 'vibrant'].concat(App.LUX, App.PRO, App.SIG);
    if (FLV.includes(name) && App.config && App.config.features && App.config.features.themes === false) name = 'bloom';   // premium looks need the VIP tier
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
    if (FLV.includes(name) && !maison) { r.dataset.flavor = name; const isL = App.LUX.includes(name), isP = App.PRO.includes(name), isS = App.SIG.includes(name), fid = isL ? 'lux-css' : isP ? 'pro-css' : isS ? 'sig-css' : 'flv-css'; if (isS) r.dataset.sig = '1'; else delete r.dataset.sig; if (isL) r.dataset.lux = '1'; else delete r.dataset.lux; if (isP) r.dataset.pro = '1'; else delete r.dataset.pro; if (App.LUXMODE[name]) r.dataset.luxLock = '1'; else delete r.dataset.luxLock; if (!document.getElementById(fid)) { const l = document.createElement('link'); l.id = fid; l.rel = 'stylesheet'; l.href = isL ? '/luxe.css' : isP ? '/pro.css' : isS ? '/sig.css' : '/fasheekh.css'; document.head.appendChild(l); } } else { delete r.dataset.flavor; delete r.dataset.lux; delete r.dataset.pro; delete r.dataset.sig; delete r.dataset.luxLock; }
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
      const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      const tick = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(to * e) + (el.dataset.suf || ''); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  },
  toggleMode(ev) { const sk = App.skinChoice(); if (sk !== 'default') return App.setSkin(sk === 'maison-dark' ? 'maison-light' : 'maison-dark', ev); App.transition(() => { App.ls('mode', App.isDark() ? 'light' : 'dark'); App.applyTheme(); App.handlers.render && App.handlers.render(); }, ev); },
  // en -> Egyptian Ammiya (ar) -> Franco (fr); the Basic plan has a single language (the café's default)
  langs() { const f = App.config && App.config.features, def = (App.config && App.config.settings.lang) || 'en'; return f && f.trilingual === false ? [def] : ['en', 'ar', 'fr']; },
  nextLang() { const l = App.langs(), i = l.indexOf(App.lang); return l[(i + 1) % l.length]; },
  langLabel(code) { return { en: 'EN', ar: 'عربي', fr: 'Franco' }[code] || code; },
  toggleLang(ev) { if (App.langs().length < 2) return; App.transition(() => { App.ls('lang', App.nextLang()); App.applyTheme(); App.handlers.render && App.handlers.render(); }, ev); },

  // the owner's token also opens the captain and kitchen screens; a captain/kitchen token only opens its own
  tok(role) { const r = role || App.authRole, k = (x) => `tok:${App.slug || '_'}:${x}`; return App.ls(k(r)) || (r === 'captain' || r === 'kitchen' || r === 'cashier' ? App.ls(k('admin')) : null); },
  logout() { const k = (x) => `tok:${App.slug || '_'}:${x}`; App.ls(k(App.authRole), ''); if (App.authRole !== 'admin' && App.authRole !== 'super') App.ls(k('admin'), ''); location.reload(); },
  // switch between the role screens of this restaurant without typing addresses
  roleMenu(ev) {
    ev && ev.stopPropagation && ev.stopPropagation();
    const old = document.getElementById('rolemenu'); if (old) return old.remove();
    const b = ev && ev.currentTarget ? ev.currentTarget.getBoundingClientRect() : { right: innerWidth - 10, bottom: 56, left: 10 }, base = App.slug ? '/r/' + App.slug : '';
    const m = document.createElement('div'); m.id = 'rolemenu';
    m.style.cssText = `position:fixed;z-index:200;top:${Math.min(b.bottom + 6, innerHeight - 220)}px;${document.dir === 'rtl' || b.left > innerWidth / 2 ? `right:${Math.max(8, innerWidth - b.right)}px` : `left:${Math.max(8, b.left)}px`};min-width:210px;padding:8px;border-radius:16px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);display:flex;flex-direction:column;gap:4px`;
    m.innerHTML = [['admin', '⚙️ Owner / admin'], ['captain', '🧑‍✈️ Captain'], ['kitchen', '🍳 Kitchen'], ['cashier', '💵 Cashier']].map(([k, l]) => `<a href="${base}/${k}" style="text-decoration:none;color:inherit;padding:10px 12px;border-radius:12px;background:var(--card2);${App.authRole === k ? 'outline:2px solid var(--accent)' : ''}">${l}${App.authRole === k ? ' ✓' : ''}</a>`).join('');
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
    // the shared showroom café opens without a password when reached from the /demo launcher (?auto=1)
    if (!App.tok(role) && App.slug === 'showroom' && /[?&]auto=1/.test(location.search)) { try { const r = await fetch(location.origin + '/api/demo/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }) }); if (r.ok) App.ls('tok:showroom:' + role, (await r.json()).token); } catch {} }
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
    App.oq.start(joinMsg);
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
  oq: OQ,
  send(o) { if (App.demoSend) return App.demoSend(o); if (App.oq && App.oq.want(o)) return App.oq.add(o); if (App.poll) return App.poll.call(o); App.ws && App.ws.readyState === 1 && App.ws.send(JSON.stringify(o)); },
  startPolling(joinMsg, handlers, onMsg) {
    const P = (App.poll = { since: -1, chain: Promise.resolve(), timer: null });
    document.body.classList.remove('offline');
    const every = joinMsg.role === 'captain' || joinMsg.role === 'cashier' ? 2000 : joinMsg.role === 'admin' ? 0 : 2500;   // admin: on demand only (see the refresh bar)
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
        if (sig !== P.sig || Date.now() - (P.lastRender || 0) > (joinMsg.role === 'captain' || joinMsg.role === 'cashier' ? 60000 : Infinity)) { P.sig = sig; P.lastRender = Date.now(); onMsg(j.state); }
      } catch { document.body.classList.add('offline'); }
    }));
    const tick = () => { clearTimeout(P.timer); if (!document.hidden) P.call(null); P.timer = every ? setTimeout(tick, every) : null; };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && every) tick(); });
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
if (/\/(captain|kitchen|cashier)(\/|$)/.test(location.pathname) && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
