const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const multer = require('multer');
const store = require('./store');
const auth = require('./auth');
const { createTenant, freshData } = require('./tenant');

const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

const tenants = new Map(); // slug -> tenant
let uid = Date.now();
const newId = (p) => p + (uid++).toString(36);
const SLUG = /^[a-z0-9][a-z0-9-]{1,29}$/;

// ---------- Super admin credentials ----------
let SUPER = { email: process.env.SUPER_EMAIL, hash: process.env.SUPER_PASSWORD ? auth.hash(process.env.SUPER_PASSWORD) : null };
function setupSuper() {
  if (SUPER.email && SUPER.hash) return;
  const f = path.join(__dirname, 'data', 'super.json');
  try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); SUPER = { email: j.email, hash: j.hash }; return; } catch {}
  const pw = auth.randomPassword();
  SUPER = { email: 'super@local.dev', hash: auth.hash(pw) };
  if (!PROD) fs.writeFileSync(f, JSON.stringify(SUPER));
  console.log(`\n  *** SUPERADMIN created ***\n  email: ${SUPER.email}\n  password: ${pw}\n  (set SUPER_EMAIL / SUPER_PASSWORD env vars to choose your own)\n`);
}

// ---------- Tenant management ----------
function mount(rec) {
  const t = createTenant(rec, store.save);
  tenants.set(rec.slug, t);
  return t;
}
function makeRecord({ name, slug, email, password, plan = 'standard', demo = false }) {
  return {
    id: newId('r'), slug, name, plan, status: 'active', createdAt: Date.now(), lastActive: null,
    owner: { email: String(email).toLowerCase(), hash: auth.hash(password) }, pin: auth.pin(),
    data: freshData(demo),
  };
}
async function bootstrap() {
  await store.init();
  setupSuper();
  (await store.loadAll()).forEach(mount);
  if (!tenants.has('demo') && !PROD) {
    const rec = makeRecord({ name: 'Demo Café', slug: 'demo', email: 'demo@demo.com', password: 'demo123', demo: true });
    rec.pin = '1234'; rec.data.settings.name = 'Demo Café';
    const t = mount(rec); t.seedLive(); store.save(rec);
  }
}

// ---------- Auth helpers ----------
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer /, '') || req.query.token;
function needAdmin(req, res, next) {
  const d = auth.verify(bearer(req));
  if (!d) return res.status(401).json({ error: 'auth' });
  if (d.r !== 'super' && !(d.s === req.params.slug && d.r === 'admin')) return res.status(403).json({ error: 'forbidden' });
  next();
}
function tenantMw(req, res, next) {
  const t = tenants.get(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Unknown restaurant' });
  if (t.rec.status !== 'active') return res.status(403).json({ error: 'This restaurant is currently suspended' });
  req.tenant = t; next();
}

// ---------- HTTP ----------
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/sortable.js', express.static(require.resolve('sortablejs/Sortable.min.js')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist/chart.umd.js')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const page = (f) => (req, res) => res.sendFile(path.join(__dirname, 'public', f));

app.get('/super', page('super.html'));
app.get('/r/:slug', page('tenant.html'));
app.get('/r/:slug/t/:n', page('customer.html'));
app.get('/r/:slug/captain', page('captain.html'));
app.get('/r/:slug/admin', page('admin.html'));
app.get('/health', (req, res) => res.send('ok'));

function lanIP() {
  for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs) if (i.family === 'IPv4' && !i.internal) return i.address;
  return 'localhost';
}
const origin = (req) => (process.env.PUBLIC_URL || (PROD ? `${req.protocol}://${req.get('host')}` : `http://${lanIP()}:${PORT}`)).replace(/\/$/, '');

app.get('/api/public/demo', (req, res) => res.json(!PROD && tenants.has('demo') ? { slug: 'demo', email: 'demo@demo.com', password: 'demo123', pin: '1234' } : null));

// ----- Super admin API -----
app.post('/api/super/login', (req, res) => {
  const key = 'super:' + req.ip;
  if (auth.throttled(key)) return res.status(429).json({ error: 'Too many attempts, try later' });
  const { email, password } = req.body || {};
  if (String(email).toLowerCase() === SUPER.email.toLowerCase() && auth.check(password, SUPER.hash)) { auth.ok(key); return res.json({ token: auth.sign('super', '*', 3) }); }
  auth.fail(key); res.status(401).json({ error: 'Invalid credentials' });
});
const needSuper = (req, res, next) => { const d = auth.verify(bearer(req)); if (!d || d.r !== 'super') return res.status(401).json({ error: 'auth' }); next(); };
const DAY = 86400000;
function tenantStats(t, days = 30) {
  const since = Date.now() - days * DAY;
  const H = t.db.history.filter((h) => h.closedAt >= since);
  const revenue = H.reduce((n, h) => n + h.total, 0);
  const live = Object.values(t.db.sessions);
  return {
    id: t.rec.id, slug: t.rec.slug, name: t.rec.name, plan: t.rec.plan, status: t.rec.status, createdAt: t.rec.createdAt, lastActive: t.rec.lastActive,
    email: t.rec.owner.email, items: t.db.items.length, tables: t.db.tables.length,
    revenue, sessions: H.length, avgTicket: H.length ? revenue / H.length : 0, liveTables: live.length, liveRevenue: live.reduce((n, s) => n + t.bill(s).total, 0),
    guestsLive: live.reduce((n, s) => n + s.guests.length, 0), online: t.clients.size, currency: t.db.settings.currency,
  };
}
app.get('/api/super/overview', needSuper, (req, res) => {
  const list = [...tenants.values()].map((t) => tenantStats(t));
  const daily = {}, hours = Array(24).fill(0), items = {};
  tenants.forEach((t) => t.db.history.filter((h) => h.closedAt >= Date.now() - 30 * DAY).forEach((h) => {
    const k = new Date(h.closedAt).toISOString().slice(0, 10); daily[k] = (daily[k] || 0) + h.total; hours[new Date(h.startedAt).getHours()]++;
    h.items.forEach((l) => { items[l.name] = (items[l.name] || 0) + l.qty; });
  }));
  const sum = (f) => list.reduce((n, x) => n + f(x), 0);
  res.json({
    totals: { restaurants: list.length, active: list.filter((x) => x.status === 'active').length, revenue: sum((x) => x.revenue), sessions: sum((x) => x.sessions), liveTables: sum((x) => x.liveTables), guestsLive: sum((x) => x.guestsLive), online: sum((x) => x.online), liveRevenue: sum((x) => x.liveRevenue) },
    tenants: list.sort((a, b) => b.revenue - a.revenue), daily, hours,
    topItems: Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 8),
  });
});
app.post('/api/super/tenants', needSuper, (req, res) => {
  const b = req.body || {}; const slug = String(b.slug || '').toLowerCase().trim();
  if (!SLUG.test(slug) || ['super', 'api', 'admin', 'vendor', 'uploads'].includes(slug)) return res.status(400).json({ error: 'Slug must be 2–30 chars: a-z, 0-9, dashes' });
  if (tenants.has(slug)) return res.status(400).json({ error: 'That slug is taken' });
  if (!b.name || !/^\S+@\S+$/.test(b.email || '')) return res.status(400).json({ error: 'Name and valid owner email required' });
  const password = b.password || auth.randomPassword();
  const rec = makeRecord({ name: b.name, slug, email: b.email, password, plan: b.plan || 'standard', demo: !!b.demo });
  rec.data.settings.name = b.name;
  const t = mount(rec); if (b.demo) t.seedLive(); store.save(rec);
  res.json({ slug, email: rec.owner.email, password, pin: rec.pin, url: `${origin(req)}/r/${slug}/admin` });
});
app.put('/api/super/tenants/:slug', needSuper, (req, res) => {
  const t = tenants.get(req.params.slug); if (!t) return res.status(404).json({});
  ['name', 'plan', 'status'].forEach((k) => { if (req.body[k] !== undefined) t.rec[k] = req.body[k]; });
  if (t.rec.status !== 'active') t.clients.forEach((c) => c.ws.close());
  store.save(t.rec); res.json(tenantStats(t));
});
app.post('/api/super/tenants/:slug/reset', needSuper, (req, res) => {
  const t = tenants.get(req.params.slug); if (!t) return res.status(404).json({});
  const password = auth.randomPassword(); t.rec.owner.hash = auth.hash(password); t.rec.pin = auth.pin(); store.save(t.rec);
  res.json({ email: t.rec.owner.email, password, pin: t.rec.pin });
});
app.post('/api/super/tenants/:slug/impersonate', needSuper, (req, res) => res.json({ token: auth.sign('admin', req.params.slug, 1) }));
app.delete('/api/super/tenants/:slug', needSuper, async (req, res) => {
  const t = tenants.get(req.params.slug); if (!t) return res.status(404).json({});
  t.clients.forEach((c) => c.ws.close()); tenants.delete(t.rec.slug); await store.remove(t.rec.id); res.json({ ok: 1 });
});

// ----- Per-restaurant public API -----
const R = '/api/r/:slug';
app.get(`${R}/config`, tenantMw, (req, res) => { const d = req.tenant.db; res.json({ settings: d.settings, categories: d.categories, items: d.items, tables: d.tables }); });
app.get(`${R}/info`, tenantMw, (req, res) => res.json({ base: origin(req) + '/r/' + req.params.slug }));
app.get(`${R}/qr/:n.png`, tenantMw, async (req, res) => {
  const base = String(req.query.base || origin(req) + '/r/' + req.params.slug).replace(/\/$/, '');
  res.type('png').send(await QRCode.toBuffer(`${base}/t/${req.params.n}`, { width: 600, margin: 2, color: { dark: '#111111', light: '#ffffff' } }));
});
app.get(`${R}/menu/template.xlsx`, (req, res) => {
  const ws = XLSX.utils.json_to_sheet([{ category: 'Hot Coffee', category_ar: 'قهوة ساخنة', name: 'Mocha', name_ar: 'موكا', price: 85, cost: 20, emoji: '☕', description: 'Chocolate espresso' }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Menu');
  res.setHeader('Content-Disposition', 'attachment; filename=menu-template.xlsx');
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});
app.post(`${R}/login`, tenantMw, (req, res) => {
  const t = req.tenant, { role, email, password, pin } = req.body || {};
  const key = `${req.params.slug}:${role}:${req.ip}`;
  if (auth.throttled(key)) return res.status(429).json({ error: 'Too many attempts, try again in a few minutes' });
  if (role === 'admin' && String(email).toLowerCase() === t.rec.owner.email && auth.check(password, t.rec.owner.hash)) { auth.ok(key); return res.json({ token: auth.sign('admin', t.rec.slug) }); }
  if (role === 'captain' && String(pin) === String(t.rec.pin)) { auth.ok(key); return res.json({ token: auth.sign('captain', t.rec.slug, 2) }); }
  auth.fail(key); res.status(401).json({ error: 'Invalid credentials' });
});
app.get(`${R}/me`, tenantMw, (req, res) => {
  const d = auth.verify(bearer(req)); const want = req.query.role;
  const ok = d && (d.r === 'super' || (d.s === req.params.slug && (d.r === want || d.r === 'admin')));
  ok ? res.json({ ok: 1, name: req.tenant.rec.name }) : res.status(401).json({ error: 'auth' });
});

// ----- Admin API (owner of this restaurant, or superadmin) -----
const A = (m, p, ...h) => app[m](`${R}${p}`, tenantMw, needAdmin, ...h);
const bc = (req) => req.tenant.broadcast();
A('get', '/account', (req, res) => res.json({ name: req.tenant.rec.name, email: req.tenant.rec.owner.email, pin: req.tenant.rec.pin, plan: req.tenant.rec.plan }));
A('post', '/account', (req, res) => {
  const r = req.tenant.rec, b = req.body || {};
  if (b.pin) { if (!/^\d{4,8}$/.test(b.pin)) return res.status(400).json({ error: 'PIN must be 4–8 digits' }); r.pin = b.pin; }
  if (b.password) { if (String(b.password).length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' }); r.owner.hash = auth.hash(b.password); }
  store.save(r); res.json({ ok: 1, pin: r.pin });
});
A('post', '/settings', (req, res) => { const d = req.tenant.db; const b = req.body || {}; delete b.presets; Object.assign(d.settings, b); bc(req); res.json(d.settings); });

A('post', '/categories', (req, res) => { const d = req.tenant.db; const c = { id: newId('c'), name: req.body.name || 'New', name_ar: req.body.name_ar || '', emoji: req.body.emoji || '🍽️' }; d.categories.push(c); bc(req); res.json(c); });
A('put', '/categories/order', (req, res) => { const d = req.tenant.db, o = req.body.ids || []; d.categories.sort((a, b) => o.indexOf(a.id) - o.indexOf(b.id)); bc(req); res.json({ ok: 1 }); });
A('put', '/categories/:id', (req, res) => { const c = req.tenant.db.categories.find((x) => x.id === req.params.id); if (c) Object.assign(c, req.body, { id: c.id }); bc(req); res.json(c); });
A('delete', '/categories/:id', (req, res) => { const d = req.tenant.db; d.categories = d.categories.filter((x) => x.id !== req.params.id); d.items = d.items.filter((i) => i.cat !== req.params.id); bc(req); res.json({ ok: 1 }); });

A('post', '/items', (req, res) => { const d = req.tenant.db; const b = req.body; const i = { id: newId('i'), cat: b.cat, name: b.name || 'New item', name_ar: b.name_ar || '', price: +b.price || 0, cost: +b.cost || 0, emoji: b.emoji || '🍽️', desc: b.desc || '', img: '' }; d.items.push(i); bc(req); res.json(i); });
A('put', '/items/:id', (req, res) => { const i = req.tenant.db.items.find((x) => x.id === req.params.id); if (i) { Object.assign(i, req.body, { id: i.id }); i.price = +i.price; i.cost = +i.cost; } bc(req); res.json(i); });
A('delete', '/items/:id', (req, res) => { const d = req.tenant.db; d.items = d.items.filter((x) => x.id !== req.params.id); bc(req); res.json({ ok: 1 }); });
A('post', '/items/:id/image', upload.single('image'), (req, res) => {
  const i = req.tenant.db.items.find((x) => x.id === req.params.id);
  if (!i || !req.file) return res.status(400).json({ error: 'bad request' });
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(req.file.mimetype)) return res.status(400).json({ error: 'Unsupported image type' });
  if (req.file.size > 700 * 1024) return res.status(400).json({ error: 'Image too large (max 700KB)' });
  // stored inline so it survives redeploys and stays isolated per restaurant
  i.img = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`; bc(req); res.json({ ok: 1 });
});
A('post', '/menu/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const d = req.tenant.db;
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let added = 0;
    const key = (r, k) => { const f = Object.keys(r).find((x) => x.trim().toLowerCase() === k); return f ? r[f] : ''; };
    rows.forEach((r) => {
      const name = String(key(r, 'name')).trim(); if (!name) return;
      const cn = String(key(r, 'category')).trim() || 'Imported';
      let cat = d.categories.find((c) => c.name.toLowerCase() === cn.toLowerCase());
      if (!cat) { cat = { id: newId('c'), name: cn, name_ar: String(key(r, 'category_ar')), emoji: '🍽️' }; d.categories.push(cat); }
      d.items.push({ id: newId('i'), cat: cat.id, name, name_ar: String(key(r, 'name_ar')), price: +key(r, 'price') || 0, cost: +key(r, 'cost') || 0, emoji: String(key(r, 'emoji')) || '🍽️', desc: String(key(r, 'description')), img: '' });
      added++;
    });
    bc(req); res.json({ added });
  } catch (e) { res.status(400).json({ error: 'Could not parse file: ' + e.message }); }
});

A('post', '/tables', (req, res) => { const d = req.tenant.db; const n = Math.max(0, ...d.tables.map((t) => t.number)) + 1; const t = { id: newId('t'), number: n, x: 1, y: 1, shape: 'square', seats: 4 }; d.tables.push(t); bc(req); res.json(t); });
A('put', '/tables/:id', (req, res) => { const t = req.tenant.db.tables.find((x) => x.id === req.params.id); if (t) Object.assign(t, req.body, { id: t.id }); bc(req); res.json(t); });
A('delete', '/tables/:id', (req, res) => { const d = req.tenant.db; d.tables = d.tables.filter((x) => x.id !== req.params.id); delete d.sessions[req.params.id]; bc(req); res.json({ ok: 1 }); });
A('get', '/analytics', (req, res) => res.json(req.tenant.analytics(+req.query.days || 7)));

// ---------- WebSocket ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => {
  const c = { ws, role: null, joined: false, authed: false };
  let tenant = null;
  ws.on('message', (d) => {
    try {
      const m = JSON.parse(d);
      if (!tenant) {
        if (m.t !== 'join') return;
        tenant = tenants.get(m.slug);
        if (!tenant || tenant.rec.status !== 'active') { ws.send(JSON.stringify({ t: 'error', msg: tenant ? 'This restaurant is suspended' : 'Unknown restaurant' })); tenant = null; return ws.close(); }
        if (m.role !== 'customer') {
          const a = auth.verify(m.token);
          const ok = a && (a.r === 'super' || (a.s === m.slug && (a.r === m.role || a.r === 'admin')));
          if (!ok) { ws.send(JSON.stringify({ t: 'error', msg: 'auth' })); tenant = null; return ws.close(); }
          c.authed = true;
        }
        tenant.clients.add(c);
      }
      tenant.handle(c, m);
    } catch (e) { console.error(e); }
  });
  ws.on('close', () => tenant && tenant.clients.delete(c));
});
setInterval(() => tenants.forEach((t) => t.simulate && t.tick()), 6000);

bootstrap().then(() => server.listen(PORT, () => {
  console.log(`\n  Digital Menu Platform on port ${PORT}\n   Landing     http://localhost:${PORT}\n   Super admin http://localhost:${PORT}/super\n   Demo place  http://localhost:${PORT}/r/demo/admin  (demo@demo.com / demo123, captain PIN 1234)\n   LAN         http://${lanIP()}:${PORT}\n`);
}));
