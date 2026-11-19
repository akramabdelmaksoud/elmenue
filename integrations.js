// Integration Hub: connect a café that already has its own POS / database. Everything a super admin configures per café lives on the
// café record (rec.integration), secrets sealed with auth.seal (AES-256-GCM keyed from SECRET). No code change is needed per customer:
//   1. menu sync   - GET menuUrl, find the list inside the JSON, map its keys to our fields, upsert items (matched by the external id)
//   2. order push  - every table / online / staff order is queued in rec.integration.outbox and POSTed to orderUrl (signed, retried)
// Outbound calls go through safeRequest(): HTTPS only, public addresses only (checked at connect time, so DNS tricks cannot reach the
// private network), no redirects, short timeout, capped response size.
const dns = require('dns'), net = require('net'), http = require('http'), https = require('https'), crypto = require('crypto');
const auth = require('./auth');

const PROTOCOLS = ['rest', 'webhook'], AUTHS = ['none', 'apikey', 'bearer', 'basic'];
const MAP_FIELDS = ['id', 'name', 'name_ar', 'price', 'category', 'category_ar', 'desc', 'emoji', 'available'];   // our side of the mapper
const MAX_BODY = 1024 * 1024, TIMEOUT = 8000, MAX_TRIES = 8, OUTBOX_MAX = 200;

// ---------- public-address check ----------
function isPublicIp(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase(); if (l === '::1' || l === '::' || l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('ff')) return false;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); return m ? isPublicIp(m[1]) : true;
  }
  const p = ip.split('.').map(Number); if (p.length !== 4 || p.some((x) => !(x >= 0 && x <= 255))) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;     // carrier-grade NAT
  if (a === 169 && b === 254) return false;               // link local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && p[2] === 0) || (b === 0 && p[2] === 2))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && p[2] === 100))) return false;
  if (a === 203 && b === 0 && p[2] === 113) return false;
  return true;
}
const guardedLookup = (allowLocal) => (host, opts, cb) => {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  dns.lookup(host, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = (addrs || []).filter((a) => allowLocal || isPublicIp(a.address));
    if (!ok.length) return cb(Object.assign(new Error('That address is not allowed (private or internal network)'), { code: 'EBLOCKED' }));
    if (opts && opts.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
};

// ---------- the one outbound HTTP function ----------
function checkUrl(u, { allowHttp } = {}) {
  let url; try { url = new URL(String(u || '').trim()); } catch { return { error: 'That is not a valid URL' }; }
  if (!(url.protocol === 'https:' || (allowHttp && url.protocol === 'http:'))) return { error: 'The URL must start with https://' };
  if (url.username || url.password) return { error: 'Put the username and password in the login fields, not in the URL' };
  if (url.href.length > 600) return { error: 'The URL is too long' };
  return { url };
}
function safeRequest(urlStr, { method = 'GET', headers = {}, body, allowHttp = false, allowLocal = false, timeout = TIMEOUT, maxBytes = MAX_BODY } = {}) {
  return new Promise((resolve, reject) => {
    const c = checkUrl(urlStr, { allowHttp }); if (c.error) return reject(new Error(c.error));
    const host = c.url.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && !allowLocal && !isPublicIp(host)) return reject(new Error('That address is not allowed (private or internal network)'));   // IP literals skip DNS, so check them here
    const lib = c.url.protocol === 'https:' ? https : http, t0 = Date.now(); let done = false;
    const fin = (fn, v) => { if (done) return; done = true; fn(v); };
    const req = lib.request(c.url, { method, headers: { 'User-Agent': 'TableTab-Integration/1.0', Accept: 'application/json', ...headers }, lookup: guardedLookup(allowLocal), timeout }, (res) => {
      const chunks = []; let n = 0;
      res.on('data', (d) => { n += d.length; if (n > maxBytes) { req.destroy(); return fin(reject, new Error('The response is larger than 1 MB')); } chunks.push(d); });
      res.on('end', () => fin(resolve, { status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - t0 }));
      res.on('error', (e) => fin(reject, e));
    });
    req.on('timeout', () => { req.destroy(); fin(reject, new Error('The server did not answer in ' + timeout / 1000 + ' seconds')); });
    req.on('error', (e) => fin(reject, new Error(e.code === 'ENOTFOUND' ? 'That host name does not exist' : e.code === 'ECONNREFUSED' ? 'The server refused the connection' : e.message)));
    if (body) req.write(body);
    req.end();
  });
}

// ---------- config: clean, seal, mask ----------
const clip = (v, n) => (v !== null && typeof v === 'object' ? '' : String(v == null ? '' : v).trim().slice(0, n));
const MASK = '••••';
const isMasked = (v) => typeof v === 'string' && v.startsWith(MASK);
const maskOf = (sealed) => { const v = sealed ? auth.unseal(sealed) : ''; return v ? MASK + String(v).slice(-3) : ''; };
const pathClean = (v) => clip(v, 80).replace(/[^\w.\[\]$-]/g, '');
// Turn what the form sent into the stored shape. Secrets that come back masked (unchanged) keep their old sealed value.
function cleanConfig(b, old) {
  b = b && typeof b === 'object' ? b : {}; old = old || {};
  const o = {
    enabled: !!b.enabled, protocol: PROTOCOLS.includes(b.protocol) ? b.protocol : 'rest',
    menuUrl: clip(b.menuUrl, 600), orderUrl: clip(b.orderUrl, 600),
    syncEveryMin: Math.max(0, Math.min(1440, Math.floor(+b.syncEveryMin) || 0)),   // 0 = manual only
    soldOutMissing: b.soldOutMissing !== false,
    auth: { type: 'none' },
    mapping: { listPath: pathClean((b.mapping || {}).listPath), priceDivisor: Math.max(0.0001, Math.min(100000, +((b.mapping || {}).priceDivisor) || 1)), fields: {} },
  };
  const a = b.auth && typeof b.auth === 'object' ? b.auth : {}, oa = old.auth || {};
  const type = AUTHS.includes(a.type) ? a.type : 'none'; o.auth.type = type;
  const keep = (nv, ov) => { nv = String(nv || '').trim().slice(0, 600); return !nv ? '' : isMasked(nv) ? ov || '' : auth.seal(nv); };
  if (type === 'apikey') { o.auth.header = clip(a.header, 40).replace(/[^\w-]/g, '') || 'X-API-Key'; o.auth.secret = keep(a.secret, oa.secret); }
  if (type === 'bearer') o.auth.secret = keep(a.secret, oa.secret);
  if (type === 'basic') { o.auth.user = clip(a.user, 120); o.auth.secret = keep(a.secret, oa.secret); }
  const f = (b.mapping || {}).fields || {}; MAP_FIELDS.forEach((k) => { const p = pathClean(f[k]); if (p) o.mapping.fields[k] = p; });
  // keep runtime state the form does not own
  o.webhookSecret = old.webhookSecret || auth.seal(crypto.randomBytes(24).toString('hex'));
  o.outbox = old.outbox || []; o.failed = old.failed || []; o.lastSync = old.lastSync || null; o.lastPush = old.lastPush || null;
  return o;
}
function viewConfig(c) {   // what the browser may see: no secrets, only masks
  if (!c) return null;
  return { enabled: !!c.enabled, protocol: c.protocol, menuUrl: c.menuUrl, orderUrl: c.orderUrl, syncEveryMin: c.syncEveryMin, soldOutMissing: c.soldOutMissing !== false,
    auth: { type: c.auth.type, header: c.auth.header || '', user: c.auth.user || '', secret: maskOf(c.auth.secret) }, mapping: c.mapping,
    webhookSecret: maskOf(c.webhookSecret), pending: (c.outbox || []).length, failed: (c.failed || []).slice(-10), lastSync: c.lastSync, lastPush: c.lastPush };
}
function authHeaders(c) {
  const a = (c && c.auth) || { type: 'none' }, s = a.secret ? auth.unseal(a.secret) : '';
  if (a.type === 'apikey' && s) return { [a.header || 'X-API-Key']: s };
  if (a.type === 'bearer' && s) return { Authorization: 'Bearer ' + s };
  if (a.type === 'basic') return { Authorization: 'Basic ' + Buffer.from((a.user || '') + ':' + s).toString('base64') };
  return {};
}
const signBody = (c, body) => 'sha256=' + crypto.createHmac('sha256', auth.unseal(c.webhookSecret) || '').update(body).digest('hex');

// ---------- JSON helpers for the mapper ----------
function getPath(obj, path) {
  if (!path) return obj;
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean); let cur = obj;
  for (const k of parts) { if (cur === null || cur === undefined || typeof cur !== 'object' || k === '__proto__' || k === 'constructor' || k === 'prototype') return undefined; cur = cur[k]; }
  return cur;
}
// find the array of items inside an arbitrary response: the root, or the first array of objects (depth <= 3)
function findList(json) {
  if (Array.isArray(json)) return { path: '', list: json };
  let best = null;
  (function walk(o, p, d) { if (best || !o || typeof o !== 'object' || d > 3) return; for (const k of Object.keys(o)) { const v = o[k], np = p ? p + '.' + k : k; if (Array.isArray(v) && v.length && typeof v[0] === 'object') { best = { path: np, list: v }; return; } if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, np, d + 1); } })(json, '', 0);
  return best;
}
// every key (dot path) of the first object, so the mapper can offer them in a dropdown
function sampleKeys(obj, prefix = '', d = 0, out = []) {
  if (!obj || typeof obj !== 'object' || d > 2) return out;
  for (const k of Object.keys(obj).slice(0, 40)) { const p = prefix ? prefix + '.' + k : k, v = obj[k]; if (v && typeof v === 'object' && !Array.isArray(v)) sampleKeys(v, p, d + 1, out); else out.push({ path: p, sample: Array.isArray(v) ? '[…]' : String(v).slice(0, 40) }); }
  return out;
}
// "AUTO" guesses for the mapper so a typical POS needs no typing
const GUESS = { id: ['id', 'sku', 'item_id', 'product_id', 'code', 'uuid'], name: ['name', 'title', 'item_title', 'item_name', 'product_name', 'label'], name_ar: ['name_ar', 'title_ar', 'arabic_name'], price: ['price', 'unit_price', 'amount', 'cost', 'selling_price', 'sale_price'], category: ['category', 'category_name', 'group', 'section', 'type'], category_ar: ['category_ar'], desc: ['description', 'desc', 'details'], emoji: ['emoji', 'icon'], available: ['available', 'in_stock', 'active', 'is_active', 'enabled'] };
function guessMapping(sample) {
  const keys = sampleKeys(sample).map((k) => k.path), lower = keys.map((k) => k.toLowerCase()), out = {};
  Object.keys(GUESS).forEach((f) => { for (const g of GUESS[f]) { const i = lower.indexOf(g); if (i >= 0) { out[f] = keys[i]; break; } } });
  return out;
}

// ---------- menu sync ----------
const truthy = (v) => !(v === false || v === 0 || v === '0' || String(v).toLowerCase() === 'false' || String(v).toLowerCase() === 'no' || String(v).toLowerCase() === 'inactive');
// rows (already found in the response) -> our items. Returns { items, skipped }.
function mapRows(rows, mapping) {
  const f = (mapping && mapping.fields) || {}, div = (mapping && mapping.priceDivisor) || 1, items = []; let skipped = 0; const seen = new Set();
  (Array.isArray(rows) ? rows : []).slice(0, 2000).forEach((r, i) => {
    const v = (k) => (f[k] ? getPath(r, f[k]) : undefined), name = clip(v('name'), 80), price = Math.round((+v('price') / div) * 100) / 100;
    if (!name || !(price >= 0) || !isFinite(price) || price > 100000) { skipped++; return; }
    let ext = clip(v('id'), 80) || name; if (seen.has(ext)) { skipped++; return; } seen.add(ext);
    items.push({ ext, name, name_ar: clip(v('name_ar'), 80), price, category: clip(v('category'), 40) || 'Menu', category_ar: clip(v('category_ar'), 40), desc: clip(v('desc'), 300), emoji: clip(v('emoji'), 8), available: f.available ? truthy(v('available')) : true });
  });
  return { items, skipped };
}
// merge into the café's menu: match on item.ext, create the rest, never touch photos / options / recipes / costs. newId is the app's id maker.
function applySync(db, mapped, { soldOutMissing = true } = {}, newId) {
  let created = 0, updated = 0, hidden = 0; const cats = db.categories, byExt = new Map(db.items.filter((i) => i.ext).map((i) => [i.ext, i]));
  const catFor = (name, ar) => { let c = cats.find((x) => x.name.toLowerCase() === name.toLowerCase() || (ar && x.name_ar === ar)); if (!c) { c = { id: newId('c'), name, name_ar: ar || '', emoji: '🍽️', ext: 1 }; cats.push(c); } return c; };
  const live = new Set();
  mapped.forEach((m) => {
    live.add(m.ext); let it = byExt.get(m.ext), cat = catFor(m.category, m.category_ar);
    if (!it) { it = { id: newId('i'), cat: cat.id, name: m.name, name_ar: m.name_ar, price: m.price, cost: 0, emoji: m.emoji || '🍽️', desc: m.desc, img: '', ext: m.ext }; db.items.push(it); created++; }
    else { let ch = false; if (it.price !== m.price) { it.price = m.price; ch = true; } if (it.name !== m.name) { it.name = m.name; ch = true; } if (m.name_ar && it.name_ar !== m.name_ar) { it.name_ar = m.name_ar; ch = true; } if (m.desc && it.desc !== m.desc) { it.desc = m.desc; ch = true; } if (ch) updated++; }
    if (!m.available) { it.soldOut = true; it.extOff = true; } else if (it.extOff) { it.soldOut = false; it.extOff = false; }
  });
  if (soldOutMissing) db.items.forEach((i) => { if (i.ext && !live.has(i.ext) && !i.soldOut) { i.soldOut = true; i.extOff = true; hidden++; } });
  return { created, updated, hidden };
}
async function fetchMenu(c, opts = {}) {
  if (!c || !c.menuUrl) throw new Error('Enter the Menu Sync URL first');
  const r = await safeRequest(c.menuUrl, { headers: authHeaders(c), allowHttp: opts.allowHttp, allowLocal: opts.allowLocal });
  if (r.status < 200 || r.status >= 300) throw Object.assign(new Error('The server answered ' + r.status), { status: r.status, body: r.text.slice(0, 300) });
  let json; try { json = JSON.parse(r.text); } catch { throw new Error('The answer is not JSON'); }
  return { json, ms: r.ms, status: r.status };
}

// ---------- order push ----------
// The order is queued by tenant.js (forward(): pure data, saved together with the order). Here we only deliver the queue.
const backoff = (n) => Math.min(30 * 60000, 5000 * 2 ** n);
// send what is due; returns true if the queue changed (the caller saves the record)
async function drain(rec, opts = {}) {
  const c = rec.integration; if (!c || !c.enabled || !c.orderUrl || !(c.outbox || []).length) return false;
  const now = Date.now(), due = c.outbox.filter((e) => e.next <= now).slice(0, 5); if (!due.length) return false;
  for (const e of due) {
    const body = JSON.stringify({ ...e.payload, delivery_id: e.id, sent_at: new Date().toISOString() });
    try {
      const r = await safeRequest(c.orderUrl, { method: 'POST', body, headers: { ...authHeaders(c), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-TableTab-Event': e.payload.event, 'X-TableTab-Delivery': e.id, 'X-TableTab-Signature': signBody(c, body) }, allowHttp: opts.allowHttp, allowLocal: opts.allowLocal, timeout: 6000 });
      if (r.status >= 200 && r.status < 300) { c.outbox = c.outbox.filter((x) => x.id !== e.id); c.lastPush = { at: Date.now(), ok: true, status: r.status, ms: r.ms }; continue; }
      throw Object.assign(new Error('The POS answered ' + r.status), { status: r.status });
    } catch (err) {
      e.tries++; e.err = String(err.message).slice(0, 120); e.next = Date.now() + backoff(e.tries); c.lastPush = { at: Date.now(), ok: false, error: e.err };
      if (e.tries >= MAX_TRIES || (err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 408)) { c.outbox = c.outbox.filter((x) => x.id !== e.id); (c.failed ||= []).push({ at: Date.now(), order: e.payload.order.id, table: e.payload.order.table, error: e.err }); if (c.failed.length > 30) c.failed.shift(); }
    }
  }
  return true;
}

module.exports = { PROTOCOLS, AUTHS, MAP_FIELDS, isPublicIp, checkUrl, safeRequest, cleanConfig, viewConfig, authHeaders, signBody, getPath, findList, sampleKeys, guessMapping, mapRows, applySync, fetchMenu, drain, MASK, isMasked };
