// Shared client runtime: websocket, theme engine, i18n, helpers
const DICT = {
  en: {
    menu: 'Menu', cart: 'Cart', bill: 'Bill', service: 'Service', tax: 'Tax', tip: 'Tip', total: 'Total', subtotal: 'Subtotal',
    add: 'Add', youPayAll: 'You are paying for the whole table', paysAll: 'is paying for the whole table', nothingToPay: 'You have nothing to pay.', sendAll: 'Also send everyone's items', send: 'Send to kitchen', myItems: 'My items', tableOrder: 'Table order', welcome: 'Welcome', pickName: 'Your name',
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
  config: null, ws: null, lang: null, mode: null, handlers: {},
  tr(k) { return (DICT[App.lang] && DICT[App.lang][k]) || DICT.en[k] || k; },
  nm(o) { return App.lang === 'ar' && o.name_ar ? o.name_ar : o.name; },
  money(n) { return Number(n || 0).toLocaleString(App.lang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + (App.config ? App.config.settings.currency : ''); },
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
  ago(ts) { const m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 1 ? 'now' : m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; },
  ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } },

  applyTheme() {
    const s = App.config.settings;
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

  connect(joinMsg, handlers) {
    App.handlers = handlers;
    const open = () => {
      const ws = (App.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'));
      ws.onopen = () => { ws.send(JSON.stringify(joinMsg)); document.body.classList.remove('offline'); };
      ws.onclose = () => { document.body.classList.add('offline'); setTimeout(open, 1500); };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.t === 'state') { App.state = m; App.config = m.config; App.applyTheme(); handlers.render && handlers.render(m); }
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
