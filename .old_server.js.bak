const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const multer = require('multer');
const seed = require('./data');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ---------- State ----------
let db;
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = null; }
}
if (!db) {
  db = {
    settings: seed.settings, categories: seed.categories, items: seed.items, tables: seed.tables,
    sessions: {}, history: seed.buildHistory(),
  };
  var needSeed = true;
}
let simulate = false;
let uid = Date.now();
const id = (p) => p + (uid++).toString(36);
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(DB_FILE, JSON.stringify(db), () => {}), 800); };

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
  save();
  clients.forEach((c) => c.ws.readyState === 1 && c.ws.send(JSON.stringify(snapshotFor(c))));
}
function alertCaptains(kind, tableNumber, text) {
  const m = JSON.stringify({ t: 'alert', kind, tableNumber, text, at: Date.now() });
  clients.forEach((c) => c.role === 'captain' && c.ws.readyState === 1 && c.ws.send(m));
}

// ---------- WebSocket logic ----------
function handle(c, m) {
  if (m.t === 'join') {
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
setInterval(() => {
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
}, 6000);

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/sortable.js', express.static(require.resolve('sortablejs/Sortable.min.js')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist/chart.umd.js')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const page = (f) => (req, res) => res.sendFile(path.join(__dirname, 'public', f));
app.get('/t/:n', page('customer.html'));
app.get('/captain', page('captain.html'));
app.get('/admin', page('admin.html'));

function lanIP() {
  for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs) if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}
const baseUrl = (req) => (req.query.base || `http://${lanIP()}:${PORT}`).replace(/\/$/, '');

app.get('/api/qr/:n.png', async (req, res) => {
  const buf = await QRCode.toBuffer(`${baseUrl(req)}/t/${req.params.n}`, { width: 600, margin: 2, color: { dark: '#111111', light: '#ffffff' } });
  res.type('png').send(buf);
});
app.get('/api/config', (req, res) => res.json({ settings: db.settings, categories: db.categories, items: db.items, tables: db.tables }));
app.get('/api/info', (req, res) => res.json({ base: baseUrl(req), lan: lanIP(), port: PORT }));

// settings
app.post('/api/settings', (req, res) => { Object.assign(db.settings, req.body); broadcast(); res.json(db.settings); });

// categories
app.post('/api/categories', (req, res) => { const c = { id: id('c'), name: req.body.name || 'New', name_ar: req.body.name_ar || '', emoji: req.body.emoji || '🍽️' }; db.categories.push(c); broadcast(); res.json(c); });
app.put('/api/categories/order', (req, res) => { const o = req.body.ids; db.categories.sort((a, b) => o.indexOf(a.id) - o.indexOf(b.id)); broadcast(); res.json({ ok: 1 }); });
app.put('/api/categories/:id', (req, res) => { const c = db.categories.find((x) => x.id === req.params.id); if (c) Object.assign(c, req.body, { id: c.id }); broadcast(); res.json(c); });
app.delete('/api/categories/:id', (req, res) => { db.categories = db.categories.filter((x) => x.id !== req.params.id); db.items = db.items.filter((i) => i.cat !== req.params.id); broadcast(); res.json({ ok: 1 }); });

// items
app.post('/api/items', (req, res) => { const i = { id: id('i'), cat: req.body.cat, name: req.body.name || 'New item', name_ar: req.body.name_ar || '', price: +req.body.price || 0, cost: +req.body.cost || 0, emoji: req.body.emoji || '🍽️', desc: req.body.desc || '', img: '' }; db.items.push(i); broadcast(); res.json(i); });
app.put('/api/items/:id', (req, res) => { const i = db.items.find((x) => x.id === req.params.id); if (i) Object.assign(i, req.body, { id: i.id }); if (i) { i.price = +i.price; i.cost = +i.cost; } broadcast(); res.json(i); });
app.delete('/api/items/:id', (req, res) => { db.items = db.items.filter((x) => x.id !== req.params.id); broadcast(); res.json({ ok: 1 }); });
app.post('/api/items/:id/image', upload.single('image'), (req, res) => {
  const i = db.items.find((x) => x.id === req.params.id);
  if (!i || !req.file) return res.status(400).json({ error: 'bad request' });
  const ext = ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' })[req.file.mimetype];
  if (!ext) return res.status(400).json({ error: 'Unsupported image type' });
  const fn = `${i.id}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(UPLOADS, fn), req.file.buffer);
  i.img = '/uploads/' + fn; broadcast(); res.json(i);
});

// bulk import / template
app.post('/api/menu/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let added = 0;
    const key = (r, k) => { const f = Object.keys(r).find((x) => x.trim().toLowerCase() === k); return f ? r[f] : ''; };
    rows.forEach((r) => {
      const name = String(key(r, 'name')).trim(); if (!name) return;
      const cn = String(key(r, 'category')).trim() || 'Imported';
      let cat = db.categories.find((c) => c.name.toLowerCase() === cn.toLowerCase());
      if (!cat) { cat = { id: id('c'), name: cn, name_ar: String(key(r, 'category_ar')), emoji: '🍽️' }; db.categories.push(cat); }
      db.items.push({ id: id('i'), cat: cat.id, name, name_ar: String(key(r, 'name_ar')), price: +key(r, 'price') || 0, cost: +key(r, 'cost') || 0, emoji: String(key(r, 'emoji')) || '🍽️', desc: String(key(r, 'description')), img: String(key(r, 'image')) });
      added++;
    });
    broadcast(); res.json({ added });
  } catch (e) { res.status(400).json({ error: 'Could not parse file: ' + e.message }); }
});
app.get('/api/menu/template.xlsx', (req, res) => {
  const ws = XLSX.utils.json_to_sheet([{ category: 'Hot Coffee', category_ar: 'قهوة ساخنة', name: 'Mocha', name_ar: 'موكا', price: 85, cost: 20, emoji: '☕', description: 'Chocolate espresso' }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Menu');
  res.setHeader('Content-Disposition', 'attachment; filename=menu-template.xlsx');
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});

// tables
app.post('/api/tables', (req, res) => { const n = Math.max(0, ...db.tables.map((t) => t.number)) + 1; const t = { id: id('t'), number: n, x: 1, y: 1, shape: 'square', seats: 4 }; db.tables.push(t); broadcast(); res.json(t); });
app.put('/api/tables/:id', (req, res) => { const t = db.tables.find((x) => x.id === req.params.id); if (t) Object.assign(t, req.body, { id: t.id }); broadcast(); res.json(t); });
app.delete('/api/tables/:id', (req, res) => { db.tables = db.tables.filter((x) => x.id !== req.params.id); delete db.sessions[req.params.id]; broadcast(); res.json({ ok: 1 }); });

// analytics
app.get('/api/analytics', (req, res) => {
  const days = +req.query.days || 7;
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
  res.json({
    days, revenue, turnover: { avgOccupiedMin: avgOcc, avgEmptyGapMin: avgGap, turnsPerTablePerDay: H.length / Math.max(1, db.tables.length) / days, occupancyPct: occupancy },
    topItems: Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 8),
    categories: Object.values(catMap).sort((a, b) => b.profit - a.profit),
    heat, perTable, daily, audit,
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  const c = { ws, role: null };
  clients.add(c);
  ws.on('message', (d) => { try { handle(c, JSON.parse(d)); } catch (e) { console.error(e); } });
  ws.on('close', () => clients.delete(c));
});
server.listen(PORT, () => {
  console.log(`\n  Digital Menu running:\n   Home     http://localhost:${PORT}\n   Captain  http://localhost:${PORT}/captain\n   Admin    http://localhost:${PORT}/admin\n   LAN      http://${lanIP()}:${PORT}  (use this for phones)\n`);
});
