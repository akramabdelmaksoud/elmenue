const seed = require('./data');

const clone = (o) => JSON.parse(JSON.stringify(o));
function freshData(demo) {
  return { settings: clone(seed.settings), categories: clone(seed.categories), items: clone(seed.items), tables: clone(seed.tables), sessions: {}, history: demo ? seed.buildHistory() : [] };
}

// A tenant = one restaurant with its own menu, tables, sessions, history, websocket clients.
function createTenant(rec, persist, onAlert) {
  const db = rec.data;
  let simulate = false;
  let uid = Date.now() * 1000 + Math.floor(Math.random() * 1000000);
  const id = (p) => p + (uid++).toString(36);
  const save = () => persist(rec);
  const touch = () => (rec.lastActive = Date.now());
  const rkey = () => Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
  // Every table gets a secret key that is printed inside its QR code; returns true if anything was added
  function ensure() {
    let ch = false;
    db.tables.forEach((t) => { if (!t.key) { t.key = rkey(); ch = true; } });
    if (!rec.stats) { rec.stats = { staff: {} }; ch = true; }
    if (!db.reservations) { db.reservations = []; ch = true; }
    return ch;
  }
  const keyOk = (t, key) => db.settings.requireKey === false || (!!t.key && key === t.key);
  // Stale sessions: nobody ordered and nobody active -> free the table; ordered but silent for a long time -> flag as idle
  function sweep() {
    const now = Date.now(), mins = Math.max(5, +db.settings.idleMinutes || 30); let ch = false;
    Object.values(db.sessions).forEach((s) => {
      const last = s.lastAt || s.startedAt;
      if (!s.orders.length && !s.cart.length && now - last > mins * 60000) { delete db.sessions[s.tableId]; ch = true; }
      else if (s.orders.length && !s.check && !s.idle && now - last > Math.max(mins * 3, 90) * 60000) { s.idle = true; ch = true; }
    });
    return ch;
  }
  function bump(c, key, add = 1) {
    if (!c.staffId) return;
    const st = ((rec.stats ||= { staff: {} }).staff[c.staffId] ||= { name: c.staffName || '?', handled: 0, respMs: 0, served: 0, started: 0, closed: 0 });
    st.name = c.staffName || st.name; st[key] = (st[key] || 0) + add;
  }
  // ---------- Inventory (optional per item: stock = number of portions left, null = unlimited) ----------
  const tracked = (it) => it && it.stock !== undefined && it.stock !== null && it.stock !== '';
  function slog(it, delta, type, reason, who) {
    rec.stockLog = [{ at: Date.now(), itemId: it.id, item: it.name, delta, type, reason: reason || '', who: who || '', left: it.stock }, ...(rec.stockLog || [])].slice(0, 400);
  }
  // takes stock for the given lines (mutates qty down when there is not enough); returns the lines that remain
  function takeStock(lines, who) {
    lines.forEach((l) => {
      const it = db.items.find((x) => x.id === l.itemId); if (!tracked(it)) return;
      const have = Math.max(0, Math.floor(+it.stock)); if (l.qty > have) l.qty = have;
      if (l.qty <= 0) return;
      it.stock = have - l.qty; slog(it, -l.qty, 'sale', '', who);
      if (it.stock <= 0) it.soldOut = true;
    });
    return lines.filter((l) => l.qty > 0);
  }
  function putStock(itemId, qty, type, reason, who) {
    const it = db.items.find((x) => x.id === itemId); if (!tracked(it) || qty <= 0) return;
    it.stock = Math.floor(+it.stock) + qty; slog(it, qty, type, reason, who);
    if (it.stock > 0) it.soldOut = false;
  }
  // splits what was paid into cash / card and works out the change for the cash part
  function settle(method, total, pay) {
    pay = pay || {};
    if (method === 'card') return { cash: 0, card: total, tendered: 0, change: 0 };
    if (method === 'mixed') {
      const card = +Math.min(total, Math.max(0, +pay.card || 0)).toFixed(2), cash = +(total - card).toFixed(2), tendered = Math.max(cash, +pay.tendered || cash);
      return { cash, card, tendered, change: +(tendered - cash).toFixed(2) };
    }
    const tendered = Math.max(total, +pay.tendered || total);
    return { cash: total, card: 0, tendered, change: +(tendered - total).toFixed(2) };
  }

// ---------- Billing ----------
function bill(s) {
  const st = db.settings;
  const by = {};
  s.guests.forEach((g) => (by[g.id] = { sub: 0, items: [] }));
  let gross = 0;
  s.orders.forEach((o) => o.items.forEach((it) => {
    const v = it.price * it.qty; gross += v;
    (by[it.guestId] ||= { sub: 0, items: [] }); by[it.guestId].sub += v; by[it.guestId].items.push(it);
  }));
  // discount comes off the food total first; service and tax are charged on what is left
  let disc = 0;
  if (s.discount && gross > 0) disc = s.discount.type === 'pct' ? gross * Math.min(100, Math.max(0, +s.discount.value || 0)) / 100 : Math.min(gross, Math.max(0, +s.discount.value || 0));
  disc = +disc.toFixed(2);
  const net = +(gross - disc).toFixed(2), k = gross ? net / gross : 1;
  const calc = (x) => {
    const service = +(x * st.service / 100).toFixed(2);
    const tax = +((x + service) * st.tax / 100).toFixed(2);
    return { sub: x, service, tax, total: +(x + service + tax).toFixed(2) };
  };
  Object.keys(by).forEach((g) => { by[g].gross = by[g].sub; Object.assign(by[g], calc(+(by[g].sub * k).toFixed(2))); });
  return { ...calc(net), sub: gross, gross, discount: disc, net, byGuest: by };
}

// a reservation counts from 45 minutes before until 20 minutes after its time
function nextRes(t) { const n = Date.now(); return (db.reservations || []).find((r) => r.tableId === t.id && n >= r.at - 45 * 60000 && n <= r.at + 20 * 60000); }
function tableState(t) {
  const s = db.sessions[t.id];
  if (!s) return nextRes(t) ? 'reserved' : 'empty';
  if (s.requests.some((r) => !r.done && r.type !== 'bill')) return 'urgent';
  if (s.check) return 'check';
  if (s.orders.some((o) => o.status !== 'closed')) return 'ordered';
  if (s.orders.length) return 'ordered';
  return 'seated';
}

const log = (s, evt, text) => s.log.push({ at: Date.now(), evt, text });

function openSession(t) {
  if (!db.sessions[t.id]) {
    db.sessions[t.id] = { id: id('s'), tableId: t.id, tableNumber: t.number, startedAt: Date.now(), guests: [], cart: [], orders: [], requests: [], check: null, log: [] };
    log(db.sessions[t.id], 'seated', `Table ${t.number} session started`);
  }
  return db.sessions[t.id];
}

function closeSession(t, method, who, pay) {
  const s = db.sessions[t.id]; if (!s) return;
  const b = bill(s);
  const lines = {};
  s.orders.forEach((o) => o.items.forEach((i) => {
    const m = db.items.find((x) => x.id === i.itemId);
    const l = (lines[i.itemId] ||= { itemId: i.itemId, cat: m?.cat, name: i.name, qty: 0, price: i.price, cost: m?.cost || 0 });
    l.qty += i.qty;
  }));
  const tip = pay && pay.tip !== undefined && pay.tip !== null && pay.tip !== '' ? Math.max(0, +(+pay.tip).toFixed(2)) : Math.round(b.net * (s.check?.tipPct || 0) / 100);
  const total = +(b.total + tip).toFixed(2);
  const m = ['cash', 'card', 'mixed', 'unpaid'].includes(method) ? method : (s.check?.method || 'cash');
  log(s, 'closed', 'Table paid and cleared' + (who ? ' by ' + who : ''));
  if (s.orders.length) {
    db.history.push({
      id: id('h'), tableId: t.id, tableNumber: t.number, kind: s.kind || 'table', customer: s.customer || null, startedAt: s.startedAt,
      orderedAt: s.orders[0].at, checkAt: s.check?.at || Date.now(), closedAt: Date.now(),
      guests: s.guests.length || 1, items: Object.values(lines), sub: b.gross, discount: b.discount, discountNote: s.discount ? (s.discount.reason || '') : '', service: b.service, tax: b.tax, tip,
      total, method: m, unpaid: m === 'unpaid', pay: m === 'unpaid' ? { cash: 0, card: 0, tendered: 0, change: 0 } : settle(m, total, pay), split: s.check?.split || 'table', closedBy: who || '', voids: s.voids || [], log: s.log,
    });
  }
  delete db.sessions[t.id];
}
const tableOf = (tid) => db.tables.find((x) => x.id === tid) || (db.sessions[tid] && { id: tid, number: db.sessions[tid].tableNumber });

function seedLiveSessions() {
  const A = ['😎', '🧑‍🎤', '🦊', '🐼', '🎮', '👩‍🎨', '🧔', '🐱'];
  const names = ['Ahmed', 'Sara', 'Omar', 'Mona', 'Youssef', 'Laila', 'Karim', 'Nour'];
  const plan = [[1, 'seated'], [2, 'ordered'], [3, 'ordered'], [5, 'urgent'], [6, 'check'], [8, 'ordered'], [9, 'seated'], [12, 'check']];
  plan.forEach(([n, st]) => {
    const t = db.tables.find((x) => x.number === n);
    const s = openSession(t);
    s.startedAt = Date.now() - seed.rnd(5, 50) * 60000; s.lastAt = Date.now();
    const g = seed.rnd(1, 3);
    for (let i = 0; i < g; i++) s.guests.push({ id: id('g'), name: names[(n + i) % 8], avatar: A[(n + i) % 8] });
    if (st !== 'seated') {
      const picks = seed.rnd(2, 5);
      const items = [];
      for (let i = 0; i < picks; i++) {
        const it = seed.pick(db.items);
        items.push({ id: id('l'), guestId: s.guests[i % g].id, itemId: it.id, name: it.name, name_ar: it.name_ar, emoji: it.emoji, price: it.price, qty: seed.rnd(1, 2), note: '' });
      }
      s.orders.push({ id: id('o'), at: Date.now() - 20 * 60000, status: st === 'check' ? 'served' : seed.pick(['received', 'kitchen', 'kitchen', 'served']), items });
      log(s, 'ordered', 'First order sent to kitchen');
    }
    if (st === 'urgent') { s.requests.push({ id: id('r'), type: 'urgent', at: Date.now() - 60000, done: false }); log(s, 'request', 'Speed up order'); }
    if (st === 'check') {
      s.check = { method: seed.pick(['cash', 'card']), split: seed.pick(['table', 'self', 'custom']), tipPct: 10, at: Date.now() - 90000 };
      s.requests.push({ id: id('r'), type: 'bill', at: Date.now() - 90000, done: false });
      log(s, 'check', 'Check requested');
    }
  });
}

if (typeof needSeed !== 'undefined') seedLiveSessions();

// ---------- Snapshots & broadcast ----------
const clients = new Set();
const view = (s) => ({ ...s, bill: bill(s) });
function snapshotFor(c) {
  const config = { settings: db.settings, categories: db.categories, items: db.items, tables: c.role === 'admin' ? db.tables : db.tables.map(({ key, ...r }) => r) };
  if (c.role !== 'customer') config.reservations = (db.reservations || []).filter((r) => r.at > Date.now() - 3 * 3600000);
  if (c.role === 'customer') {
    const t = db.tables.find((x) => x.number === c.tableNumber);
    const s = t && db.sessions[t.id];
    return { t: 'state', config, session: s ? view(s) : null, tableNumber: c.tableNumber };
  }
  const sessions = {};
  Object.values(db.sessions).forEach((s) => (sessions[s.tableId] = view(s)));
  const states = {};
  db.tables.forEach((t) => (states[t.id] = tableState(t)));
  return { t: 'state', config, sessions, states, simulate };
}
function broadcast() {
  touch(); save();
  clients.forEach((c) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(snapshotFor(c))));
}
function alertCaptains(kind, tableNumber, text) {
  // kept on the record so polling clients (serverless mode) can pick them up; also pushed over websockets
  const now = Date.now();
  rec.alerts = (rec.alerts || []).filter((a) => now - a.at < 120000).slice(-30);
  rec.alertSeq = (rec.alertSeq || 0) + 1;
  rec.alerts.push({ id: rec.alertSeq, kind, tableNumber, text, at: now });
  if (onAlert) onAlert({ kind, tableNumber, text, at: now });
  const m = JSON.stringify({ t: 'alert', kind, tableNumber, text, at: now });
  clients.forEach((c) => c.role === 'captain' && c.ws.readyState === 1 && c.ws.send(m));
}

// ---------- WebSocket logic ----------
function handle(c, m) {
  if (m.t === 'join') {
    if (c.joined) return;
    if (m.role !== 'customer' && !c.authed) return;
    c.joined = true;
    c.role = m.role;
    if (m.role === 'customer') {
      c.tableNumber = +m.tableNumber;
      const t = db.tables.find((x) => x.number === c.tableNumber);
      if (!t) return c.ws.send(JSON.stringify({ t: 'error', msg: 'Unknown table' }));
      const known = db.sessions[t.id] && db.sessions[t.id].guests.find((x) => x.id === m.guestId);
      if (!known && !keyOk(t, m.key)) return c.ws.send(JSON.stringify({ t: 'error', msg: 'scan' }));
      const s = openSession(t); s.lastAt = Date.now(); s.idle = false;
      let g = s.guests.find((x) => x.id === m.guestId);
      if (!g) { g = { id: id('g'), name: m.name || 'Guest', avatar: m.avatar || '🙂' }; s.guests.push(g); log(s, 'join', `${g.avatar} ${g.name} joined`); }
      else { g.name = m.name || g.name; g.avatar = m.avatar || g.avatar; }
      c.guestId = g.id;
      c.ws.send(JSON.stringify({ t: 'you', guestId: g.id }));
    }
    return broadcast();
  }
  if (c.role === 'customer') {
    const t = db.tables.find((x) => x.number === c.tableNumber);
    const s = t && db.sessions[t.id];
    if (!s) return;
    s.lastAt = Date.now(); s.idle = false;
    switch (m.t) {
      case 'profile': { const g = s.guests.find((x) => x.id === c.guestId); if (g) { g.name = String(m.name || g.name).slice(0, 20); g.avatar = String(m.avatar || g.avatar).slice(0, 8); } break; }
      case 'cart_add': {
        const it = db.items.find((x) => x.id === m.itemId); if (!it || it.soldOut) break;
        const ex = s.cart.find((l) => l.itemId === it.id && l.guestId === c.guestId && !l.note);
        if (ex) { if (ex.qty < 20) ex.qty++; }
        else if (s.cart.length < 40) s.cart.push({ id: id('l'), guestId: c.guestId, itemId: it.id, name: it.name, name_ar: it.name_ar, emoji: it.emoji, price: it.price, qty: 1, note: '' });
        break;
      }
      case 'cart_qty': {
        const l = s.cart.find((x) => x.id === m.id); if (!l) break;
        l.qty += m.d > 0 ? (l.qty < 20 ? 1 : 0) : -1; if (l.qty <= 0) s.cart = s.cart.filter((x) => x !== l); break;
      }
      case 'cart_note': { const l = s.cart.find((x) => x.id === m.id); if (l) l.note = String(m.note || '').slice(0, 140); break; }
      case 'send_order': {
        // each guest sends their own items straight to the table order; scope 'all' sends everyone's pending items
        const want = m.scope === 'all' ? s.cart.slice() : s.cart.filter((l) => l.guestId === c.guestId);
        if (!want.length) break;
        const first = !s.orders.length;
        s.cart = s.cart.filter((l) => !want.includes(l));
        const mine = takeStock(want);
        if (!mine.length) break;
        s.orders.push({ id: id('o'), at: Date.now(), status: 'received', items: mine, by: c.guestId });
        s.check = null; s.requests = s.requests.filter((r) => r.type !== 'bill' || r.done);
        const g = s.guests.find((x) => x.id === c.guestId);
        log(s, 'ordered', `${g ? g.avatar + ' ' + g.name : 'Guest'} added ${mine.reduce((n, l) => n + l.qty, 0)} item(s)` + (first ? ' (first order)' : ''));
        alertCaptains('order', t.number, `${g ? g.name : 'Guest'} ordered at table ${t.number}`);
        break;
      }
      case 'order_item_remove': {
        // a guest may withdraw their own item until the kitchen starts it
        for (const o of s.orders) {
          const i = o.items.findIndex((x) => x.id === m.id && x.guestId === c.guestId);
          if (i >= 0 && o.status === 'received') { putStock(o.items[i].itemId, o.items[i].qty, 'return', 'guest removed'); o.items.splice(i, 1); if (!o.items.length) s.orders = s.orders.filter((x) => x !== o); log(s, 'ordered', 'Guest removed an item'); break; }
        }
        break;
      }
      case 'request': {
        const labels = { waiter: 'Call waiter', water: 'Water / napkins', urgent: 'Speed up order' };
        if (!labels[m.type] || s.requests.some((r) => r.type === m.type && !r.done)) break;
        const gq = s.guests.find((x) => x.id === c.guestId); if (gq) { gq.cd ||= {}; if (Date.now() - (gq.cd[m.type] || 0) < 45000) break; gq.cd[m.type] = Date.now(); }
        s.requests.push({ id: id('r'), type: m.type, at: Date.now(), done: false, by: c.guestId });
        log(s, 'request', labels[m.type]);
        alertCaptains(m.type === 'urgent' ? 'urgent' : 'request', t.number, `Table ${t.number}: ${labels[m.type]}`);
        break;
      }
      case 'check': {
        if (!s.orders.length) break;
        s.check = { method: m.method === 'card' ? 'card' : 'cash', split: ['self', 'table', 'custom'].includes(m.split) ? m.split : 'table', tipPct: +m.tipPct || 0, custom: m.custom || null, by: c.guestId, at: Date.now() };
        if (!s.requests.some((r) => r.type === 'bill' && !r.done)) s.requests.push({ id: id('r'), type: 'bill', at: Date.now(), done: false });
        log(s, 'check', `Check requested (${s.check.split}, ${s.check.method})`);
        alertCaptains('check', t.number, `Table ${t.number} requests the check (${s.check.method}, ${s.check.split})`);
        break;
      }
      case 'check_cancel': s.check = null; s.requests = s.requests.filter((r) => r.type !== 'bill'); break;
    }
    return broadcast();
  }
  if (c.role === 'kitchen') {
    if (m.t === 'order_status' && ['kitchen', 'served'].includes(m.status)) setStatus(c, m);
    return broadcast();
  }
  if (c.role === 'captain') {
    switch (m.t) {
      case 'order_status': setStatus(c, m); break;
      case 'resolve_request': {
        const s = db.sessions[m.tableId]; const r = s?.requests.find((x) => x.id === m.id);
        if (r) { r.done = true; log(s, 'handled', `Request ${r.type} handled` + (c.staffName ? ' by ' + c.staffName : '')); bump(c, 'handled'); bump(c, 'respMs', Math.max(0, Date.now() - r.at)); }
        break;
      }
      case 'close_table': { const t = tableOf(m.tableId); if (t) { bump(c, 'closed'); closeSession(t, m.unpaid ? 'unpaid' : m.method, c.staffName, m.pay); } break; }
      case 'open_ticket': {
        // takeaway / delivery order that is not tied to a table
        if (!['takeaway', 'delivery'].includes(m.kind) || !/^tk_[a-z0-9]{6,14}$/.test(String(m.tid || '')) || db.sessions[m.tid]) break;
        db.ticketSeq = (db.ticketSeq || 0) + 1;
        const s = { id: id('s'), tableId: m.tid, tableNumber: (m.kind === 'delivery' ? 'DL-' : 'TA-') + db.ticketSeq, kind: m.kind, startedAt: Date.now(), lastAt: Date.now(), guests: [], cart: [], orders: [], requests: [], check: null, log: [],
          customer: { name: String(m.name || '').slice(0, 30), phone: String(m.phone || '').slice(0, 20), address: String(m.address || '').slice(0, 140) } };
        s.guests.push({ id: 'cust', name: s.customer.name || (m.kind === 'delivery' ? 'Delivery' : 'Takeaway'), avatar: m.kind === 'delivery' ? '🛵' : '🛍️' });
        db.sessions[m.tid] = s; log(s, 'seated', `${m.kind} ticket ${s.tableNumber} opened` + (c.staffName ? ' by ' + c.staffName : '')); break;
      }
      case 'staff_order': {
        const t = db.tables.find((x) => x.id === m.tableId); let s = db.sessions[m.tableId];
        if (!s && t) s = openSession(t); if (!s) break;
        const want = [];
        (Array.isArray(m.items) ? m.items : []).slice(0, 40).forEach((x) => {
          const it = db.items.find((y) => y.id === x.itemId); const q = Math.min(20, Math.floor(+x.qty));
          if (!it || it.soldOut || !(q > 0)) return;
          want.push({ id: id('l'), guestId: null, itemId: it.id, name: it.name, name_ar: it.name_ar, emoji: it.emoji, price: it.price, qty: q, note: String(x.note || '').slice(0, 140) });
        });
        if (!want.length) break;
        let g = s.guests.find((x) => x.id === m.guestId) || s.guests[0];
        if (!g) { g = { id: 'staff', name: 'Staff', avatar: '🧑‍🍳' }; s.guests.push(g); }
        const lines = takeStock(want, c.staffName); if (!lines.length) break;
        lines.forEach((l) => (l.guestId = g.id));
        s.orders.push({ id: id('o'), at: Date.now(), status: 'received', items: lines, by: 'staff', staff: c.staffName || '' });
        s.check = null; s.requests = s.requests.filter((r) => r.type !== 'bill' || r.done); s.lastAt = Date.now(); s.idle = false;
        log(s, 'ordered', `${c.staffName || 'Staff'} took an order (${lines.reduce((n, l) => n + l.qty, 0)} item(s))`); bump(c, 'taken'); break;
      }
      case 'void_item': {
        const s = db.sessions[m.tableId]; if (!s) break;
        for (const o of s.orders) {
          const i = o.items.findIndex((x) => x.id === m.itemId); if (i < 0) continue;
          const it = o.items[i], q = Math.min(it.qty, Math.max(1, Math.floor(+m.qty) || it.qty));
          (s.voids ||= []).push({ name: it.name, qty: q, price: it.price, reason: String(m.reason || '').slice(0, 80), waste: !!m.waste, by: c.staffName || '', at: Date.now() });
          if (!m.waste) putStock(it.itemId, q, 'return', 'voided: ' + String(m.reason || '').slice(0, 40), c.staffName);
          it.qty -= q; if (it.qty <= 0) o.items.splice(i, 1); if (!o.items.length) s.orders = s.orders.filter((x) => x !== o);
          log(s, 'void', `${q}× ${it.name} voided${m.reason ? ' (' + String(m.reason).slice(0, 80) + ')' : ''}` + (c.staffName ? ' by ' + c.staffName : '')); break;
        }
        break;
      }
      case 'discount': {
        const s = db.sessions[m.tableId]; if (!s) break;
        const v = Math.max(0, +m.value || 0), type = m.type === 'amt' ? 'amt' : 'pct';
        if (!v) { s.discount = null; log(s, 'discount', 'Discount removed'); break; }
        const capSet = db.settings.discountCapPct, cap = c.adm ? 100 : (capSet === undefined || capSet === '' || capSet === null ? 20 : Math.max(0, +capSet));
        const gross = bill(s).gross, pct = type === 'pct' ? v : gross ? v / gross * 100 : 0;
        if (pct > cap) { c.ws.send(JSON.stringify({ t: 'notice', msg: `Discounts above ${cap}% need the owner` })); break; }
        s.discount = { type, value: v, reason: String(m.reason || '').slice(0, 60), by: c.staffName || '' };
        log(s, 'discount', `Discount ${type === 'pct' ? v + '%' : v}${m.reason ? ' (' + String(m.reason).slice(0, 60) + ')' : ''}` + (c.staffName ? ' by ' + c.staffName : '')); break;
      }
      case 'move_table': {
        const a = db.sessions[m.from], to = db.tables.find((x) => x.id === m.to);
        if (!a || !to || db.sessions[to.id] || a.kind) break;
        delete db.sessions[m.from]; a.tableId = to.id; a.tableNumber = to.number; db.sessions[to.id] = a;
        log(a, 'moved', `Moved to table ${to.number}` + (c.staffName ? ' by ' + c.staffName : '')); break;
      }
      case 'merge_tables': {
        const a = db.sessions[m.from], b = db.sessions[m.to];
        if (!a || !b || a === b || a.kind || b.kind) break;
        a.guests.forEach((g) => { if (!b.guests.some((x) => x.id === g.id)) b.guests.push(g); });
        b.orders.push(...a.orders); b.cart.push(...a.cart); b.requests.push(...a.requests.filter((r) => !r.done)); b.voids = (b.voids || []).concat(a.voids || []);
        if (!b.discount && a.discount) b.discount = a.discount;
        b.orders.sort((x, y) => x.at - y.at); b.startedAt = Math.min(a.startedAt, b.startedAt); b.check = null;
        log(b, 'merged', `Table ${a.tableNumber} merged into ${b.tableNumber}` + (c.staffName ? ' by ' + c.staffName : '')); delete db.sessions[m.from]; break;
      }
      case 'res_add': {
        const t = db.tables.find((x) => x.id === m.tableId), at = +m.at; if (!t || !(at > 0)) break;
        db.reservations.push({ id: id('rv'), tableId: t.id, tableNumber: t.number, name: String(m.name || 'Guest').slice(0, 30), phone: String(m.phone || '').slice(0, 20), guests: Math.min(50, Math.max(1, Math.floor(+m.guests) || 2)), at, note: String(m.note || '').slice(0, 100), by: c.staffName || '' });
        db.reservations = db.reservations.filter((r) => r.at > Date.now() - 3 * 3600000).slice(-300); break;
      }
      case 'res_del': db.reservations = (db.reservations || []).filter((r) => r.id !== m.id); break;
      case 'res_seat': {
        const r = (db.reservations || []).find((x) => x.id === m.id), t = r && db.tables.find((x) => x.id === r.tableId); if (!t) break;
        const s = openSession(t); s.lastAt = Date.now(); if (!s.guests.length) s.guests.push({ id: 'cust', name: r.name, avatar: '📅' });
        log(s, 'seated', `Reservation for ${r.name} seated`); db.reservations = db.reservations.filter((x) => x !== r); break;
      }
      case 'seat_table': { const t = db.tables.find((x) => x.id === m.tableId); if (t) { const s = openSession(t); s.lastAt = Date.now(); } break; }
      case 'sim': simulate = !!m.on; break;
    }
    return broadcast();
  }
}
function setStatus(c, m) {
  for (const s of Object.values(db.sessions)) {
    const o = s.orders.find((x) => x.id === m.orderId); if (!o) continue;
    if (!['received', 'kitchen', 'served', 'closed'].includes(m.status)) return;
    o.status = m.status; log(s, 'status', `Order ${m.status}` + (c.staffName ? ' by ' + c.staffName : ''));
    if (m.status === 'kitchen') bump(c, 'started');
    if (m.status === 'served') { bump(c, 'served'); alertCaptains('ready', s.tableNumber, `Table ${s.tableNumber}: order is ready`); }
    return;
  }
}

// ---------- Simulator (fake guests so the demo is alive) ----------
function tick() {
  if (!simulate) return;
  const r = Math.random();
  const empties = db.tables.filter((t) => !db.sessions[t.id]);
  const act = Object.values(db.sessions).filter((x) => !x.kind);
  if (r < 0.25 && empties.length) {
    const t = seed.pick(empties); const s = openSession(t);
    s.guests.push({ id: id('g'), name: seed.pick(['Hassan', 'Dina', 'Tamer', 'Salma', 'Mostafa']), avatar: seed.pick(['🦁', '🐯', '🧑‍🚀', '🎧', '🐧']) });
    alertCaptains('seat', t.number, `Guests seated at table ${t.number}`);
  } else if (act.length) {
    const s = seed.pick(act); const t = db.tables.find((x) => x.id === s.tableId);
    if (!s.guests.length) return;
    if (!s.orders.length || r < 0.45) {
      const items = []; const n = seed.rnd(1, 3);
      for (let i = 0; i < n; i++) { const it = seed.pick(db.items); items.push({ id: id('l'), guestId: seed.pick(s.guests).id, itemId: it.id, name: it.name, name_ar: it.name_ar, emoji: it.emoji, price: it.price, qty: 1, note: seed.pick(['', '', 'No sugar', 'Extra hot', 'Less ice']) }); }
      s.orders.push({ id: id('o'), at: Date.now(), status: 'received', items }); s.check = null;
      log(s, 'ordered', 'Order sent to kitchen'); alertCaptains('order', t.number, `New order from table ${t.number}`);
    } else if (r < 0.65) {
      const type = seed.pick(['waiter', 'water', 'urgent']);
      if (!s.requests.some((q) => q.type === type && !q.done)) { s.requests.push({ id: id('r'), type, at: Date.now(), done: false }); log(s, 'request', type); alertCaptains(type === 'urgent' ? 'urgent' : 'request', t.number, `Table ${t.number}: ${type}`); }
    } else if (r < 0.8 && !s.check && s.orders.every((o) => o.status === 'served' || o.status === 'closed')) {
      s.check = { method: seed.pick(['cash', 'card']), split: seed.pick(['table', 'self', 'custom']), tipPct: 10, at: Date.now() };
      s.requests.push({ id: id('r'), type: 'bill', at: Date.now(), done: false }); log(s, 'check', 'Check requested');
      alertCaptains('check', t.number, `Table ${t.number} requests the check`);
    }
  }
  broadcast();
}

function analytics(days = 7) {
  const since = Date.now() - days * 86400000;
  const H = db.history.filter((h) => h.closedAt >= since && !h.unpaid);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const revenue = {
    gross: sum(H, (h) => h.sub), service: sum(H, (h) => h.service), tax: sum(H, (h) => h.tax), tips: sum(H, (h) => h.tip), total: sum(H, (h) => h.total),
    cash: sum(H, (h) => (h.pay ? h.pay.cash : h.method === 'cash' ? h.total : 0)), card: sum(H, (h) => (h.pay ? h.pay.card : h.method === 'card' ? h.total : 0)), discounts: sum(H, (h) => h.discount || 0), sessions: H.length,
  };
  const itemMap = {}, catMap = {};
  H.forEach((h) => h.items.forEach((l) => {
    const a = (itemMap[l.name] ||= { name: l.name, qty: 0, revenue: 0, profit: 0 }); a.qty += l.qty; a.revenue += l.qty * l.price; a.profit += l.qty * (l.price - l.cost);
    const cat = db.categories.find((c) => c.id === l.cat); const cn = cat ? cat.name : 'Other';
    const b = (catMap[cn] ||= { name: cn, revenue: 0, profit: 0 }); b.revenue += l.qty * l.price; b.profit += l.qty * (l.price - l.cost);
  }));
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  const perTable = {};
  H.forEach((h) => { const d = new Date(h.startedAt); heat[d.getDay()][d.getHours()]++; perTable[h.tableNumber] = (perTable[h.tableNumber] || 0) + 1; });
  const durs = H.map((h) => (h.closedAt - h.startedAt) / 60000);
  const avgOcc = durs.length ? sum(durs, (x) => x) / durs.length : 0;
  // gaps between consecutive sessions on same table, same day
  const gaps = [];
  const byT = {}; H.forEach((h) => (byT[h.tableId] ||= []).push(h));
  Object.values(byT).forEach((arr) => { arr.sort((a, b) => a.startedAt - b.startedAt); for (let i = 1; i < arr.length; i++) { const g = (arr[i].startedAt - arr[i - 1].closedAt) / 60000; if (g >= 0 && g < 240) gaps.push(g); } });
  const avgGap = gaps.length ? sum(gaps, (x) => x) / gaps.length : 0;
  const openMin = 14 * 60 * days * Math.max(1, db.tables.length);
  const occupancy = Math.min(100, sum(durs, (x) => x) / openMin * 100);
  const daily = {};
  H.forEach((h) => { const k = new Date(h.closedAt).toISOString().slice(0, 10); daily[k] = (daily[k] || 0) + h.total; });
  const audit = [...db.history.slice(-40).reverse().map((h) => ({ tableNumber: h.tableNumber, startedAt: h.startedAt, orderedAt: h.orderedAt, checkAt: h.checkAt, closedAt: h.closedAt, total: h.total, guests: h.guests, method: h.method })),];
  Object.values(db.sessions).forEach((s) => audit.unshift({ tableNumber: s.tableNumber, startedAt: s.startedAt, orderedAt: s.orders[0]?.at, checkAt: s.check?.at, closedAt: null, total: bill(s).total, guests: s.guests.length, method: s.check?.method || '—', live: true }));
  return {
    days, revenue, turnover: { avgOccupiedMin: avgOcc, avgEmptyGapMin: avgGap, turnsPerTablePerDay: H.length / Math.max(1, db.tables.length) / days, occupancyPct: occupancy },
    topItems: Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 8),
    categories: Object.values(catMap).sort((a, b) => b.profit - a.profit),
    heat, perTable, daily, audit,
  };
}

  function seedLive() { seedLiveSessions(); }
  return { rec, db, clients, ensure, sweep, handle, broadcast, snapshotFor, bill, analytics, seedLive, tick, openSession, setSim: (v) => (simulate = !!v), get simulate() { return simulate; }, liveCount: () => Object.keys(db.sessions).length };
}
module.exports = { createTenant, freshData, clone };
