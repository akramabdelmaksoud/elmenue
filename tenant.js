const seed = require('./data');

const clone = (o) => JSON.parse(JSON.stringify(o));
function freshData(demo) {
  return { settings: clone(seed.settings), categories: clone(seed.categories), items: clone(seed.items), tables: clone(seed.tables), sessions: {}, history: demo ? seed.buildHistory() : [] };
}

// A tenant = one restaurant with its own menu, tables, sessions, history, websocket clients.
function createTenant(rec, persist) {
  const db = rec.data;
  let simulate = false;
  let uid = Date.now() * 1000 + Math.floor(Math.random() * 1000000);
  const id = (p) => p + (uid++).toString(36);
  const save = () => persist(rec);
  const touch = () => (rec.lastActive = Date.now());

// ---------- Billing ----------
function bill(s) {
  const st = db.settings;
  const by = {};
  s.guests.forEach((g) => (by[g.id] = { sub: 0, items: [] }));
  let sub = 0;
  s.orders.forEach((o) => o.items.forEach((it) => {
    const v = it.price * it.qty; sub += v;
    (by[it.guestId] ||= { sub: 0, items: [] }); by[it.guestId].sub += v; by[it.guestId].items.push(it);
  }));
  const calc = (x) => {
    const service = +(x * st.service / 100).toFixed(2);
    const tax = +((x + service) * st.tax / 100).toFixed(2);
    return { sub: x, service, tax, total: +(x + service + tax).toFixed(2) };
  };
  Object.keys(by).forEach((k) => Object.assign(by[k], calc(by[k].sub)));
  return { ...calc(sub), byGuest: by };
}

function tableState(t) {
  const s = db.sessions[t.id];
  if (!s) return 'empty';
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

function closeSession(t, method) {
  const s = db.sessions[t.id]; if (!s) return;
  const b = bill(s);
  const lines = {};
  s.orders.forEach((o) => o.items.forEach((i) => {
    const m = db.items.find((x) => x.id === i.itemId);
    const l = (lines[i.itemId] ||= { itemId: i.itemId, cat: m?.cat, name: i.name, qty: 0, price: i.price, cost: m?.cost || 0 });
    l.qty += i.qty;
  }));
  const tip = s.check ? Math.round(b.sub * (s.check.tipPct || 0) / 100) : 0;
  log(s, 'closed', 'Table paid and cleared');
  if (s.orders.length) {
    db.history.push({
      id: id('h'), tableId: t.id, tableNumber: t.number, startedAt: s.startedAt,
      orderedAt: s.orders[0].at, checkAt: s.check?.at || Date.now(), closedAt: Date.now(),
      guests: s.guests.length || 1, items: Object.values(lines), sub: b.sub, service: b.service, tax: b.tax, tip,
      total: +(b.total + tip).toFixed(2), method: method || s.check?.method || 'cash', split: s.check?.split || 'table', log: s.log,
    });
  }
  delete db.sessions[t.id];
}

function seedLiveSessions() {
  const A = ['😎', '🧑‍🎤', '🦊', '🐼', '🎮', '👩‍🎨', '🧔', '🐱'];
  const names = ['Ahmed', 'Sara', 'Omar', 'Mona', 'Youssef', 'Laila', 'Karim', 'Nour'];
  const plan = [[1, 'seated'], [2, 'ordered'], [3, 'ordered'], [5, 'urgent'], [6, 'check'], [8, 'ordered'], [9, 'seated'], [12, 'check']];
  plan.forEach(([n, st]) => {
    const t = db.tables.find((x) => x.number === n);
    const s = openSession(t);
    s.startedAt = Date.now() - seed.rnd(5, 50) * 60000;
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
  const config = { settings: db.settings, categories: db.categories, items: db.items, tables: db.tables };
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
      const s = openSession(t);
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
    switch (m.t) {
      case 'profile': { const g = s.guests.find((x) => x.id === c.guestId); if (g) { g.name = String(m.name || g.name).slice(0, 20); g.avatar = String(m.avatar || g.avatar).slice(0, 8); } break; }
      case 'cart_add': {
        const it = db.items.find((x) => x.id === m.itemId); if (!it) break;
        const ex = s.cart.find((l) => l.itemId === it.id && l.guestId === c.guestId && !l.note);
        if (ex) ex.qty++;
        else s.cart.push({ id: id('l'), guestId: c.guestId, itemId: it.id, name: it.name, name_ar: it.name_ar, emoji: it.emoji, price: it.price, qty: 1, note: '' });
        break;
      }
      case 'cart_qty': {
        const l = s.cart.find((x) => x.id === m.id); if (!l) break;
        l.qty += m.d; if (l.qty <= 0) s.cart = s.cart.filter((x) => x !== l); break;
      }
      case 'cart_note': { const l = s.cart.find((x) => x.id === m.id); if (l) l.note = String(m.note || '').slice(0, 140); break; }
      case 'send_order': {
        // each guest sends their own items straight to the table order; scope 'all' sends everyone's pending items
        const mine = m.scope === 'all' ? s.cart.slice() : s.cart.filter((l) => l.guestId === c.guestId);
        if (!mine.length) break;
        const first = !s.orders.length;
        s.cart = s.cart.filter((l) => !mine.includes(l));
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
          if (i >= 0 && o.status === 'received') { o.items.splice(i, 1); if (!o.items.length) s.orders = s.orders.filter((x) => x !== o); log(s, 'ordered', 'Guest removed an item'); break; }
        }
        break;
      }
      case 'request': {
        const labels = { waiter: 'Call waiter', water: 'Water / napkins', urgent: 'Speed up order' };
        if (!labels[m.type] || s.requests.some((r) => r.type === m.type && !r.done)) break;
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
  if (c.role === 'captain') {
    const findOrder = () => { for (const s of Object.values(db.sessions)) { const o = s.orders.find((x) => x.id === m.orderId); if (o) return [s, o]; } return []; };
    switch (m.t) {
      case 'order_status': {
        const [s, o] = findOrder(); if (!o) break;
        o.status = m.status; log(s, 'status', `Order ${m.status}`); break;
      }
      case 'resolve_request': {
        const s = db.sessions[m.tableId]; const r = s?.requests.find((x) => x.id === m.id);
        if (r) { r.done = true; log(s, 'handled', `Request ${r.type} handled`); }
        break;
      }
      case 'close_table': { const t = db.tables.find((x) => x.id === m.tableId); if (t) closeSession(t, m.method); break; }
      case 'seat_table': { const t = db.tables.find((x) => x.id === m.tableId); if (t) openSession(t); break; }
      case 'sim': simulate = !!m.on; break;
    }
    return broadcast();
  }
}

// ---------- Simulator (fake guests so the demo is alive) ----------
function tick() {
  if (!simulate) return;
  const r = Math.random();
  const empties = db.tables.filter((t) => !db.sessions[t.id]);
  const act = Object.values(db.sessions);
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
  const H = db.history.filter((h) => h.closedAt >= since);
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const revenue = {
    gross: sum(H, (h) => h.sub), service: sum(H, (h) => h.service), tax: sum(H, (h) => h.tax), tips: sum(H, (h) => h.tip), total: sum(H, (h) => h.total),
    cash: sum(H.filter((h) => h.method === 'cash'), (h) => h.total), card: sum(H.filter((h) => h.method === 'card'), (h) => h.total), sessions: H.length,
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
  return { rec, db, clients, handle, broadcast, snapshotFor, bill, analytics, seedLive, tick, openSession, setSim: (v) => (simulate = !!v), get simulate() { return simulate; }, liveCount: () => Object.keys(db.sessions).length };
}
module.exports = { createTenant, freshData, clone };
