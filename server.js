require('./env');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const multer = require('multer');
const store = require('./store');
const auth = require('./auth');
const { createTenant, freshData } = require('./tenant');

const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
try { fs.mkdirSync(process.env.DATA_DIR || path.join(__dirname, 'data'), { recursive: true }); } catch {}
const STATELESS = !!(process.env.STATELESS || process.env.VERCEL);   // serverless: no websockets, no in-memory state

const tenants = new Map(); // slug -> tenant
let uid = Date.now() * 1000 + Math.floor(Math.random() * 1000000);
const newId = (p) => p + (uid++).toString(36);
const SLUG = /^[a-z0-9][a-z0-9-]{1,29}$/;

// ---------- Super admin credentials ----------
let SUPER = { email: process.env.SUPER_EMAIL, hash: process.env.SUPER_PASSWORD ? auth.hash(process.env.SUPER_PASSWORD) : null };
function setupSuper() {
  if (process.env.SINGLE_RESTAURANT) return;
  if (SUPER.email && SUPER.hash) return;
  const f = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'super.json');
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
    id: SINGLE ? MAIN : newId('r'), slug, name, plan, status: 'active', createdAt: Date.now(), lastActive: null,
    owner: { email: String(email).toLowerCase(), hash: auth.hash(password) }, pin: auth.pin(),
    data: freshData(demo),
  };
}
async function bootstrap() {
  await store.init();
  setupSuper();
  (await store.loadAll()).forEach(mount);
  if (SINGLE && !tenants.size && process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
    const rec = makeRecord({ name: process.env.RESTAURANT_NAME || 'My Restaurant', slug: MAIN, email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD, demo: !!process.env.DEMO_DATA });
    rec.data.settings.name = rec.name; const t = mount(rec); if (process.env.DEMO_DATA) t.seedLive(); store.save(rec);
  }
  if (!SINGLE && !tenants.has('demo') && !PROD) {
    const rec = makeRecord({ name: 'Demo CafÃ©', slug: 'demo', email: 'demo@demo.com', password: 'demo123', demo: true });
    rec.pin = '1234'; rec.data.settings.name = 'Demo CafÃ©';
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
// Stateless mode: load the tenant fresh from storage for every request, commit (compare-and-swap) before replying.
async function loadFresh() {
  let got = await store.getRec(MAIN);
  if (!got && process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
    const rec = makeRecord({ name: process.env.RESTAURANT_NAME || 'My Restaurant', slug: MAIN, email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD, demo: !!process.env.DEMO_DATA });
    rec.data.settings.name = rec.name;
    await createRecord(rec, !!process.env.DEMO_DATA);
    got = await store.getRec(MAIN);
  }
  if (!got) return null;
  const t = createTenant(got.rec, () => { t.dirty = true; });
  t.ver = got.ver; t.dirty = false;
  return t;
}
async function createRecord(rec, demo) {
  const hist = rec.data.history; rec.data.history = [];
  const ok = await store.putRec(rec, null);
  if (ok && hist.length) await store.appendHist(rec.id, hist);
  if (ok && demo) { const g = await store.getRec(MAIN); const t = createTenant(g.rec, () => { t.dirty = true; }); t.seedLive(); await store.putRec(g.rec, g.ver); }
  return ok;
}
async function commit(t) {
  t.dirty = false;
  const hist = t.db.history; t.db.history = [];
  const ok = await store.putRec(t.rec, t.ver);
  if (!ok) { t.db.history = hist; return false; }
  t.ver++;
  if (hist.length) await store.appendHist(t.rec.id, hist);
  return true;
}
function flushBeforeReply(res, t) {
  for (const m of ['json', 'send']) {
    const orig = res[m].bind(res);
    res[m] = (...a) => {
      if (!t.dirty) return orig(...a);
      commit(t).then((ok) => (ok ? orig(...a) : res.status(409).json({ error: 'busy', retry: true }))).catch((e) => res.status(500).json({ error: e.message }));
      return res;
    };
  }
}
async function tenantMw(req, res, next) {
  try {
    let t;
    if (STATELESS) {
      if (req.params.slug !== MAIN) return res.status(404).json({ error: 'Unknown restaurant' });
      t = await loadFresh();
      if (!t) return res.status(404).json({ error: 'Not set up yet' });
      flushBeforeReply(res, t);
    } else t = tenants.get(req.params.slug);
    if (!t) return res.status(404).json({ error: 'Unknown restaurant' });
    if (t.rec.status !== 'active') return res.status(403).json({ error: 'This restaurant is currently suspended' });
    req.tenant = t; next();
  } catch (e) { next(e); }
}

// ---------- HTTP ----------
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
const SINGLE = !!process.env.SINGLE_RESTAURANT, MAIN = 'main';
if (SINGLE) {
  // One install = one restaurant: clean URLs (/admin, /captain, /t/5) that map to the single tenant
  const sendPub = (f) => (req, res) => res.sendFile(path.join(__dirname, 'public', f));
  const isSetup = async () => (STATELESS ? !!(await store.getRec(MAIN)) || !!(process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) : tenants.size > 0);
  app.get('/', async (req, res, next) => { try { res.redirect((await isSetup()) ? '/r/' + MAIN : '/setup'); } catch (e) { next(e); } });
  app.get('/setup', async (req, res, next) => { try { (await isSetup()) ? res.redirect('/admin') : sendPub('setup.html')(req, res); } catch (e) { next(e); } });
  app.get('/admin', (req, res) => res.redirect('/r/' + MAIN + '/admin'));
  app.get('/captain', (req, res) => res.redirect('/r/' + MAIN + '/captain'));
  app.get('/t/:n', (req, res) => res.redirect('/r/' + MAIN + '/t/' + encodeURIComponent(req.params.n)));
  app.get('/index.html', (req, res) => res.redirect('/'));
  app.get('/api/setup/status', async (req, res) => { try { res.json({ setup: await isSetup(), needsKey: !!process.env.SETUP_KEY }); } catch (e) { res.status(500).json({ error: 'Server error' }); } });
  app.post('/api/setup', async (req, res) => {
    try {
      if (await isSetup()) return res.status(403).json({ error: 'Already set up' });
      if (process.env.SETUP_KEY && req.body.setupKey !== process.env.SETUP_KEY) return res.status(403).json({ error: 'Wrong setup key' });
      const b = req.body || {};
      if (!b.name || !/^\S+@\S+$/.test(b.email || '') || String(b.password || '').length < 6) return res.status(400).json({ error: 'Name, valid email and a 6+ character password are required' });
      const rec = makeRecord({ name: b.name, slug: MAIN, email: b.email, password: b.password, demo: !!b.demo });
      rec.data.settings.name = b.name; if (b.currency) rec.data.settings.currency = String(b.currency).slice(0, 6);
      if (['bloom', 'espresso', 'pink', 'white'].includes(b.theme)) rec.data.settings.theme = b.theme;
      if (['en', 'ar'].includes(b.lang)) rec.data.settings.lang = b.lang;
      if (STATELESS) { if (!(await createRecord(rec, !!b.demo))) return res.status(403).json({ error: 'Already set up' }); }
      else { const t = mount(rec); if (b.demo) t.seedLive(); store.save(rec); }
      res.json({ token: auth.sign('admin', MAIN), pin: rec.pin });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/sortable.js', express.static(require.resolve('sortablejs/Sortable.min.js')));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js/dist/chart.umd.js')));
if (!SINGLE) app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'platform.html')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const page = (f) => (req, res) => res.sendFile(path.join(__dirname, 'public', f));

if (!SINGLE) app.get('/super', page('super.html'));
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

app.get('/api/public/demo', (req, res) => res.json(!SINGLE && !PROD && tenants.has('demo') ? { slug: 'demo', email: 'demo@demo.com', password: 'demo123', pin: '1234' } : null));

// ----- Super admin API -----
app.post('/api/super/login', (req, res) => {
  if (SINGLE) return res.status(404).json({});
  const key = 'super:' + req.ip;
  if (auth.throttled(key)) return res.status(429).json({ error: 'Too many attempts, try later' });
  const { email, password } = req.body || {};
  if (String(email).toLowerCase() === SUPER.email.toLowerCase() && auth.check(password, SUPER.hash)) { auth.ok(key); return res.json({ token: auth.sign('super', '*', 3) }); }
  auth.fail(key); res.status(401).json({ error: 'Invalid credentials' });
});
const needSuper = (req, res, next) => { if (SINGLE) return res.status(404).json({}); const d = auth.verify(bearer(req)); if (!d || d.r !== 'super') return res.status(401).json({ error: 'auth' }); next(); };
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
  if (!SLUG.test(slug) || ['super', 'api', 'admin', 'vendor', 'uploads'].includes(slug)) return res.status(400).json({ error: 'Slug must be 2â€“30 chars: a-z, 0-9, dashes' });
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
  const ws = XLSX.utils.json_to_sheet([{ category: 'Hot Coffee', category_ar: 'Ù‚Ù‡ÙˆØ© Ø³Ø§Ø®Ù†Ø©', name: 'Mocha', name_ar: 'Ù…ÙˆÙƒØ§', price: 85, cost: 20, emoji: 'â˜•', description: 'Chocolate espresso' }]);
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
  if (b.pin) { if (!/^\d{4,8}$/.test(b.pin)) return res.status(400).json({ error: 'PIN must be 4â€“8 digits' }); r.pin = b.pin; }
  if (b.password) { if (String(b.password).length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' }); r.owner.hash = auth.hash(b.password); }
  req.tenant.broadcast(); res.json({ ok: 1, pin: r.pin });
});
A('post', '/settings', (req, res) => { const d = req.tenant.db; const b = req.body || {}; delete b.presets; Object.assign(d.settings, b); bc(req); res.json(d.settings); });

A('post', '/categories', (req, res) => { const d = req.tenant.db; const c = { id: newId('c'), name: req.body.name || 'New', name_ar: req.body.name_ar || '', emoji: req.body.emoji || 'ðŸ½ï¸' }; d.categories.push(c); bc(req); res.json(c); });
A('put', '/categories/order', (req, res) => { const d = req.tenant.db, o = req.body.ids || []; d.categories.sort((a, b) => o.indexOf(a.id) - o.indexOf(b.id)); bc(req); res.json({ ok: 1 }); });
A('put', '/categories/:id', (req, res) => { const c = req.tenant.db.categories.find((x) => x.id === req.params.id); if (c) Object.assign(c, req.body, { id: c.id }); bc(req); res.json(c); });
A('delete', '/categories/:id', (req, res) => { const d = req.tenant.db; d.categories = d.categories.filter((x) => x.id !== req.params.id); d.items = d.items.filter((i) => i.cat !== req.params.id); bc(req); res.json({ ok: 1 }); });

A('post', '/items', (req, res) => { const d = req.tenant.db; const b = req.body; const i = { id: newId('i'), cat: b.cat, name: b.name || 'New item', name_ar: b.name_ar || '', price: +b.price || 0, cost: +b.cost || 0, emoji: b.emoji || 'ðŸ½ï¸', desc: b.desc || '', img: '' }; d.items.push(i); bc(req); res.json(i); });
A('put', '/items/:id', (req, res) => { const i = req.tenant.db.items.find((x) => x.id === req.params.id); if (i) { Object.assign(i, req.body, { id: i.id }); i.price = +i.price; i.cost = +i.cost; } bc(req); res.json(i); });
A('delete', '/items/:id', (req, res) => { const d = req.tenant.db; d.items = d.items.filter((x) => x.id !== req.params.id); bc(req); res.json({ ok: 1 }); });
A('post', '/items/:id/image', upload.single('image'), async (req, res) => {
  const i = req.tenant.db.items.find((x) => x.id === req.params.id);
  if (!i || !req.file) return res.status(400).json({ error: 'bad request' });
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(req.file.mimetype)) return res.status(400).json({ error: 'Unsupported image type' });
  if (req.file.size > 700 * 1024) return res.status(400).json({ error: 'Image too large (max 700KB)' });
  const key = `${req.tenant.rec.id}-${i.id}-${Date.now().toString(36)}`;
  await store.putBlob(key, `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`);
  i.img = `/api/r/${req.params.slug}/img/${key}`; bc(req); res.json({ ok: 1 });
});
app.get(`${R}/img/:key`, async (req, res) => {
  const d = await store.getBlob(req.params.key); const m = d && /^data:([\w/+.-]+);base64,(.*)$/.exec(d);
  if (!m) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type(m[1]).send(Buffer.from(m[2], 'base64'));
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
      if (!cat) { cat = { id: newId('c'), name: cn, name_ar: String(key(r, 'category_ar')), emoji: 'ðŸ½ï¸' }; d.categories.push(cat); }
      d.items.push({ id: newId('i'), cat: cat.id, name, name_ar: String(key(r, 'name_ar')), price: +key(r, 'price') || 0, cost: +key(r, 'cost') || 0, emoji: String(key(r, 'emoji')) || 'ðŸ½ï¸', desc: String(key(r, 'description')), img: '' });
      added++;
    });
    bc(req); res.json({ added });
  } catch (e) { res.status(400).json({ error: 'Could not parse file: ' + e.message }); }
});

A('post', '/tables', (req, res) => { const d = req.tenant.db; const n = Math.max(0, ...d.tables.map((t) => t.number)) + 1; const t = { id: newId('t'), number: n, x: 1, y: 1, shape: 'square', seats: 4 }; d.tables.push(t); bc(req); res.json(t); });
A('put', '/tables/:id', (req, res) => { const t = req.tenant.db.tables.find((x) => x.id === req.params.id); if (t) Object.assign(t, req.body, { id: t.id }); bc(req); res.json(t); });
A('delete', '/tables/:id', (req, res) => { const d = req.tenant.db; d.tables = d.tables.filter((x) => x.id !== req.params.id); delete d.sessions[req.params.id]; bc(req); res.json({ ok: 1 }); });
A('get', '/analytics', async (req, res) => { if (STATELESS) req.tenant.db.history = await store.getHist(req.tenant.rec.id); res.json(req.tenant.analytics(+req.query.days || 7)); });

// ---------- Polling transport (used when websockets are unavailable, e.g. Vercel) ----------
// One call = optional message + fresh snapshot. Retries automatically on write conflicts.
app.post(`${R}/rpc`, async (req, res) => {
  const j = req.body || {}, jn = j.join || {};
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const t = STATELESS ? await loadFresh() : tenants.get(req.params.slug);
      if (!t || (STATELESS && req.params.slug !== MAIN)) return res.status(404).json({ error: 'Unknown restaurant' });
      if (t.rec.status !== 'active') return res.status(403).json({ error: 'This restaurant is suspended' });
      const out = [];
      const c = { ws: { readyState: 1, send: (d) => out.push(JSON.parse(d)) }, role: null, joined: false, authed: false };
      if (jn.role !== 'customer') {
        const a = auth.verify(jn.token);
        if (!a || !(a.r === 'super' || (a.s === req.params.slug && (a.r === jn.role || a.r === 'admin')))) return res.status(401).json({ error: 'auth' });
        c.authed = true;
      }
      if (jn.role === 'customer') {
        const tb = t.db.tables.find((x) => x.number === +jn.tableNumber);
        const s = tb && t.db.sessions[tb.id];
        if (!tb) return res.status(404).json({ error: 'Unknown table' });
        const known = s && s.guests.find((g) => g.id === jn.guestId);
        if (known) { c.role = 'customer'; c.joined = true; c.tableNumber = tb.number; c.guestId = known.id; }
        else t.handle(c, { t: 'join', role: 'customer', tableNumber: jn.tableNumber, guestId: jn.guestId, name: jn.name, avatar: jn.avatar });
      } else t.handle(c, { t: 'join', role: jn.role });
      if (j.msg) t.handle(c, j.msg);
      if (t.dirty && !(await commit(t))) continue;     // conflict -> reload and replay
      const state = t.snapshotFor(c);
      const alerts = jn.role === 'captain' && j.since >= 0 ? (t.rec.alerts || []).filter((a) => a.id > j.since) : [];
      return res.json({ state, guestId: c.guestId || null, alerts, alertSeq: t.rec.alertSeq || 0 });
    }
    res.status(409).json({ error: 'busy' });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

// ---------- WebSocket ----------
// Never leak storage status codes; give a readable hint when the Supabase table has not been created yet
app.use((err, req, res, next) => {
  console.error(err);
  const msg = /PGRST205|public\.tenants/.test(String(err.message)) ? 'Database not ready: run the setup SQL in Supabase (see README), then reload.' : 'Server error';
  res.status(500).json({ error: msg });
});
if (require.main === module && !STATELESS) {
  const { WebSocketServer } = require('ws');
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
  })).catch((e) => { console.error('\n  STARTUP FAILED: ' + e.message); process.exit(1); });
} else if (require.main === module) {
  // stateless but run directly (local test of the serverless mode)
  store.init().then(() => app.listen(PORT, () => console.log(`\n  Stateless mode (polling) on http://localhost:${PORT}\n`))).catch((e) => { console.error('STARTUP FAILED: ' + e.message); process.exit(1); });
}
module.exports = app;
