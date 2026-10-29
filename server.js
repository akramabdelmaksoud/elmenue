require('./env');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const multer = require('multer');
let webpush = null; try { webpush = require('web-push'); } catch {}
const store = require('./store');
const auth = require('./auth');
const { createTenant, freshData } = require('./tenant');
const F = require('./features');

const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
try { fs.mkdirSync(process.env.DATA_DIR || path.join(__dirname, 'data'), { recursive: true }); } catch {}
const STATELESS = !!(process.env.STATELESS || process.env.VERCEL);   // serverless: no websockets, no in-memory state

// ---------- Web push (captain / kitchen notifications that work with the phone locked) ----------
function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  const f = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'vapid.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  const k = webpush ? webpush.generateVAPIDKeys() : { publicKey: '', privateKey: '' };
  try { fs.writeFileSync(f, JSON.stringify(k)); } catch {}
  return k;
}
const VAPID = vapidKeys();
if (webpush && VAPID.publicKey) webpush.setVapidDetails('mailto:' + (process.env.VAPID_CONTACT || 'admin@example.com'), VAPID.publicKey, VAPID.privateKey);
const PUSH_TITLE = { order: '🍽️ New order', urgent: '🚨 Urgent request', check: '🧾 Check requested', request: '🔔 Guest request', ready: '✅ Order ready' };
async function sendPush(rec, alerts) {
  const dead = [];
  if (!webpush || !VAPID.publicKey || !alerts.length || !(rec.pushSubs || []).length) return dead;
  await Promise.all(rec.pushSubs.flatMap((ps) => alerts.filter((a) => PUSH_TITLE[a.kind] && (ps.role !== 'kitchen' || a.kind === 'order')).map(async (a) => {
    try { await webpush.sendNotification(ps.sub, JSON.stringify({ title: PUSH_TITLE[a.kind], body: a.text, tag: a.kind + a.tableNumber, url: ps.role === 'kitchen' ? '/kitchen' : '/captain', urgent: a.kind === 'urgent' }), { TTL: 120, urgency: 'high' }); }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(ps.sub.endpoint); }
  })));
  return dead;
}
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
  const t = createTenant(rec, store.save, (a) => { sendPush(rec, [a]).then((dead) => { if (dead.length) { rec.pushSubs = rec.pushSubs.filter((x) => !dead.includes(x.sub.endpoint)); store.save(rec); } }).catch(() => {}); });
  tenants.set(rec.slug, t);
  if (t.ensure()) store.save(rec);
  return t;
}
function makeRecord({ name, slug, email, password, plan = 'operations', demo = false }) {
  return {
    id: SINGLE ? MAIN : STATELESS ? 'r_' + slug : newId('r'), slug, name, plan, status: 'active', createdAt: Date.now(), lastActive: null,
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
    const rec = makeRecord({ name: 'Demo Café', slug: 'demo', email: 'demo@demo.com', password: 'demo123', demo: true });
    rec.pin = '1234'; rec.data.settings.name = 'Demo Café'; rec.data.settings.requireKey = false;   // dev demo: open links work without a printed QR
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
async function loadFresh(slug) {
  let got = await store.getRec(SINGLE ? MAIN : 'r_' + slug);
  if (!got && process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD) {
    const rec = makeRecord({ name: process.env.RESTAURANT_NAME || 'My Restaurant', slug: MAIN, email: process.env.OWNER_EMAIL, password: process.env.OWNER_PASSWORD, demo: !!process.env.DEMO_DATA });
    rec.data.settings.name = rec.name;
    await createRecord(rec, !!process.env.DEMO_DATA);
    got = await store.getRec(MAIN);
  }
  if (!got) return null;
  const t = createTenant(got.rec, () => { t.dirty = true; }, (a) => t.pending.push(a));
  t.ver = got.ver; t.dirty = false; t.pending = [];
  if (t.ensure()) t.dirty = true;
  if (t.sweep()) t.dirty = true;
  return t;
}
async function createRecord(rec, demo) {
  const hist = rec.data.history; rec.data.history = [];
  const ok = await store.putRec(rec, null);
  if (ok && hist.length) await store.appendHist(rec.id, hist);
  if (ok && demo) { const g = await store.getRec(rec.id); const t = createTenant(g.rec, () => { t.dirty = true; }); t.seedLive(); await store.putRec(g.rec, g.ver); }
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
function flushBeforeReply(req, res, t) {
  for (const m of ['json', 'send']) {
    const orig = res[m].bind(res);
    res[m] = (...a) => {
      if (!t.dirty) return orig(...a);
      commit(t).then((ok) => (ok || req.method === 'GET' ? orig(...a) : res.status(409).json({ error: 'busy', retry: true }))).catch((e) => (req.method === 'GET' ? orig(...a) : res.status(500).json({ error: e.message })));
      return res;
    };
  }
}
async function tenantMw(req, res, next) {
  try {
    let t;
    if (STATELESS) {
      if (SINGLE && req.params.slug !== MAIN) return res.status(404).json({ error: 'Unknown restaurant' });
      if (!SINGLE && !SLUG.test(req.params.slug)) return res.status(404).json({ error: 'Unknown restaurant' });
      t = await loadFresh(req.params.slug);
      if (!t) return res.status(404).json({ error: 'Not set up yet' });
      flushBeforeReply(req, res, t);
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
  app.get('/kitchen', (req, res) => res.redirect('/r/' + MAIN + '/kitchen'));
  app.get('/cashier', (req, res) => res.redirect('/r/' + MAIN + '/cashier'));
  app.get('/t/:n', (req, res) => res.redirect('/r/' + MAIN + '/t/' + encodeURIComponent(req.params.n) + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')));
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
// custom domains: a café's own domain (set in the super admin) opens its landing page at /
let domCache = { at: 0, map: {} };
if (!SINGLE) app.get('/', async (req, res, next) => {
  try {
    if (Date.now() - domCache.at > 60000) { const recs = STATELESS ? await store.listRecs() : [...tenants.values()].map((t) => t.rec); domCache = { at: Date.now(), map: Object.fromEntries(recs.filter((r) => r.domain).map((r) => [r.domain, r.slug])) }; }
    const slug = domCache.map[String(req.hostname || '').toLowerCase()]; if (slug) return res.redirect(302, '/r/' + slug);
  } catch {}
  next();
});
if (!SINGLE) app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'platform.html')));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const page = (f) => (req, res) => res.sendFile(path.join(__dirname, 'public', f));
// the order engine is plain JS, so the in-browser demo can run the exact same code with nothing saved
app.get('/engine/:f', (req, res, next) => ['tenant.js', 'data.js', 'features.js'].includes(req.params.f) ? res.type('js').sendFile(path.join(__dirname, req.params.f)) : next());
// ---------- Showroom: one shared, server-backed demo café (opens from any browser / device) ----------
// Owner, waiter, kitchen, cashier and guests all talk to the same live data, so a sales demo can run across a laptop, an iPad and a phone.
// Only the café flagged rec.showroom can be opened without a password; every other café is untouched.
const SHOW = 'showroom', SHOW_PINS = { captain: '1111', kitchen: '2222', cashier: '3333' };
const showOn = () => process.env.SHOWROOM !== 'off' && (!SINGLE || process.env.SHOWROOM === 'on');
function makeShowRec() {
  const rec = makeRecord({ name: 'Maison Aurelia', slug: SHOW, email: 'demo@elmenu.app', password: auth.randomPassword(), plan: 'vip', demo: true });
  rec.data.settings.name = 'Maison Aurelia'; rec.pin = SHOW_PINS.captain; rec.showroom = true; rec.showSeed = Date.now();
  rec.staff = [['Wael', 'captain'], ['Chef Hany', 'kitchen'], ['Mona', 'cashier']].map(([name, role]) => ({ id: newId('u'), name, role, hash: auth.hash(SHOW_PINS[role]), active: true, createdAt: Date.now() }));
  return rec;
}
async function ensureShowroom(reset) {
  let t = STATELESS ? await loadFresh(SHOW) : tenants.get(SHOW);
  if (t && !t.rec.showroom) return null;                                   // never touch a real café that happens to use the slug
  if (t && (reset || Date.now() - (t.rec.showSeed || 0) > 6 * 3600000)) {
    if (STATELESS) { await store.remove(t.rec.id); await store.clearHist(t.rec.id); } else { t.clients.forEach((c) => c.ws.close()); tenants.delete(SHOW); await store.remove(t.rec.id); }
    t = null;
  }
  if (!t) {
    const rec = makeShowRec();
    if (STATELESS) { if (!(await createRecord(rec, true))) return await loadFresh(SHOW); t = await loadFresh(SHOW); }
    else { t = mount(rec); t.seedLive(); store.save(rec); }
  }
  return t;
}
app.get('/api/demo/info', async (req, res, next) => { try {
  if (!showOn()) return res.status(404).json({ error: 'off' });
  const t = await ensureShowroom(false); if (!t) return res.status(404).json({ error: 'off' });
  const free = t.db.tables.filter((x) => !t.db.sessions[x.id]).map((x) => x.number);
  res.json({ slug: SHOW, name: t.db.settings.name || 'Maison Aurelia', pins: SHOW_PINS, freeTables: free, tables: t.db.tables.map((x) => x.number), origin: origin(req) });
} catch (e) { next(e); } });
app.post('/api/demo/login', async (req, res, next) => { try {
  if (!showOn()) return res.status(404).json({ error: 'off' });
  const t = await ensureShowroom(false); if (!t) return res.status(404).json({ error: 'off' });
  const role = String(req.body && req.body.role || ''), names = { captain: 'Wael', kitchen: 'Chef Hany', cashier: 'Mona' };
  if (role === 'admin') return res.json({ slug: SHOW, token: auth.sign('admin', SHOW, 4) });
  if (!names[role]) return res.status(400).json({ error: 'bad role' });
  const who = (t.rec.staff || []).find((x) => x.role === role);
  res.json({ slug: SHOW, token: auth.sign(role, SHOW, 4, { u: who ? who.id : 'demo', n: names[role] }) });
} catch (e) { next(e); } });
app.post('/api/demo/reset', async (req, res, next) => { try {
  if (!showOn()) return res.status(404).json({ error: 'off' });
  const t = await ensureShowroom(true); res.json({ ok: !!t });
} catch (e) { next(e); } });
app.get('/api/demo/qr.png', async (req, res, next) => { try {
  if (!showOn()) return res.status(404).end();
  const u = String(req.query.u || ''); if (!u.startsWith(origin(req)) || u.length > 300) return res.status(400).end();   // only this site's own links
  res.type('png').set('Cache-Control', 'public, max-age=3600').send(await QRCode.toBuffer(u, { width: 520, margin: 2, color: { dark: '#111111', light: '#ffffff' } }));
} catch (e) { next(e); } });
app.get('/demo', page('showroom.html'));
app.get('/demo-local', page('demo.html'));

if (!SINGLE) app.get('/super', page('super.html'));
app.get('/r/:slug', page('tenant.html'));
app.get('/r/:slug/t/:n', page('customer.html'));
app.get('/r/:slug/captain', page('captain.html'));
app.get('/r/:slug/admin', page('admin.html'));
app.get('/r/:slug/kitchen', page('kitchen.html'));
app.get('/r/:slug/cashier', page('cashier.html'));
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
// every restaurant as a tenant object; on serverless they are rebuilt from storage (with their history) for each request
async function allTenants() {
  if (!STATELESS) return [...tenants.values()];
  const recs = await store.listRecs();
  return Promise.all(recs.map(async (rec) => { const t = createTenant(rec, () => {}); t.db.history = await store.getHist(rec.id); return t; }));
}
async function oneTenant(slug) { return STATELESS ? loadFresh(slug) : tenants.get(slug); }
async function saveTenant(t) { if (STATELESS) { t.dirty = true; return commit(t); } store.save(t.rec); return true; }
function tenantStats(t, days = 30) {
  const since = Date.now() - days * DAY;
  const H = t.db.history.filter((h) => h.closedAt >= since);
  const revenue = H.reduce((n, h) => n + h.total, 0);
  const live = Object.values(t.db.sessions);
  return {
    id: t.rec.id, slug: t.rec.slug, name: t.rec.name, plan: F.planOf(t.rec.plan), group: t.rec.group || '', domain: t.rec.domain || '', mrr: t.rec.status === 'active' ? F.monthly(t.rec.plan) : 0, status: t.rec.status, createdAt: t.rec.createdAt, lastActive: t.rec.lastActive,
    email: t.rec.owner.email, items: t.db.items.length, tables: t.db.tables.length, limits: F.limitsOf(t.rec.plan, t.rec.limits), limitOverride: t.rec.limits || null, staffCount: (t.rec.staff || []).length,
    revenue, sessions: H.length, avgTicket: H.length ? revenue / H.length : 0, liveTables: live.length, liveRevenue: live.reduce((n, s) => n + t.bill(s).total, 0),
    guestsLive: live.reduce((n, s) => n + s.guests.length, 0), online: t.clients.size, currency: t.db.settings.currency,
  };
}
app.get('/api/super/overview', needSuper, async (req, res, next) => { try {
  const all = await allTenants(), list = all.map((t) => tenantStats(t));
  const daily = {}, hours = Array(24).fill(0), items = {};
  all.forEach((t) => t.db.history.filter((h) => h.closedAt >= Date.now() - 30 * DAY).forEach((h) => {
    const k = new Date(h.closedAt).toISOString().slice(0, 10); daily[k] = (daily[k] || 0) + h.total; hours[new Date(h.startedAt).getHours()]++;
    h.items.forEach((l) => { items[l.name] = (items[l.name] || 0) + l.qty; });
  }));
  const sum = (f) => list.reduce((n, x) => n + f(x), 0);
  res.json({
    totals: { mrr: sum((x) => x.mrr), plans: ['basic', 'operations', 'vip'].map((p) => ({ plan: p, count: list.filter((x) => x.plan === p && x.status === 'active').length })), restaurants: list.length, active: list.filter((x) => x.status === 'active').length, revenue: sum((x) => x.revenue), sessions: sum((x) => x.sessions), liveTables: sum((x) => x.liveTables), guestsLive: sum((x) => x.guestsLive), online: sum((x) => x.online), liveRevenue: sum((x) => x.liveRevenue) },
    tenants: list.sort((a, b) => b.revenue - a.revenue), daily, hours,
    topItems: Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 8),
  });
} catch (e) { next(e); } });
app.post('/api/super/tenants', needSuper, async (req, res, next) => { try {
  const b = req.body || {}; const slug = String(b.slug || '').toLowerCase().trim();
  if (!SLUG.test(slug) || ['super', 'api', 'admin', 'vendor', 'uploads'].includes(slug)) return res.status(400).json({ error: 'Slug must be 2–30 chars: a-z, 0-9, dashes' });
  if (STATELESS ? !!(await store.getRec('r_' + slug)) : tenants.has(slug)) return res.status(400).json({ error: 'That slug is taken' });
  if (!b.name || !/^\S+@\S+$/.test(b.email || '')) return res.status(400).json({ error: 'Name and valid owner email required' });
  const password = b.password || auth.randomPassword();
  const plan0 = F.PLANS[b.plan] ? b.plan : 'operations';
  if (b.group) { const grp = String(b.group).slice(0, 40), used = (await allTenants()).filter((x) => (x.rec.group || '') === grp).length, c = F.limitCheck('branches', used, plan0); if (!c.ok) return res.status(402).json({ error: `Plan allows ${c.limit} branch(es) in a group`, kind: 'branches', limit: c.limit, used, upgrade: c.upgrade, limits: true }); }
  const rec = makeRecord({ name: b.name, slug, email: b.email, password, plan: plan0, demo: !!b.demo });
  rec.data.settings.name = b.name; if (b.group) rec.group = String(b.group).slice(0, 40); if (b.domain) rec.domain = String(b.domain).toLowerCase().slice(0, 80);
  if (STATELESS) { if (!(await createRecord(rec, !!b.demo))) return res.status(400).json({ error: 'That slug is taken' }); }
  else { const t = mount(rec); if (b.demo) t.seedLive(); store.save(rec); }
  res.json({ slug, email: rec.owner.email, password, pin: rec.pin, url: `${origin(req)}/r/${slug}/admin` });
} catch (e) { next(e); } });
app.put('/api/super/tenants/:slug', needSuper, async (req, res, next) => { try {
  const t = await oneTenant(req.params.slug); if (!t) return res.status(404).json({});
  if (req.body.limits !== undefined) { const L = req.body.limits || {}, o = {}; ['tables', 'staff', 'branches'].forEach((k) => { if (L[k] === null || L[k] === '' ) { if (L[k] === null) o[k] = null; } else if (L[k] !== undefined && +L[k] >= 0) o[k] = Math.floor(+L[k]); }); t.rec.limits = Object.keys(o).length ? o : undefined; }
  ['name', 'plan', 'status', 'group', 'domain'].forEach((k) => { if (req.body[k] === undefined) return; if (k === 'plan' && !F.PLANS[req.body[k]]) return; t.rec[k] = req.body[k]; });
  if (t.rec.domain) t.rec.domain = String(t.rec.domain).toLowerCase().trim().slice(0, 80);
  if (t.rec.status !== 'active') t.clients.forEach((c) => c.ws.close());
  if (!(await saveTenant(t))) return res.status(409).json({ error: 'busy, try again' });
  res.json(tenantStats(t));
} catch (e) { next(e); } });
app.post('/api/super/tenants/:slug/reset', needSuper, async (req, res, next) => { try {
  const t = await oneTenant(req.params.slug); if (!t) return res.status(404).json({});
  const password = auth.randomPassword(); t.rec.owner.hash = auth.hash(password); t.rec.pin = auth.pin();
  if (!(await saveTenant(t))) return res.status(409).json({ error: 'busy, try again' });
  res.json({ email: t.rec.owner.email, password, pin: t.rec.pin });
} catch (e) { next(e); } });
app.post('/api/super/tenants/:slug/impersonate', needSuper, (req, res) => res.json({ token: auth.sign('admin', req.params.slug, 1) }));
app.delete('/api/super/tenants/:slug', needSuper, async (req, res, next) => { try {
  const t = await oneTenant(req.params.slug); if (!t) return res.status(404).json({});
  t.clients.forEach((c) => c.ws.close()); tenants.delete(t.rec.slug); await store.remove(t.rec.id); res.json({ ok: 1 });
} catch (e) { next(e); } });

// ----- Per-restaurant public API -----
const R = '/api/r/:slug';
app.get(`${R}/config`, tenantMw, (req, res) => res.json(req.tenant.publicConfig()));
app.get(`${R}/info`, tenantMw, (req, res) => res.json({ base: origin(req) + '/r/' + req.params.slug }));
app.get(`${R}/qr/:n.png`, tenantMw, needAdmin, async (req, res) => {
  const base = String(req.query.base || origin(req) + '/r/' + req.params.slug).replace(/\/$/, '');
  const tb = req.tenant.db.tables.find((x) => String(x.number) === req.params.n);
  if (!tb) return res.status(404).end();
  res.type('png').send(await QRCode.toBuffer(`${base}/t/${tb.number}${tb.key ? '?k=' + tb.key : ''}`, { width: 600, margin: 2, color: { dark: '#111111', light: '#ffffff' } }));
});
app.get(`${R}/menu/template.xlsx`, (req, res) => {
  const ws = XLSX.utils.json_to_sheet([{ category: 'Hot Coffee', category_ar: 'قهوة ساخنة', name: 'Mocha', name_ar: 'موكا', price: 85, cost: 20, emoji: '☕', description: 'Chocolate espresso' }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Menu');
  res.setHeader('Content-Disposition', 'attachment; filename=menu-template.xlsx');
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});
const persistRec = (t) => { if (STATELESS) t.dirty = true; else store.save(t.rec); };
app.post(`${R}/login`, tenantMw, (req, res) => {
  const t = req.tenant, { role, email, password, pin } = req.body || {};
  const key = `${role}:${req.ip}`, fails = (t.rec.fails ||= {}), f = fails[key] || { n: 0, t: 0 };
  if (f.n >= 8 && Date.now() - f.t < 10 * 60000) return res.status(429).json({ error: 'Too many attempts, try again in a few minutes' });
  const ok = (token) => { if (fails[key]) { delete fails[key]; persistRec(t); } return res.json({ token }); };
  if (role === 'admin' && String(email).toLowerCase() === t.rec.owner.email && auth.check(password, t.rec.owner.hash)) return ok(auth.sign('admin', t.rec.slug));
  if (role === 'cashier') {
    if (!F.has(t.rec.plan, 'cashier')) return res.status(402).json({ error: 'The Cashier role needs the Operations plan', upgrade: F.minPlanFor('cashier') });
    const p = String(pin || '');
    const who = (t.rec.staff || []).find((st) => st.active !== false && st.hash && st.role === 'cashier' && auth.check(p, st.hash));
    if (who) return ok(auth.sign('cashier', t.rec.slug, 2, { u: who.id, n: who.name }));
  }
  if (role === 'captain' || role === 'kitchen') {
    const p = String(pin || ''); let who = null;
    for (const st of t.rec.staff || []) if (st.active !== false && st.hash && auth.check(p, st.hash)) { who = st; break; }
    if (who && (role === 'kitchen' || who.role === 'captain')) return ok(auth.sign(role, t.rec.slug, 2, { u: who.id, n: who.name }));
    if (!who && p && p === String(t.rec.pin)) return ok(auth.sign(role, t.rec.slug, 2, { u: 'owner-pin', n: 'Captain' }));
  }
  fails[key] = { n: f.n + 1, t: Date.now() };
  for (const k of Object.keys(fails)) if (Date.now() - fails[k].t > 3600000) delete fails[k];
  persistRec(t); res.status(401).json({ error: 'Invalid credentials' });
});
app.get(`${R}/me`, tenantMw, (req, res) => {
  const d = auth.verify(bearer(req)); const want = req.query.role;
  const ok = d && (d.r === 'super' || (d.s === req.params.slug && (d.r === want || d.r === 'admin' || (want === 'kitchen' && d.r === 'captain'))));
  ok ? res.json({ ok: 1, name: req.tenant.rec.name, who: d.n || '' }) : res.status(401).json({ error: 'auth' });
});
function needStaff(req, res, next) {
  const d = auth.verify(bearer(req));
  if (!d) return res.status(401).json({ error: 'auth' });
  if (d.r !== 'super' && !(d.s === req.params.slug && ['admin', 'captain', 'kitchen', 'cashier'].includes(d.r))) return res.status(403).json({ error: 'forbidden' });
  req.claims = d; next();
}
// ---- cashier till: shifts, paid in/out, counted-cash variance (Z report) ----
const needCash = (req, res, next) => needStaff(req, res, () => (['admin', 'cashier', 'super'].includes(req.claims.r) ? next() : res.status(403).json({ error: 'forbidden' })));
async function shiftView(t, extra) {
  const sh = (t.rec.shifts ||= { cur: null, list: [] }), hist = STATELESS ? await store.getHist(t.rec.id) : t.db.history;
  const cur = sh.cur && (() => {
    const H = hist.filter((h) => h.closedAt >= sh.cur.openedAt && !h.unpaid);
    const cash = H.reduce((n, h) => n + ((h.pay && h.pay.cash) || 0), 0), card = H.reduce((n, h) => n + ((h.pay && h.pay.card) || 0), 0);
    const inn = sh.cur.moves.filter((m) => m.kind === 'in').reduce((n, m) => n + m.amount, 0), out = sh.cur.moves.filter((m) => m.kind === 'out').reduce((n, m) => n + m.amount, 0);
    return { ...sh.cur, sales: H.length, cash: +cash.toFixed(2), card: +card.toFixed(2), tips: +H.reduce((n, h) => n + (h.tip || 0), 0).toFixed(2), discounts: +H.reduce((n, h) => n + (h.discount || 0), 0).toFixed(2), voids: H.reduce((n, h) => n + (h.voids || []).length, 0), total: +H.reduce((n, h) => n + h.total, 0).toFixed(2), paidIn: inn, paidOut: out, expected: +(sh.cur.float + cash + inn - out).toFixed(2) };
  })();
  return { cur: cur || null, list: sh.list.slice(-15).reverse(), ...extra };
}
app.get(`${R}/shift`, tenantMw, needCash, async (req, res) => { try { res.json(await shiftView(req.tenant)); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post(`${R}/shift/open`, tenantMw, needCash, async (req, res) => {
  const t = req.tenant, sh = (t.rec.shifts ||= { cur: null, list: [] }), f = Math.max(0, +req.body.float || 0);
  if (sh.cur) return res.status(400).json({ error: 'A shift is already open' });
  sh.cur = { id: newId('sh'), openedAt: Date.now(), by: req.claims.n || 'Owner', float: f, moves: [] }; persistRec(t); res.json(await shiftView(t));
});
app.post(`${R}/shift/move`, tenantMw, needCash, async (req, res) => {
  const t = req.tenant, sh = (t.rec.shifts ||= { cur: null, list: [] }), a = Math.round((+req.body.amount || 0) * 100) / 100;
  if (!sh.cur) return res.status(400).json({ error: 'Open a shift first' });
  if (!(a > 0) || !['in', 'out'].includes(req.body.kind)) return res.status(400).json({ error: 'Enter an amount' });
  sh.cur.moves.push({ at: Date.now(), kind: req.body.kind, amount: a, note: String(req.body.note || '').slice(0, 60), by: req.claims.n || 'Owner' }); persistRec(t); res.json(await shiftView(t));
});
app.post(`${R}/shift/close`, tenantMw, needCash, async (req, res) => {
  const t = req.tenant, sh = (t.rec.shifts ||= { cur: null, list: [] });
  if (!sh.cur) return res.status(400).json({ error: 'No open shift' });
  const v = (await shiftView(t)).cur, counted = Math.max(0, +req.body.counted || 0);
  const z = { ...v, closedAt: Date.now(), closedBy: req.claims.n || 'Owner', counted, variance: +(counted - v.expected).toFixed(2), note: String(req.body.note || '').slice(0, 120) };
  sh.list.push(z); sh.list = sh.list.slice(-60); sh.cur = null; persistRec(t); res.json({ ...(await shiftView(t)), z });
});
app.get(`${R}/shifts`, tenantMw, needAdmin, async (req, res) => res.json(await shiftView(req.tenant)));

// quick "sold out" switch for kitchen, captain and owner
app.put(`${R}/items/:id/stock`, tenantMw, needStaff, (req, res) => {
  const i = req.tenant.db.items.find((x) => x.id === req.params.id); if (!i) return res.status(404).json({ error: 'not found' });
  i.soldOut = !!req.body.soldOut; req.tenant.broadcast(); res.json({ id: i.id, soldOut: i.soldOut });
});
// push subscriptions
app.get(`${R}/push/key`, tenantMw, (req, res) => res.json({ key: VAPID.publicKey || '' }));
app.post(`${R}/push/subscribe`, tenantMw, needStaff, (req, res) => {
  const sub = req.body && req.body.sub; if (!sub || !/^https:\/\//.test(sub.endpoint || '') || !sub.keys) return res.status(400).json({ error: 'bad subscription' });
  const r = req.tenant.rec; r.pushSubs = (r.pushSubs || []).filter((x) => x.sub.endpoint !== sub.endpoint);
  r.pushSubs.push({ sub, role: req.claims.r === 'kitchen' ? 'kitchen' : 'captain', who: req.claims.n || '', at: Date.now() });
  r.pushSubs = r.pushSubs.slice(-30); req.tenant.broadcast(); res.json({ ok: 1 });
});
app.post(`${R}/push/unsubscribe`, tenantMw, needStaff, (req, res) => {
  const r = req.tenant.rec, ep = req.body && req.body.endpoint; r.pushSubs = (r.pushSubs || []).filter((x) => x.sub.endpoint !== ep); req.tenant.broadcast(); res.json({ ok: 1 });
});
// guest feedback after paying (public, rate limited)
app.post(`${R}/feedback`, tenantMw, (req, res) => {
  const b = req.body || {}, r = req.tenant.rec, stars = Math.round(+b.stars);
  if (!(stars >= 1 && stars <= 5)) return res.status(400).json({ error: 'bad rating' });
  const rate = (r.fbRate ||= {}), k = String(req.ip).replace(/[^\w.:]/g, '').slice(0, 45), now = Date.now();
  if (rate[k] && now - rate[k] < 3 * 60000) return res.json({ ok: 1, dup: true });
  rate[k] = now; for (const x of Object.keys(rate)) if (now - rate[x] > 3600000) delete rate[x];
  r.reviews = [{ id: newId('f'), at: now, stars, comment: String(b.comment || '').slice(0, 400), table: +b.table || 0, name: String(b.name || '').slice(0, 24) }, ...(r.reviews || [])].slice(0, 300);
  req.tenant.broadcast(); res.json({ ok: 1 });
});

// ----- Admin API (owner of this restaurant, or superadmin) -----
const A = (m, p, ...h) => app[m](`${R}${p}`, tenantMw, needAdmin, ...h);
const bc = (req) => req.tenant.broadcast();
A('get', '/account', (req, res) => res.json({ name: req.tenant.rec.name, email: req.tenant.rec.owner.email, pin: req.tenant.rec.pin, plan: F.planOf(req.tenant.rec.plan), features: F.featuresOf(req.tenant.rec.plan), group: req.tenant.rec.group || '', limits: F.limitsOf(req.tenant.rec.plan, req.tenant.rec.limits), usage: { tables: req.tenant.db.tables.length, staff: (req.tenant.rec.staff || []).length } }));
A('post', '/account', (req, res) => {
  const r = req.tenant.rec, b = req.body || {};
  if (b.pin) { if (!/^\d{4,8}$/.test(b.pin)) return res.status(400).json({ error: 'PIN must be 4–8 digits' }); r.pin = b.pin; }
  if (b.password) { if (String(b.password).length < 6) return res.status(400).json({ error: 'Password must be 6+ characters' }); r.owner.hash = auth.hash(b.password); }
  req.tenant.broadcast(); res.json({ ok: 1, pin: r.pin });
});
A('get', '/staff', (req, res) => res.json({ staff: (req.tenant.rec.staff || []).map(({ hash, ...x }) => x), stats: (req.tenant.rec.stats || {}).staff || {}, legacyPin: req.tenant.rec.pin }));
const pinTaken = (rec, pin, exceptId) => String(rec.pin) === pin || (rec.staff || []).some((x) => x.id !== exceptId && x.hash && auth.check(pin, x.hash));
A('post', '/staff', (req, res) => {
  const r = req.tenant.rec, b = req.body || {}, name = String(b.name || '').trim().slice(0, 30), pin = String(b.pin || '');
  if (!name) return res.status(400).json({ error: 'Name required' });
  { const h = limitHit(req.tenant, 'staff', (r.staff || []).length); if (h) return res.status(402).json(h); }
  if (!['captain', 'kitchen', 'cashier'].includes(b.role)) return res.status(400).json({ error: 'Role must be captain, kitchen or cashier' });
  if (b.role === 'cashier' && !F.has(r.plan, 'cashier')) return res.status(402).json({ error: 'The Cashier role needs the Operations plan', upgrade: F.minPlanFor('cashier') });
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4-8 digits' });
  if (pinTaken(r, pin)) return res.status(400).json({ error: 'That PIN is already used - choose another' });
  const st = { id: newId('u'), name, role: b.role, hash: auth.hash(pin), active: true, createdAt: Date.now() };
  (r.staff ||= []).push(st); bc(req); const { hash, ...pub } = st; res.json(pub);
});
A('put', '/staff/:id', (req, res) => {
  const r = req.tenant.rec, st = (r.staff || []).find((x) => x.id === req.params.id), b = req.body || {};
  if (!st) return res.status(404).json({ error: 'not found' });
  if (b.name !== undefined) st.name = String(b.name).trim().slice(0, 30) || st.name;
  if (['captain', 'kitchen', 'cashier'].includes(b.role)) st.role = b.role;
  if (b.active !== undefined) st.active = !!b.active;
  if (b.pin) { if (!/^\d{4,8}$/.test(String(b.pin))) return res.status(400).json({ error: 'PIN must be 4-8 digits' }); if (pinTaken(r, String(b.pin), st.id)) return res.status(400).json({ error: 'That PIN is already used' }); st.hash = auth.hash(String(b.pin)); }
  bc(req); res.json({ ok: 1 });
});
A('delete', '/staff/:id', (req, res) => { const r = req.tenant.rec; r.staff = (r.staff || []).filter((x) => x.id !== req.params.id); bc(req); res.json({ ok: 1 }); });
A('get', '/feedback', (req, res) => res.json({ reviews: req.tenant.rec.reviews || [] }));
A('post', '/tables/:id/rekey', (req, res) => { const t = req.tenant.db.tables.find((x) => x.id === req.params.id); if (t) t.key = Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6); bc(req); res.json({ ok: 1 }); });
A('post', '/tables-rekey', (req, res) => { req.tenant.db.tables.forEach((t) => (t.key = Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6))); bc(req); res.json({ ok: 1 }); });
A('post', '/items/:id/adjust', (req, res) => {
  const t = req.tenant, i = t.db.items.find((x) => x.id === req.params.id); if (!i) return res.status(404).json({ error: 'not found' });
  const b = req.body || {}, type = ['restock', 'waste', 'count'].includes(b.type) ? b.type : 'restock', q = Math.floor(+b.qty);
  if (!(q >= 0) || (type !== 'count' && q <= 0)) return res.status(400).json({ error: 'Enter a quantity' });
  const cur = i.stock === undefined || i.stock === null || i.stock === '' ? 0 : Math.floor(+i.stock);
  const next = type === 'restock' ? cur + q : type === 'waste' ? Math.max(0, cur - q) : q;
  i.stock = next; i.soldOut = next <= 0;
  t.rec.stockLog = [{ at: Date.now(), itemId: i.id, item: i.name, delta: next - cur, type, reason: String(b.reason || '').slice(0, 60), who: 'owner', left: next }, ...(t.rec.stockLog || [])].slice(0, 400);
  bc(req); res.json({ id: i.id, stock: next });
});
A('get', '/stock-log', (req, res) => res.json({ log: req.tenant.rec.stockLog || [] }));
A('get', '/orders', async (req, res) => {
  const [f, t2] = range(req.query), hist = STATELESS ? await store.getHist(req.tenant.rec.id) : req.tenant.db.history;
  res.json({ orders: hist.filter((h) => h.closedAt >= f && h.closedAt <= t2).slice(-400).reverse().map(({ log, ...h }) => h) });
});
app.get(`${R}/receipts`, tenantMw, needCash, async (req, res) => { const hist = STATELESS ? await store.getHist(req.tenant.rec.id) : req.tenant.db.history; res.json({ receipts: hist.slice(-40).reverse().map(({ log, ...h }) => h) }); });
async function reportFor(t, from, to) {
  const hist = STATELESS ? await store.getHist(t.rec.id) : t.db.history;
  const H = hist.filter((h) => h.closedAt >= from && h.closedAt <= to && !h.unpaid);
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0), cats = {}, items = {}, hours = Array(24).fill(0), methods = { cash: 0, card: 0 }, splits = {}, byWho = {}, salesBy = {}, kinds = {}; let voidN = 0, voidV = 0, wasteV = 0;
  H.forEach((h) => {
    methods.cash += h.pay ? h.pay.cash : h.method === 'cash' ? h.total : 0; methods.card += h.pay ? h.pay.card : h.method === 'card' ? h.total : 0; splits[h.split] = (splits[h.split] || 0) + 1; hours[new Date(h.startedAt).getHours()]++;
    if (h.closedBy) { byWho[h.closedBy] = (byWho[h.closedBy] || 0) + 1; salesBy[h.closedBy] = (salesBy[h.closedBy] || 0) + h.total; }
    kinds[h.kind || 'table'] = (kinds[h.kind || 'table'] || 0) + h.total; (h.voids || []).forEach((v) => { voidN += v.qty; voidV += v.qty * v.price; if (v.waste) wasteV += v.qty * v.price; });
    h.items.forEach((l) => {
      const c = t.db.categories.find((x) => x.id === l.cat), cn = c ? c.name : 'Other';
      const a = (items[l.name] ||= { name: l.name, category: cn, qty: 0, revenue: 0, profit: 0 }); a.qty += l.qty; a.revenue += l.qty * l.price; a.profit += l.qty * (l.price - l.cost);
      const b = (cats[cn] ||= { name: cn, revenue: 0, profit: 0, qty: 0 }); b.revenue += l.qty * l.price; b.profit += l.qty * (l.price - l.cost); b.qty += l.qty;
    });
  });
  const rev = (t.rec.reviews || []).filter((r) => r.at >= from && r.at <= to);
  const staff = Object.entries((t.rec.stats || {}).staff || {}).map(([id, v]) => ({ id, ...v, avgResponseSec: v.handled ? Math.round(v.respMs / v.handled / 1000) : 0 }));
  return {
    from, to, sessions: H.length, guests: sum(H, (h) => h.guests), gross: sum(H, (h) => h.sub), discounts: sum(H, (h) => h.discount || 0), voids: { count: voidN, value: voidV, waste: wasteV }, salesBy, kinds,
    profit: Object.values(items).reduce((n, x) => n + x.profit, 0) - sum(H, (h) => h.discount || 0), cogs: Object.values(items).reduce((n, x) => n + (x.revenue - x.profit), 0), service: sum(H, (h) => h.service), tax: sum(H, (h) => h.tax), tips: sum(H, (h) => h.tip), total: sum(H, (h) => h.total),
    avgTicket: H.length ? sum(H, (h) => h.total) / H.length : 0, avgMinutes: H.length ? sum(H, (h) => (h.closedAt - h.startedAt) / 60000) / H.length : 0, methods, splits, hours, closedBy: byWho,
    items: Object.values(items).sort((a, b) => b.qty - a.qty), categories: Object.values(cats).sort((a, b) => b.revenue - a.revenue), staff,
    reviews: { count: rev.length, avg: rev.length ? rev.reduce((n, r) => n + r.stars, 0) / rev.length : 0, low: rev.filter((r) => r.stars <= 2).length }, currency: t.db.settings.currency, name: t.rec.name,
    sessionsList: H.map((h) => ({ kind: h.kind || 'table', discount: h.discount || 0, cash: h.pay ? h.pay.cash : 0, card: h.pay ? h.pay.card : 0, table: h.tableNumber, guests: h.guests, opened: h.startedAt, closed: h.closedAt, minutes: Math.round((h.closedAt - h.startedAt) / 60000), sub: h.sub, service: h.service, tax: h.tax, tip: h.tip, total: h.total, method: h.method, split: h.split, closedBy: h.closedBy || '' })),
  };
}
const range = (q) => { const to = +q.to || Date.now(), from = +q.from || to - 86400000; return [from, to]; };
A('get', '/report', async (req, res) => { const [f, t2] = range(req.query); const r = await reportFor(req.tenant, f, t2); delete r.sessionsList; res.json(r); });
A('get', '/report.xlsx', async (req, res) => {
  const [f, t2] = range(req.query), r = await reportFor(req.tenant, f, t2), wb = XLSX.utils.book_new(), d = (x) => new Date(x).toLocaleString('en-GB');
  const money = (n) => Math.round(n * 100) / 100;
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [r.name + ' - sales report'], ['From', d(f)], ['To', d(t2)], [], ['Table sessions', r.sessions], ['Guests', r.guests], ['Gross sales (before service/tax)', money(r.gross)], ['Discounts given', money(r.discounts)], ['Voided items (value)', money(r.voids.value)], ['Estimated profit (after discounts)', money(r.profit)], ['Service charge', money(r.service)], ['Tax collected', money(r.tax)], ['Tips', money(r.tips)], ['Total collected', money(r.total)],
    ['Cash', money(r.methods.cash || 0)], ['Card', money(r.methods.card || 0)], ['Average ticket', money(r.avgTicket)], ['Average minutes at table', Math.round(r.avgMinutes)], ['Currency', r.currency], ['Guest rating (avg)', r.reviews.count ? Math.round(r.reviews.avg * 10) / 10 : 'n/a'],
  ]), 'Summary');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.sessionsList.map((x) => ({ Table: x.table, Guests: x.guests, Opened: d(x.opened), Closed: d(x.closed), Minutes: x.minutes, Type: x.kind, Subtotal: money(x.sub), Discount: money(x.discount), Service: money(x.service), Tax: money(x.tax), Tip: money(x.tip), Total: money(x.total), Payment: x.method, Cash: money(x.cash), Card: money(x.card), Split: x.split, 'Closed by': x.closedBy }))), 'Sessions');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.items.map((x) => ({ Item: x.name, Category: x.category, Quantity: x.qty, Revenue: money(x.revenue), Profit: money(x.profit) }))), 'Items');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.categories.map((x) => ({ Category: x.name, Quantity: x.qty, Revenue: money(x.revenue), Profit: money(x.profit) }))), 'Categories');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.staff.map((x) => ({ Staff: x.name, 'Requests handled': x.handled || 0, 'Avg response (sec)': x.avgResponseSec, 'Orders started': x.started || 0, 'Orders served': x.served || 0, 'Tables closed': x.closed || 0 }))), 'Staff');
  res.setHeader('Content-Disposition', `attachment; filename=report-${new Date(f).toISOString().slice(0, 10)}.xlsx`);
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
});
A('get', '/export.json', async (req, res) => {
  const t = req.tenant, { staff, pushSubs, fails, fbRate, ...rec } = t.rec;
  const out = { exportedAt: new Date().toISOString(), restaurant: { name: rec.name, slug: rec.slug }, settings: t.db.settings, categories: t.db.categories, items: t.db.items.map((i) => ({ ...i, img: i.img && i.img.startsWith('data:') ? '' : i.img })), tables: t.db.tables, staff: (staff || []).map(({ hash, ...x }) => x), reviews: rec.reviews || [], history: STATELESS ? await store.getHist(rec.id) : t.db.history };
  res.setHeader('Content-Disposition', `attachment; filename=backup-${new Date().toISOString().slice(0, 10)}.json`); res.type('json').send(JSON.stringify(out));
});
A('post', '/settings', (req, res) => {
  const d = req.tenant.db; const b = req.body || {}; delete b.presets;
  if (F.PREMIUM_THEMES.includes(b.theme) && !F.has(req.tenant.rec.plan, 'themes')) return res.status(402).json({ error: 'Custom themes need the ' + F.PLANS.vip.name + ' plan', upgrade: 'vip' });
  if (b.loyalty) { if (!F.has(req.tenant.rec.plan, 'loyalty')) return res.status(402).json({ error: 'Loyalty needs the ' + F.PLANS.vip.name + ' plan', upgrade: 'vip' }); const l = b.loyalty; b.loyalty = { enabled: l.enabled !== false, egpPerPoint: Math.max(1, +l.egpPerPoint || 10), pointsPerRedeem: Math.max(1, +l.pointsPerRedeem || 100), redeemValue: Math.max(0, +l.redeemValue || 0) }; }
  if ('refreshMin' in b) b.refreshMin = [0, 5, 15, 30, 60, 120, 360].includes(+b.refreshMin) ? +b.refreshMin : 60;
  if (b.ai) { if (!F.has(req.tenant.rec.plan, 'copilot')) return res.status(402).json({ error: 'The AI assistant needs the ' + F.PLANS.vip.name + ' plan', upgrade: 'vip' }); const a = F.aiCfg({ ai: b.ai }); b.ai = { name: a.name, style: a.style, memory: a.memory.map((m) => ({ ...m, id: m.id || Math.random().toString(36).slice(2, 9), at: m.at || Date.now() })) }; }
  if (b.promos) b.promos = (Array.isArray(b.promos) ? b.promos : []).slice(0, 6).map((p) => ({ title: String(p.title || '').slice(0, 60), title_ar: String(p.title_ar || '').slice(0, 60), text: String(p.text || '').slice(0, 140), text_ar: String(p.text_ar || '').slice(0, 140) })); Object.assign(d.settings, b); bc(req); res.json(d.settings); });

A('post', '/categories', (req, res) => { const d = req.tenant.db; const c = { id: newId('c'), name: req.body.name || 'New', name_ar: req.body.name_ar || '', emoji: req.body.emoji || '🍽️' }; d.categories.push(c); bc(req); res.json(c); });
A('put', '/categories/order', (req, res) => { const d = req.tenant.db, o = req.body.ids || []; d.categories.sort((a, b) => o.indexOf(a.id) - o.indexOf(b.id)); bc(req); res.json({ ok: 1 }); });
A('put', '/categories/:id', (req, res) => { const c = req.tenant.db.categories.find((x) => x.id === req.params.id); if (c) Object.assign(c, req.body, { id: c.id }); bc(req); res.json(c); });
A('delete', '/categories/:id', (req, res) => { const d = req.tenant.db; d.categories = d.categories.filter((x) => x.id !== req.params.id); d.items = d.items.filter((i) => i.cat !== req.params.id); bc(req); res.json({ ok: 1 }); });

A('post', '/items', (req, res) => { const d = req.tenant.db; const b = req.body; const i = { id: newId('i'), cat: b.cat, name: b.name || 'New item', name_ar: b.name_ar || '', price: +b.price || 0, cost: +b.cost || 0, emoji: b.emoji || '🍽️', desc: b.desc || '', img: '' }; if (b.stock !== undefined && b.stock !== null && b.stock !== '') i.stock = Math.max(0, Math.floor(+b.stock) || 0); d.items.push(i); bc(req); res.json(i); });
A('put', '/items/:id', (req, res) => { const i = req.tenant.db.items.find((x) => x.id === req.params.id); if (i) { Object.assign(i, req.body, { id: i.id }); i.price = +i.price; i.cost = +i.cost; const b = req.body || {}; if ('stock' in b) i.stock = b.stock === null || b.stock === '' ? null : Math.max(0, Math.floor(+b.stock) || 0); if ('lowAt' in b) i.lowAt = Math.max(0, Math.floor(+b.lowAt) || 0); } bc(req); res.json(i); });
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
A('delete', '/items/:id/image', (req, res) => { const i = req.tenant.db.items.find((x) => x.id === req.params.id); if (i) i.img = ''; bc(req); res.json({ ok: 1 }); });
const putImage = async (req, res, label) => {
  if (!req.file) return res.status(400).json({ error: 'bad request' });
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(req.file.mimetype)) return res.status(400).json({ error: 'Unsupported image type' });
  if (req.file.size > 700 * 1024) return res.status(400).json({ error: 'Image too large (max 700KB)' });
  const key = `${req.tenant.rec.id}-${label}-${Date.now().toString(36)}`;
  await store.putBlob(key, `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`);
  return `/api/r/${req.params.slug}/img/${key}`;
};
A('post', '/categories/:id/image', upload.single('image'), async (req, res) => { const c = req.tenant.db.categories.find((x) => x.id === req.params.id); if (!c) return res.status(404).json({ error: 'not found' }); const u = await putImage(req, res, 'c' + c.id); if (!u) return; c.img = u; bc(req); res.json({ ok: 1 }); });
A('delete', '/categories/:id/image', (req, res) => { const c = req.tenant.db.categories.find((x) => x.id === req.params.id); if (c) c.img = ''; bc(req); res.json({ ok: 1 }); });
A('post', '/hero-image', upload.single('image'), async (req, res) => { const u = await putImage(req, res, 'hero'); if (!u) return; req.tenant.db.settings.heroImg = u; bc(req); res.json({ ok: 1 }); });
A('delete', '/hero-image', (req, res) => { req.tenant.db.settings.heroImg = ''; bc(req); res.json({ ok: 1 }); });
app.get(`${R}/img/:key`, async (req, res) => {
  const d = await store.getBlob(req.params.key); const m = d && /^data:([\w/+.-]+);base64,(.*)$/.exec(d);
  if (!m) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable').type(m[1]).send(Buffer.from(m[2], 'base64'));
});
// ----- Premium (Tier 3) features: loyalty, AI menu digitizer, admin copilot, multi-branch -----
const gate = (f) => (req, res, next) => F.has(req.tenant.rec.plan, f) ? next() : res.status(402).json({ error: 'This feature needs the ' + F.PLANS[F.minPlanFor(f)].name + ' plan', upgrade: F.minPlanFor(f) });
const aiKey = () => process.env.ANTHROPIC_API_KEY || '';
async function claude(content, system, max = 2000) {
  const messages = Array.isArray(content) ? content : [{ role: 'user', content }];
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': aiKey(), 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: max, system, messages }) });
  const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'AI request failed');
  return (j.content || []).map((x) => x.text || '').join('');
}
A('get', '/loyalty', gate('loyalty'), (req, res) => res.json({ ...req.tenant.loyaltyStats(), config: F.loyaltyCfg(req.tenant.db.settings) }));
A('post', '/loyalty/adjust', gate('loyalty'), (req, res) => {
  const L = req.tenant.db.loyalty, m = L && L.members[F.cleanPhone(req.body.phone)]; if (!m) return res.status(404).json({ error: 'Member not found' });
  const d = Math.max(-100000, Math.min(100000, Math.floor(+req.body.delta) || 0)); m.points = Math.max(0, m.points + d); m.log = [{ at: Date.now(), type: d >= 0 ? 'earn' : 'redeem', pts: Math.abs(d), egp: 0, manual: true }, ...(m.log || [])].slice(0, 40);
  bc(req); res.json({ ok: 1, points: m.points });
});
A('get', '/ai', gate('copilot'), (req, res) => res.json({ live: !!aiKey(), ...F.aiCfg(req.tenant.db.settings) }));
A('post', '/copilot', gate('copilot'), async (req, res) => {
  const q = String((req.body || {}).q || '').slice(0, 400); if (!q) return res.status(400).json({ error: 'Ask something' });
  // serverless keeps history in storage: load it just for this answer and never let it be committed back
  const keep = req.tenant.db.history; if (STATELESS) req.tenant.db.history = await store.getHist(req.tenant.rec.id);
  let r, ctx = '';
  try {
    r = req.tenant.copilotAsk(q);
    if (r.unknown && aiKey()) { const a = req.tenant.analytics(7), ls = req.tenant.loyaltyStats(); ctx = JSON.stringify({ currency: req.tenant.db.settings.currency, week: { revenue: a.kpi.revenue, paidTables: a.kpi.orders, avgTicket: a.kpi.avg, topItems: a.topItems.slice(0, 5) }, lowStock: a.lowStock, loyalty: { members: ls.members, redeemedToday: ls.redeemedToday, earnedToday: ls.earnedToday } }); }
  } finally { req.tenant.db.history = keep; }
  if (ctx) {
    try {
      const hist = (Array.isArray((req.body || {}).hist) ? req.body.hist : []).slice(-10).map((h) => ({ role: h.r === 'u' ? 'user' : 'assistant', text: String(h.t || '').slice(0, 600) })).filter((h) => h.text);
      const msgs = []; hist.forEach((h) => { if (msgs.length && msgs[msgs.length - 1].role === h.role) msgs[msgs.length - 1].content += '\n' + h.text; else msgs.push({ role: h.role, content: h.text }); });
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
      msgs.push({ role: 'user', content: q });
      return res.json({ reply: await claude(msgs, F.aiSystemPrompt(req.tenant.db.settings, 'Live numbers (JSON): ' + ctx), 700), ai: true });
    } catch (e) { /* fall through to the built-in answer */ }
  }
  res.json({ reply: r.reply, action: r.action || null });
});
// OCR: with ANTHROPIC_API_KEY the photo is read by a vision model; without it the demo returns a sample parse so the flow can be shown offline
A('post', '/menu/ocr', gate('ocr'), upload.single('image'), async (req, res) => {
  if (!req.file || !/^image\/(png|jpe?g|webp|gif)$/.test(req.file.mimetype)) return res.status(400).json({ error: 'Upload a PNG, JPG or WebP photo of the menu' });
  if (!aiKey()) return res.json({ simulated: true, ...F.parseMenuText(F.OCR_SAMPLE) });
  try {
    const txt = await claude([{ type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: req.file.buffer.toString('base64') } }, { type: 'text', text: 'Read this restaurant menu. Return ONLY a JSON array: [{"cat":"category name","name":"item name","name_ar":"Arabic name if shown, else empty","price":number,"desc":"short description or empty"}]. Keep the original language of each name. Prices are plain numbers.' }], 'You digitize restaurant menus. Output valid JSON only.', 4000);
    const a = txt.indexOf('['), b = txt.lastIndexOf(']'); const items = JSON.parse(txt.slice(a, b + 1)).filter((x) => x && x.name && +x.price >= 0);
    res.json({ simulated: false, categories: [...new Set(items.map((x) => x.cat || 'Menu'))], items });
  } catch (e) { res.status(502).json({ error: 'Could not read the photo: ' + e.message }); }
});
A('post', '/menu/ocr/import', gate('ocr'), (req, res) => res.json(req.tenant.importParsed((req.body || {}).items)));
A('get', '/branches', gate('branches'), async (req, res, next) => { try {
  const g = req.tenant.rec.group, list = (await allTenants()).filter((t) => t.rec.id === req.tenant.rec.id || (g && t.rec.group === g)).map((t) => tenantStats(t, +req.query.days || 30));
  const sum = (f) => list.reduce((n, x) => n + f(x), 0);
  res.json({ group: g || '', branches: list.map((x) => ({ slug: x.slug, name: x.name, revenue: x.revenue, sessions: x.sessions, avgTicket: x.avgTicket, liveTables: x.liveTables, guestsLive: x.guestsLive })), totals: { revenue: sum((x) => x.revenue), sessions: sum((x) => x.sessions), liveTables: sum((x) => x.liveTables) }, currency: req.tenant.db.settings.currency });
} catch (e) { next(e); } });
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

// Plan limits: block only the creation of NEW things; venues already over a limit keep working (grandfathered)
const limitHit = (t, kind, used) => { const c = F.limitCheck(kind, used, t.rec.plan, t.rec.limits); return c.ok ? null : { error: `Your plan allows ${c.limit} ${kind} - upgrade to add more`, kind, limit: c.limit, used, upgrade: c.upgrade, limits: true }; };
A('post', '/tables', (req, res) => {
  { const h = limitHit(req.tenant, 'tables', req.tenant.db.tables.length); if (h) return res.status(402).json(h); }
  const d = req.tenant.db, F = d.settings.floor || { cols: 24, rows: 16, decor: [] }, n = Math.max(0, ...d.tables.map((t) => t.number)) + 1;
  const boxes = [...d.tables.map((t) => ({ fx: t.fx ?? ((t.x || 1) - 1) * 2, fy: t.fy ?? ((t.y || 1) - 1) * 2, fw: t.fw || 4, fh: t.fh || 4 })), ...(F.decor || [])];
  const hit = (x, y) => boxes.some((o) => x < o.fx + o.fw && x + 3 > o.fx && y < o.fy + o.fh && y + 3 > o.fy);
  let spot = { fx: 0, fy: 0 };
  search: for (let y = 0; y <= F.rows - 3; y++) for (let x = 0; x <= F.cols - 3; x++) if (!hit(x, y)) { spot = { fx: x, fy: y }; break search; }
  const t = { id: newId('t'), number: n, ...spot, fw: 3, fh: 3, shape: 'square', seats: 4 }; d.tables.push(t); req.tenant.ensure(); bc(req); res.json(t);
});
// Bulk save from the floor-plan editor: positions, sizes, shapes, seats and decor
A('put', '/layout', (req, res) => {
  const d = req.tenant.db, b = req.body || {}, snap = (v) => Math.round(+v * 2) / 2;
  (b.tables || []).forEach((u) => {
    const t = d.tables.find((x) => x.id === u.id); if (!t) return;
    for (const k of ['fx', 'fy', 'fw', 'fh']) if (Number.isFinite(+u[k])) t[k] = snap(u[k]);
    if (['round', 'square', 'long'].includes(u.shape)) t.shape = u.shape;
    if (typeof u.zone === 'string') t.zone = u.zone.trim().slice(0, 20);
    if (Number.isFinite(+u.seats)) t.seats = Math.max(1, Math.min(20, Math.round(+u.seats)));
  });
  if (Array.isArray(b.decor)) {
    const F = d.settings.floor || { cols: 24, rows: 16 };
    d.settings.floor = { cols: F.cols || 24, rows: F.rows || 16, decor: b.decor.slice(0, 80).filter((x) => ['bar', 'kitchen', 'wall', 'plant', 'door'].includes(x.type)).map((x) => ({ id: String(x.id || newId('d')).slice(0, 24), type: x.type, fx: snap(x.fx), fy: snap(x.fy), fw: Math.max(1, snap(x.fw)), fh: Math.max(1, snap(x.fh)), label: String(x.label || '').slice(0, 20) })) };
  }
  bc(req); res.json({ ok: 1 });
});
A('put', '/tables/:id', (req, res) => { const t = req.tenant.db.tables.find((x) => x.id === req.params.id); if (t) Object.assign(t, req.body, { id: t.id }); bc(req); res.json(t); });
A('delete', '/tables/:id', (req, res) => { const d = req.tenant.db; d.tables = d.tables.filter((x) => x.id !== req.params.id); delete d.sessions[req.params.id]; bc(req); res.json({ ok: 1 }); });
A('post', '/stats/clear', (req, res) => {   // reset one statistics block (or all); sales records and receipts are never touched
  const d = req.tenant.db, k = String(req.body.key || ''); d.statsReset ||= {};
  if (!['all', 'kpi', 'trend', 'cats', 'best', 'details', 'heat', 'tables'].includes(k)) return res.status(400).json({ error: 'unknown block' });
  if (req.body.restore) { if (k === 'all') d.statsReset = {}; else delete d.statsReset[k]; } else d.statsReset[k] = Date.now();
  bc(req); res.json({ ok: 1 });
});
A('get', '/analytics', async (req, res) => { if (STATELESS) req.tenant.db.history = await store.getHist(req.tenant.rec.id); res.json(req.tenant.analytics(+req.query.days || 7)); });

// ---------- Polling transport (used when websockets are unavailable, e.g. Vercel) ----------
// One call = optional message + fresh snapshot. Retries automatically on write conflicts.
app.post(`${R}/rpc`, async (req, res) => {
  const j = req.body || {}, jn = j.join || {};
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const t = STATELESS ? await loadFresh(req.params.slug) : tenants.get(req.params.slug);
      if (!t || (STATELESS && SINGLE && req.params.slug !== MAIN)) return res.status(404).json({ error: 'Unknown restaurant' });
      if (t.rec.status !== 'active') return res.status(403).json({ error: 'This restaurant is suspended' });
      const out = [];
      const c = { ws: { readyState: 1, send: (d) => out.push(JSON.parse(d)) }, role: null, joined: false, authed: false };
      if (jn.role !== 'customer') {
        const a = auth.verify(jn.token);
        if (!a || !(a.r === 'super' || (a.s === req.params.slug && (a.r === jn.role || a.r === 'admin' || (jn.role === 'kitchen' && a.r === 'captain'))))) return res.status(401).json({ error: 'auth' });
        c.authed = true; c.staffId = a.u; c.staffName = a.n; c.adm = a.r === 'admin' || a.r === 'super'; c.cashier = jn.role === 'cashier';
      }
      if (jn.role === 'customer') {
        const tb = t.db.tables.find((x) => x.number === +jn.tableNumber);
        const s = tb && t.db.sessions[tb.id];
        if (!tb) return res.status(404).json({ error: 'Unknown table' });
        const known = s && s.guests.find((g) => g.id === jn.guestId);
        if (known) { c.role = 'customer'; c.joined = true; c.tableNumber = tb.number; c.guestId = known.id; }
        else if (jn.fresh === false) { c.role = 'customer'; c.joined = true; c.tableNumber = tb.number; }   // session ended while the page was open: show the end screen, do not reopen the table
        else t.handle(c, { t: 'join', role: 'customer', tableNumber: jn.tableNumber, guestId: jn.guestId, name: jn.name, avatar: jn.avatar, key: jn.key });
      } else t.handle(c, { t: 'join', role: jn.role === 'cashier' ? 'captain' : jn.role });
      if (j.msg) t.handle(c, j.msg);
      const er = out.find((m) => m.t === 'error'); if (er) return res.status(403).json({ error: er.msg });
      if (t.dirty && !(await commit(t))) continue;     // conflict -> reload and replay
      if (STATELESS && t.pending && t.pending.length) {
        const dead = await sendPush(t.rec, t.pending).catch(() => []);
        if (dead.length) { t.rec.pushSubs = (t.rec.pushSubs || []).filter((x) => !dead.includes(x.sub.endpoint)); t.dirty = true; await commit(t).catch(() => {}); }
      }
      const state = t.snapshotFor(c);
      const alerts = (jn.role === 'captain' || jn.role === 'cashier') && j.since >= 0 ? (t.rec.alerts || []).filter((a) => a.id > j.since) : [];
      return res.json({ state, guestId: c.guestId || null, alerts, alertSeq: t.rec.alertSeq || 0, notices: out.filter((m) => m.t === 'notice').map((m) => m.msg) });
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
            const ok = a && (a.r === 'super' || (a.s === m.slug && (a.r === m.role || a.r === 'admin' || (m.role === 'kitchen' && a.r === 'captain'))));
            if (!ok) { ws.send(JSON.stringify({ t: 'error', msg: 'auth' })); tenant = null; return ws.close(); }
            c.authed = true; c.staffId = a.u; c.staffName = a.n; c.adm = a.r === 'admin' || a.r === 'super';
            if (m.role === 'cashier') { c.cashier = true; m.role = 'captain'; }
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
