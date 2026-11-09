const seed = require('./data');
const F = require('./features');

const clone = (o) => JSON.parse(JSON.stringify(o));
const PRESETS = ['gizera', 'frio', 'dune', 'sufra'];   // branded prospect showrooms (presets/<name>.js)
function freshData(demo, preset) {
  // demo cafés get the photographed showroom menu (showroom.js); real customers start from the plain seed menu
  const sh = demo && typeof require === 'function' ? (PRESETS.includes(preset) ? require('./presets/' + preset) : require('./showroom')) : null;   // the browser demo has no require: it keeps the plain menu
  const d = { settings: { ...clone(seed.settings), ...(sh ? clone(sh.settings) : {}) }, categories: clone(sh ? sh.categories : seed.categories), items: clone(sh ? sh.items : seed.items), tables: clone(seed.tables), sessions: {}, history: demo ? seed.buildHistory(sh ? sh.items : undefined, sh ? 14 : 7) : [] };
  d.itemDaily = {}; d.history.forEach((h) => { const k = new Date(h.closedAt).toISOString().slice(0, 10), m = (d.itemDaily[k] ||= {}); h.items.forEach((l) => (m[l.itemId] = (m[l.itemId] || 0) + l.qty)); });
  return d;
}

// A tenant = one restaurant with its own menu, tables, sessions, history, websocket clients.
function createTenant(rec, persist, onAlert) {
  const db = rec.data;
  let simulate = false;
  let uid = Date.now() * 1000 + Math.floor(Math.random() * 1000000);
  const id = (p) => p + (uid++).toString(36);
  const save = () => persist(rec);
  const touch = () => (rec.lastActive = Date.now());
  // unguessable tokens (table keys, guest ids, booking ids): crypto randomness, never the counter above
  const rnd = (n) => { try { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return Array.from(a, (x) => (x % 36).toString(36)).join(''); } catch { let s = ''; while (s.length < n) s += Math.random().toString(36).slice(2); return s.slice(0, n); } };
  const rid = (p) => p + rnd(12);
  const rkey = () => rnd(12);
  // what each kind of screen may read from the settings: no AI notes or fiscal setup for guests and floor staff, no wifi password or payment details for the open web
  const settingsFor = (role, open) => {
    const s = db.settings; if (role === 'admin') return s;
    if (role === 'manager') { const o = { ...s }; delete o.ai; delete o.instapay; if (o.eta) o.eta = { enabled: !!o.eta.enabled }; if (o.onlinePay) o.onlinePay = { enabled: !!o.onlinePay.enabled }; return o; }   // branch / operations managers see the settings without payment details or AI notes
    const o = { ...s }; delete o.ai; if (o.eta) o.eta = { enabled: !!o.eta.enabled }; if (o.fb) o.fb = { enabled: !!o.fb.enabled }; if (o.onlinePay) o.onlinePay = { enabled: !!o.onlinePay.enabled };
    if (open) { delete o.wifiPass; delete o.instapay; }
    return o;
  };
  // Every table gets a secret key that is printed inside its QR code; returns true if anything was added
  function ensure() {
    let ch = false;
    db.tables.forEach((t) => { if (!t.key) { t.key = rkey(); ch = true; } });
    // Next-release flags: every new feature starts OFF for existing venues
    const st = db.settings;
    if (!st.fb) { st.fb = { enabled: false, googleUrl: '' }; ch = true; }
    if (!st.eta) { st.eta = { enabled: false, env: 'mock' }; ch = true; }
    if (!st.onlinePay) { st.onlinePay = { enabled: false, provider: 'sandbox' }; ch = true; }
    if (!st.offline) { st.offline = { enabled: false }; ch = true; }
    if (!db.idem) { db.idem = {}; ch = true; }
    if (!st.promo) { st.promo = { enabled: false, stack: false }; ch = true; }
    if (!db.coupons) { db.coupons = []; ch = true; }
    if (!db.offers) { db.offers = []; ch = true; }
    if (!db.gifts) { db.gifts = {}; ch = true; }
    if (!st.upsell) { st.upsell = { enabled: false, max: 3 }; ch = true; }
    if (!db.upsell) { db.upsell = { days: {}, resetAt: 0 }; ch = true; }
    if (!db.itemDaily) { db.itemDaily = {}; (db.history || []).forEach((h) => { if (h.unpaid) return; const k = new Date(h.closedAt).toISOString().slice(0, 10); const d = (db.itemDaily[k] ||= {}); h.items.forEach((l) => (d[l.itemId] = (d[l.itemId] || 0) + l.qty)); }); ch = true; }
    if (!rec.stats) { rec.stats = { staff: {} }; ch = true; }
    if (!db.reservations) { db.reservations = []; ch = true; }
    if (!db.waitlist) { db.waitlist = []; ch = true; }
    if (!db.ingredients) { db.ingredients = []; ch = true; }
    return ch;
  }
  const keyOk = (t, key) => db.settings.requireKey === false || (!!t.key && key === t.key);
  // Stale sessions: nobody ordered and nobody active -> free the table; ordered but silent for a long time -> flag as idle
  function sweep() {
    const now = Date.now(), mins = Math.max(5, +db.settings.idleMinutes || 30); let ch = false;
    Object.values(db.sessions).forEach((s) => {
      const last = s.lastAt || s.startedAt;
      if (!s.orders.length && ((!s.cart.length && now - last > mins * 60000) || now - last > Math.max(mins * 3, 90) * 60000)) { delete db.sessions[s.tableId]; ch = true; }
      else if (s.orders.length && !s.check && !s.idle && now - last > Math.max(mins * 3, 90) * 60000) { s.idle = true; ch = true; }
    });
    return ch;
  }
  function bump(c, key, add = 1) {
    if (!c.staffId) return;
    const st = ((rec.stats ||= { staff: {} }).staff[c.staffId] ||= { name: c.staffName || '?', handled: 0, respMs: 0, served: 0, started: 0, closed: 0 });
    st.name = c.staffName || st.name; st[key] = (st[key] || 0) + add;
    // time-bucketed activity log per person (the Insights tab reads it): counters per hour for 35 days + the last 150 actions
    const ix = F.STAFF_LOG_KEYS.indexOf(key); if (ix < 0) return;
    const now = Date.now(), L = ((rec.staffLog ||= {})[c.staffId] ||= { b: {}, ev: [] }), hr = Math.floor(now / 3600000), cell = (L.b[hr] ||= Array(F.STAFF_LOG_KEYS.length).fill(0));
    cell[ix] += add; if (key !== 'respMs') L.ev.push([now, ix, add]);
    if (L.ev.length > 180) L.ev.splice(0, L.ev.length - 150);
    if (Math.random() < 0.02) Object.keys(L.b).forEach((h) => { if (+h < hr - 35 * 24) delete L.b[h]; });
  }
  // ---------- Inventory (optional per item: stock = number of portions left, null = unlimited) ----------
  const tracked = (it) => it && it.stock !== undefined && it.stock !== null && it.stock !== '';
  function slog(it, delta, type, reason, who) {
    rec.stockLog = [{ at: Date.now(), itemId: it.id, item: it.name, delta, type, reason: reason || '', who: who || '', left: it.stock }, ...(rec.stockLog || [])].slice(0, 400);
  }
  // takes stock for the given lines (mutates qty down when there is not enough); returns the lines that remain
  // ingredient stock follows the recipes: sell 2 lattes, take 2x the recipe (never below zero)
  function useIng(itemId, qty, who, back) {
    if (!F.has(rec, 'recipes')) return;
    const it = db.items.find((x) => x.id === itemId); if (!it || !it.recipe || !it.recipe.length) return;
    for (const r of it.recipe) {
      const g = (db.ingredients || []).find((x) => x.id === r.ing); if (!g) continue;
      const d = (back ? 1 : -1) * r.qty * qty, next = Math.max(0, Math.round((g.stock + d) * 1000) / 1000);
      if (next === g.stock) continue; const delta = next - g.stock; g.stock = next;
      rec.ingLog = [{ at: Date.now(), ingId: g.id, ing: g.name, unit: g.unit, delta, type: back ? 'return' : 'sale', item: it.name, who: who || '', left: g.stock }, ...(rec.ingLog || [])].slice(0, 400);
    }
  }
  function takeStock(lines, who) {
    lines.forEach((l) => {
      const it = db.items.find((x) => x.id === l.itemId);
      if (tracked(it)) { const have = Math.max(0, Math.floor(+it.stock)); if (l.qty > have) l.qty = have; }
      if (l.qty <= 0) return;
      useIng(l.itemId, l.qty, who);
      if (!tracked(it)) return;
      it.stock = Math.max(0, Math.floor(+it.stock)) - l.qty; slog(it, -l.qty, 'sale', '', who);
      if (it.stock <= 0) it.soldOut = true;
    });
    return lines.filter((l) => l.qty > 0);
  }
  function putStock(itemId, qty, type, reason, who) {
    if (qty > 0) useIng(itemId, qty, who, true);
    const it = db.items.find((x) => x.id === itemId); if (!tracked(it) || qty <= 0) return;
    it.stock = Math.floor(+it.stock) + qty; slog(it, qty, type, reason, who);
    if (it.stock > 0) it.soldOut = false;
  }
  // splits what was paid into cash / card and works out the change for the cash part
  function settle(method, total, pay) {
    pay = pay || {};
    if (method === 'card') return { cash: 0, card: total, tendered: 0, change: 0 };
    if (F.DIGITAL.includes(method)) return { cash: 0, card: 0, digital: total, via: method, tendered: 0, change: 0 };   // InstaPay / wallet: money is in the bank, not the drawer
    if (method === 'mixed') {
      const card = +Math.min(total, Math.max(0, +pay.card || 0)).toFixed(2), cash = +(total - card).toFixed(2), tendered = Math.max(cash, +pay.tendered || cash);
      return { cash, card, tendered, change: +(tendered - cash).toFixed(2) };
    }
    const tendered = Math.max(total, +pay.tendered || total);
    return { cash: total, card: 0, tendered, change: +(tendered - total).toFixed(2) };
  }

// ---------- Billing ----------
// one place that turns (item, qty, chosen options) into an order line, so tables, online and staff orders all price options the same way
function mkLine(it, q, guestId, sel, note) {
    let add = 0, extra = {};
    if (it.options && it.options.length && F.has(rec, 'options')) { const r = F.optResolve(it, sel); if (!r.ok) return null; add = r.add; if (r.text) extra = { opt: r.text, opt_ar: r.text_ar, ok: r.key }; }
    return { id: id('l'), guestId, itemId: it.id, name: it.name, name_ar: it.name_ar, emoji: it.emoji, price: Math.round((it.price + add) * 100) / 100, qty: q, note: note || '', ...extra };
  }
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
  // coupons / timed offers (flag settings.promo.enabled + tier 'coupons'); stacking is the owner's choice
  let promo = { coupon: 0, offer: 0 }, couponCode = '', offerName = '';
  const pc = F.promoCfg(st);
  if (pc.enabled && F.has(rec, 'coupons') && gross > 0) {
    const now = Date.now(), cp = s.coupon && db.coupons.find((x) => x.code === s.coupon), ck = cp ? F.couponCheck(cp, gross, now) : null;
    const live = db.offers.filter((o) => F.offerLive(o, now)).map((o) => ({ o, amt: F.cutAmount(o.kind, o.value, gross) })).sort((a, b) => b.amt - a.amt)[0];
    const pk = F.promoPick({ manual: disc, coupon: ck && ck.ok ? ck.amount : 0, offer: live ? live.amt : 0, stack: pc.stack, gross });
    disc = pk.total; promo = { coupon: pk.coupon, offer: pk.offer };
    if (pk.coupon) couponCode = cp.code; if (pk.offer) offerName = live.o.name;
  }
  let red = 0, redPts = 0;   // loyalty points the guest chose to redeem (capped by what is left to pay)
  if (s.redeem && s.redeem.points > 0 && gross - disc > 0) {
    const lc = F.loyaltyCfg(st); red = Math.min(+(gross - disc).toFixed(2), F.pointsToEgp(lc, s.redeem.points));
    redPts = lc.redeemValue > 0 ? Math.min(s.redeem.points, Math.ceil(red * lc.pointsPerRedeem / lc.redeemValue)) : 0; red = +red.toFixed(2); disc = +(disc + red).toFixed(2);
  }
  const net = +(gross - disc).toFixed(2), k = gross ? net / gross : 1;
  const calc = (x) => {
    const service = +(x * st.service / 100).toFixed(2);
    const tax = +((x + service) * st.tax / 100).toFixed(2);
    return { sub: x, service, tax, total: +(x + service + tax).toFixed(2) };
  };
  Object.keys(by).forEach((g) => { by[g].gross = by[g].sub; Object.assign(by[g], calc(+(by[g].sub * k).toFixed(2))); });
  const tot = calc(net);
  let gift = 0, giftCode = '';
  if (s.gift && F.has(rec, 'giftcards') && db.gifts && db.gifts[s.gift]) { const g = db.gifts[s.gift]; if (F.giftBalanceOk(g)) { gift = Math.min(g.balance, tot.total); giftCode = s.gift; } }
  const onl = +(s.online || []).reduce((n, x) => n + x.amount - (x.tip || 0), 0).toFixed(2);   // food part paid online (tips are separate)
  return { ...tot, online: Math.min(onl, +(tot.total - gift).toFixed(2)), sub: gross, gross, discount: disc, net, redeemEgp: red, redeemPts: redPts, promoCoupon: promo.coupon, promoOffer: promo.offer, couponCode, offerName, gift: +gift.toFixed(2), giftCode, due: +Math.max(0, tot.total - gift - Math.min(onl, +(tot.total - gift).toFixed(2))).toFixed(2), byGuest: by };
}

// A verified online payment arrives. Idempotent by intent id. Returns 'applied' | 'dup' | 'nosession'.
// When the online money covers the whole bill the table closes by itself; otherwise the cashier collects the rest.
function applyOnline(tableId, p) {
  const s = db.sessions[tableId]; if (!s) return 'nosession';
  if ((s.online || []).some((x) => x.id === p.id)) return 'dup';
  (s.online ||= []).push({ id: p.id, amount: +(+p.amount).toFixed(2), tip: +(+p.tip || 0).toFixed(2), guestId: p.guestId || null, ref: String(p.ref || '').slice(0, 40), at: Date.now() });
  log(s, 'online', 'Online payment ' + (+p.amount).toFixed(2) + (p.guestId ? ' by a guest' : ''));
  const b = bill(s);
  if (b.due <= 0.004 && s.orders.length) { const t = tableOf(tableId); closeSession(t, 'online', 'online', { tip: s.online.reduce((n, x) => n + (x.tip || 0), 0) }); }
  return 'applied';
}

// a reservation counts from 45 minutes before until 20 minutes after its time
function nextRes(t) { const n = Date.now(); return (db.reservations || []).find((r) => r.tableId === t.id && n >= r.at - 45 * 60000 && n <= r.at + 20 * 60000); }
// one booking per table at a time: another live booking on the same table within 2 hours, or guests sitting there now, blocks it
function resClash(t, at, skip) {
  const r = (db.reservations || []).find((x) => x.id !== skip && x.tableId === t.id && x.status !== 'declined' && Math.abs(x.at - at) < 120 * 60000);
  if (r) return 'Table ' + t.number + ' is already reserved for ' + r.name + ' at ' + new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (db.sessions[t.id] && at < Date.now() + 60 * 60000) return 'Table ' + t.number + ' has guests now';
  return '';
}
function tableState(t) {
  const s = db.sessions[t.id];
  if (!s) return nextRes(t) ? 'reserved' : 'empty';
  if (s.requests.some((r) => !r.done && r.type !== 'bill')) return 'urgent';
  if (s.check || s.requests.some((r) => r.type === 'bill' && r.sep && !r.done)) return 'check';
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

// the first captain who works on a table owns its sales in the reports, whoever finally closes the bill
function own(s, c) { if (s && !s.owner && c && c.staffId && c.role === 'captain') s.owner = { id: c.staffId, name: c.staffName || '' }; }
function closeSession(t, method, who, pay, whoId) {
  const s = db.sessions[t.id]; if (!s) return;
  const b = bill(s);
  const lines = {};
  s.orders.forEach((o) => o.items.forEach((i) => {
    const m = db.items.find((x) => x.id === i.itemId);
    // one history line per item + chosen options (a Large Latte and a Small Latte are different prices)
    const l = (lines[i.itemId + '|' + (i.ok || '') + '|' + i.price] ||= { itemId: i.itemId, cat: m?.cat, name: i.name, qty: 0, price: i.price, cost: m?.cost || 0, ...(i.opt ? { opt: i.opt, opt_ar: i.opt_ar } : {}) });
    l.qty += i.qty;
  }));
  if (upOn() && s.orders.length && method !== 'unpaid') { const d = upDay(); s.orders.forEach((o) => o.items.forEach((i) => { if (i.up) d.revenue[i.itemId] = +((d.revenue[i.itemId] || 0) + i.qty * i.price).toFixed(2); })); }
  if (s.orders.length && method !== 'unpaid') { const k = new Date().toISOString().slice(0, 10), d = ((db.itemDaily ||= {})[k] ||= {}); Object.values(lines).forEach((l) => (d[l.itemId] = (d[l.itemId] || 0) + l.qty)); for (const x of Object.keys(db.itemDaily)) if (x < new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 10)) delete db.itemDaily[x]; }
  const tip = pay && pay.tip !== undefined && pay.tip !== null && pay.tip !== '' ? Math.max(0, +(+pay.tip).toFixed(2)) : Math.max((s.online || []).reduce((n, x) => n + (x.tip || 0), 0), Math.round(b.net * (s.check?.tipPct || 0) / 100));
  const total = +(b.total + tip).toFixed(2), giftUsed = m0 => m0 === 'unpaid' ? 0 : Math.min(b.gift || 0, total);
  const onlineAll = +(s.online || []).reduce((n, x) => n + x.amount, 0).toFixed(2), onlineTips = +(s.online || []).reduce((n, x) => n + (x.tip || 0), 0).toFixed(2);
  const m = ['cash', 'card', 'mixed', 'unpaid', 'online', 'instapay', 'wallet'].includes(method) ? method : (s.check?.method || 'cash');
  const gUsed = giftUsed(m), onlineUsed = +Math.min(onlineAll, total - gUsed).toFixed(2), payTotal = +(total - gUsed - onlineUsed).toFixed(2);
  if (m !== 'unpaid' && s.orders.length) {
    if (b.couponCode) { const cp = db.coupons.find((x) => x.code === b.couponCode); if (cp) { cp.uses = (cp.uses || 0) + 1; cp.saved = +((cp.saved || 0) + b.promoCoupon).toFixed(2); } }
    if (b.offerName) { const of = db.offers.find((x) => x.name === b.offerName); if (of) { of.uses = (of.uses || 0) + 1; of.saved = +((of.saved || 0) + b.promoOffer).toFixed(2); } }
    if (gUsed > 0) { const g = db.gifts[b.giftCode]; g.balance = +(g.balance - gUsed).toFixed(2); g.log = [{ at: Date.now(), type: 'spend', amount: gUsed, table: t.number, by: who || '' }, ...(g.log || [])].slice(0, 50); }
  }
  log(s, 'closed', 'Table paid and cleared' + (who ? ' by ' + who : ''));
  let loy = null;
  const mem = s.loyaltyPhone && db.loyalty && db.loyalty.members[s.loyaltyPhone];
  if (mem && m !== 'unpaid' && F.has(rec, 'loyalty') && s.orders.length) {
    const lc = F.loyaltyCfg(db.settings), earned = lc.enabled ? F.earnPoints(lc, b.net) : 0, at = Date.now();
    mem.points = Math.max(0, mem.points - b.redeemPts) + earned; mem.earned += earned; mem.redeemed += b.redeemPts; mem.visits++; mem.last = at;
    mem.log = [...(b.redeemPts ? [{ at, type: 'redeem', pts: b.redeemPts, egp: b.redeemEgp }] : []), ...(earned ? [{ at, type: 'earn', pts: earned }] : []), ...(mem.log || [])].slice(0, 40);
    loy = { phone: mem.phone, earned, redeemed: b.redeemPts, egp: b.redeemEgp };
  }
  if (s.orders.length) {
    db.history.push({
      id: id('h'), tableId: t.id, tableNumber: t.number, kind: s.kind || 'table', customer: s.customer || null, startedAt: s.startedAt,
      orderedAt: s.orders[0].at, checkAt: s.check?.at || Date.now(), closedAt: Date.now(),
      guests: s.guests.filter((g) => s.orders.some((o) => o.items.some((i) => i.guestId === g.id))).length || 1, loyalty: loy, items: Object.values(lines), sub: b.gross, discount: b.discount, discountNote: [s.discount ? (s.discount.reason || '') : '', b.couponCode ? 'Coupon ' + b.couponCode : '', b.offerName || ''].filter(Boolean).join(' · '), coupon: b.couponCode || '', offer: b.offerName || '', gift: gUsed, giftCode: gUsed ? b.giftCode : '', service: b.service, tax: b.tax, tip,
      total, method: payTotal <= 0 && onlineUsed > 0 && m !== 'unpaid' ? 'online' : m, unpaid: m === 'unpaid' && onlineUsed <= 0, online: onlineUsed, onlineRefs: (s.online || []).map((x) => x.ref), pay: m === 'unpaid' ? { cash: 0, card: 0, tendered: 0, change: 0, gift: 0, online: onlineUsed } : { ...settle(m === 'online' ? 'cash' : m, payTotal, pay), gift: gUsed, online: onlineUsed }, split: s.check?.split || 'table', source: s.source || '', closedBy: who || '', closedById: whoId || '', servedBy: s.owner ? s.owner.name : (who || ''), servedById: s.owner ? s.owner.id : (whoId || ''), voids: s.voids || [], log: s.log,
    });
  }
  // ETA e-receipts (flag settings.eta.enabled): remember the paid sale in a durable pending list; the server turns it into a numbered, chained receipt
  if (s.orders.length && db.settings.eta && db.settings.eta.enabled && F.has(rec, 'eta') && !(m === 'unpaid' && !(db.history[db.history.length - 1] || {}).online)) {
    const h = db.history[db.history.length - 1];
    if (h && h.tableId === t.id) (rec.etaPending ||= []).push({ hid: h.id, snap: { items: h.items.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, price: l.price })), discount: h.discount, service: h.service, tax: h.tax, tip: h.tip, total: h.total, method: h.method, tableNumber: h.tableNumber, closedAt: h.closedAt, taxRate: db.settings.tax } });
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
      { const o = { id: id('o'), at: Date.now() - 20 * 60000, status: st === 'check' ? 'served' : seed.pick(['received', 'kitchen', 'kitchen', 'served']), items }; stampEta(o); if (o.status === 'kitchen') { o.cookAt = Date.now() - seed.rnd(1, 6) * 60000; o.etaAt = o.cookAt + o.prep * 60000; } o.at = Date.now() - seed.rnd(4, 14) * 60000; s.orders.push(o); }
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
function seedLoyalty() {
  if (db.loyalty) return; const now = Date.now(), L = (db.loyalty = { members: {} });
  [['01012345678', 'Ahmed', 420, 6], ['01123456789', 'Sara', 215, 3], ['01234567890', 'Omar', 80, 2], ['01098765432', 'Mona', 960, 11]].forEach(([phone, name, points, visits], i) => {
    L.members[phone] = { phone, name, points, earned: points + 100, redeemed: 100, visits, at: now - (20 + i * 9) * 86400000, last: now - i * 86400000, log: [{ at: now - 3600000 * (i + 1), type: 'earn', pts: 24 + i * 7 }, ...(i % 2 ? [{ at: now - 7200000, type: 'redeem', pts: 100, egp: 50 }] : [])] };
  });
}

// ---------- Prep times & ETA ----------
// item.prep = minutes of cooking. An order is ready after its slowest dish, plus the queue ahead of it:
// 1 extra minute for every (stations x 5) prep-minutes still on the board (cooking orders count half).
const prepOf = (l) => { const it = db.items.find((x) => x.id === l.itemId); return it && +it.prep > 0 ? +it.prep : 6; };
function stampEta(o) {
  const stations = Math.max(1, Math.min(12, +db.settings.kitchenStations || 3));
  const longest = Math.max(3, ...o.items.map(prepOf));
  let ahead = 0;
  Object.values(db.sessions).forEach((s) => s.orders.forEach((x) => { if (x !== o && (x.status === 'received' || x.status === 'kitchen') && x.at <= o.at) ahead += x.items.reduce((n, l) => n + prepOf(l) * l.qty, 0) * (x.status === 'kitchen' ? 0.5 : 1); }));
  o.prep = longest; o.etaMin = Math.min(75, Math.round(longest + ahead / (stations * 5))); o.etaAt = o.at + o.etaMin * 60000;
  return o;
}

// ---------- Snapshots & broadcast ----------
const clients = new Set();
const view = (s) => {
  const mem = s.loyaltyPhone && db.loyalty && db.loyalty.members[s.loyaltyPhone];
  return { ...s, bill: bill(s), loyalty: mem ? { phone: mem.phone, name: mem.name, points: mem.points, visits: mem.visits } : null };
};
// units sold per item over the last 30 days, best first (feeds the upsell fallback)
function bestSellers() {
  const cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10), tot = {};
  Object.entries(db.itemDaily || {}).forEach(([day, m]) => { if (day >= cut) Object.entries(m).forEach(([id, q]) => (tot[id] = (tot[id] || 0) + q)); });
  return Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 20).map((x) => x[0]);
}
const upDay = () => { const k = new Date().toISOString().slice(0, 10); return ((db.upsell ||= { days: {}, resetAt: 0 }).days[k] ||= { shown: {}, accepted: {}, revenue: {} }); };
const upOn = () => F.has(rec, 'upsell') && db.settings.upsell && db.settings.upsell.enabled;
function snapshotFor(c) {
  // the Google review link is only ever handed out by the feedback endpoint (4-5 stars), never inside the public config
  const pubSettings = settingsFor(c.role === 'admin' && c.mgr ? 'manager' : c.role, false);
  const config = { best: bestSellers(), settings: pubSettings, categories: db.categories, items: c.role === 'customer' ? db.items.map(({ cost, recipe, ...i }) => i) : db.items, tables: c.role === 'admin' ? db.tables : db.tables.map(({ key, ...r }) => r), features: F.featuresOf(rec), plan: F.planOf(rec.plan) };
  if (c.role !== 'customer') { config.reservations = (db.reservations || []).filter((r) => r.at > Date.now() - 3 * 3600000 && r.status !== 'declined'); config.waitlist = db.waitlist || []; }
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
// ---------- Online ordering: a guest places a pickup / delivery ticket from the venue's public page (no login; pay on receipt) ----------
// Everything is validated here; the caller only supplies a random ticket id. Returns { ok, tid, number, total, prepMin } or { error, code }.
// ---------- Guest reservations and waitlist ----------
const phoneKey = (v) => String(v || '').replace(/\D/g, '').slice(-9);
function placeBooking(p) {
  const cfg = F.reserveCfg(db.settings);
  if (!F.has(rec, 'reservations') || !cfg.enabled) return { error: 'Reservations are not available here', code: 'off' };
  const wait = p.kind === 'wait';
  if (wait && !cfg.waitlist) return { error: 'The waitlist is not open right now', code: 'off' };
  const name = String(p.name || '').replace(/[<>]/g, '').trim().slice(0, 30), phone = String(p.phone || '').replace(/[^\d+]/g, '').slice(0, 20), guests = Math.floor(+p.guests), now = Date.now();
  if (!name) return { error: 'Please enter your name', code: 'name' };
  if (phone.replace(/\D/g, '').length < 7) return { error: 'Please enter a valid phone number', code: 'phone' };
  if (!(guests >= 1 && guests <= cfg.maxParty)) return { error: 'We take parties of 1 to ' + cfg.maxParty + ' here. For bigger groups please call us.', code: 'party' };
  const note = String(p.note || '').replace(/[<>]/g, '').trim().slice(0, 100), mine = phoneKey(phone);
  const live = (db.reservations || []).filter((r) => r.at > now - 3 * 3600000 && r.status !== 'declined');
  if (live.filter((r) => phoneKey(r.phone) === mine).length + (db.waitlist || []).filter((w) => phoneKey(w.phone) === mine).length >= 3) return { error: 'You already have bookings with us. Please call to change them.', code: 'limit' };
  if (wait) {
    if ((db.waitlist || []).some((w) => phoneKey(w.phone) === mine && w.status !== 'seated')) return { error: 'You are already on the waitlist', code: 'dupe' };
    if ((db.waitlist || []).length >= 60) return { error: 'The waitlist is full', code: 'full' };
    const n = Math.max(0, ...(db.waitlist || []).map((w) => w.n || 0)) + 1, w = { id: rid('wl'), n, name, phone, guests, note, at: now, status: 'waiting' };
    db.waitlist.push(w); alertCaptains('order', 0, `Waitlist: ${name} (${guests}) joined as #${n}`); save(); broadcast();
    return { ok: 1, id: w.id, n, kind: 'wait' };
  }
  const at = Math.floor(+p.at);
  if (!(at > 0)) return { error: 'Please choose a date and time', code: 'time' };
  if (at < now + cfg.leadMin * 60000) return { error: cfg.leadMin ? 'Please book at least ' + cfg.leadMin + ' minutes ahead' : 'That time has passed', code: 'lead' };
  if (at > now + cfg.daysAhead * 86400000) return { error: 'We take bookings up to ' + cfg.daysAhead + ' days ahead', code: 'far' };
  if (!F.reserveHoursOk(cfg, at)) return { error: 'We are open ' + cfg.from + ' to ' + cfg.to, code: 'hours' };
  const cap = cfg.capacity || db.tables.length * 4, taken = live.filter((r) => Math.abs(r.at - at) < 90 * 60000).reduce((n, r) => n + (r.guests || 0), 0);
  if (taken + guests > cap) return { error: 'We are fully booked around that time. Try another time or join the waitlist.', code: 'full' };
  const r = { id: rid('rv'), tableId: null, tableNumber: '', name, phone, guests, at, note, status: 'pending', source: 'online', createdAt: now };
  db.reservations.push(r); db.reservations = db.reservations.filter((x) => x.at > now - 3 * 3600000).slice(-300);
  alertCaptains('order', 0, `New booking request: ${name} (${guests}) ${new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`); save(); broadcast();
  return { ok: 1, id: r.id, kind: 'booking', at };
}
function bookingStatus(bid) {
  const r = (db.reservations || []).find((x) => x.id === bid);
  if (r) return { kind: 'booking', status: r.status || 'confirmed', at: r.at, guests: r.guests, table: r.tableNumber || '' };
  const w = (db.waitlist || []).find((x) => x.id === bid);
  if (w) return { kind: 'wait', status: w.status, n: w.n, guests: w.guests, ahead: (db.waitlist || []).filter((x) => x.status === 'waiting' && x.n < w.n).length };
  return null;
}
function bookingAct(act, bid, extra, who) {
  extra = extra || {}; const r = (db.reservations || []).find((x) => x.id === bid), w = (db.waitlist || []).find((x) => x.id === bid);
  if (!r && !w) return { error: 'Not found', code: 'nf' };
  const tbl = extra.tableId ? db.tables.find((x) => x.id === extra.tableId) : null;
  if (act === 'confirm' && r) { const t = tbl || db.tables.find((x) => x.id === r.tableId), clash = t && resClash(t, r.at, r.id); if (clash) return { error: clash, code: 'taken' }; r.status = 'confirmed'; if (t) { r.tableId = t.id; r.tableNumber = t.number; } }
  else if (act === 'decline' && r) r.status = 'declined';
  else if (act === 'notify' && w) { w.status = 'notified'; w.notifiedAt = Date.now(); }
  else if (act === 'seat') {
    const t = tbl || (r && db.tables.find((x) => x.id === r.tableId)); if (!t) return { error: 'Choose a table', code: 'table' };
    const s = openSession(t); s.lastAt = Date.now(); if (!s.guests.length) s.guests.push({ id: 'cust', name: (r || w).name, avatar: '📅' });
    log(s, 'seated', (r ? 'Reservation' : 'Waitlist') + ' for ' + (r || w).name + ' seated' + (who ? ' by ' + who : ''));
    if (r) db.reservations = db.reservations.filter((x) => x !== r); else w.status = 'seated';
  } else if (act === 'remove') { if (r) db.reservations = db.reservations.filter((x) => x !== r); else db.waitlist = db.waitlist.filter((x) => x !== w); }
  else return { error: 'Bad action', code: 'act' };
  db.waitlist = (db.waitlist || []).filter((x) => x.status !== 'seated' || Date.now() - x.at < 3600000).slice(-80);
  save(); broadcast(); return { ok: 1 };
}
function placeOnline(p) {
  const o = F.onlineCfg(db.settings), isCar = p.kind === 'car', cc = F.carCfg(db.settings);
  if (isCar) { if (!F.has(rec, 'carservice') || !cc.enabled) return { error: 'Car service is not available at this venue', code: 'off' }; }
  else if (!F.has(rec, 'online') || !o.enabled) return { error: 'Online ordering is not available at this venue', code: 'off' };
  const kind = isCar ? 'car' : p.kind === 'delivery' ? 'delivery' : 'takeaway';
  if (!isCar && (kind === 'delivery' ? !o.delivery : !o.pickup)) return { error: kind === 'delivery' ? 'Delivery is not offered' : 'Pickup is not offered', code: 'kind' };
  const name = String(p.name || '').trim().slice(0, 30), phone = String(p.phone || '').replace(/[^\d+]/g, '').slice(0, 20), address = String(p.address || '').trim().slice(0, 240), phone2 = String(p.phone2 || '').replace(/[^\d+]/g, '').slice(0, 20);
  if (!name) return { error: 'Please enter your name', code: 'name' };
  if (phone.replace(/\D/g, '').length < 7) return { error: 'Please enter a valid phone number', code: 'phone' };
  if (kind === 'delivery' && address.length < 6) return { error: 'Please enter your delivery address', code: 'address' };
  const car = isCar ? F.carClean(p.car, cc) : null; if (car && car.error) return car;
  if (!/^tk_[a-z0-9]{6,14}$/.test(String(p.tid || '')) || db.sessions[p.tid]) return { error: 'Bad request', code: 'tid' };
  const want = [], dropped = []; let bad = '';
  (Array.isArray(p.items) ? p.items : []).slice(0, 40).forEach((x) => {
    const it = db.items.find((y) => y.id === x.itemId), q = Math.min(20, Math.floor(+x.qty));
    if (it && it.soldOut && q > 0) dropped.push(it.name);
    if (!it || it.soldOut || !(q > 0) || it.id === o.feeItemId) return;
    const ln = mkLine(it, q, 'cust', x.opts, String(x.note || '').slice(0, 140)); if (!ln) { bad = it.name; return; }
    want.push(ln);
  });
  if (bad) return { error: 'Please choose the options for ' + bad, code: 'opt' };
  if (dropped.length) return { error: 'Sold out: ' + dropped.join(', '), code: 'soldout', dropped };
  if (!want.length) return { error: 'Your order is empty', code: 'empty' };
  const food = want.reduce((n, l) => n + l.price * l.qty, 0);
  if (!isCar && o.minOrder && food < o.minOrder) return { error: `The minimum order is ${o.minOrder}`, code: 'min', min: o.minOrder };
  // delivery price: by distance zone when zones are set (needs the guest's location), otherwise the flat fee item. Checked before stock is touched.
  // named areas with a fixed fee (owner-set) take precedence over distance rings
  const areaSel = kind === 'delivery' ? F.areaFor(db.settings, p.areaId) : { ok: true, none: true };
  if (!areaSel.ok) return { error: 'Please choose your delivery area', code: 'area' };
  const area = areaSel.area || null;
  if (area && area.minOrder && food < area.minOrder) return { error: `The minimum order for ${area.name} is ${area.minOrder}`, code: 'min', min: area.minOrder };
  const zone = kind === 'delivery' && !area ? F.zoneFor(db.settings, p.geo) : null;
  if (zone && !zone.ok) return zone.code === 'far' ? { error: `Sorry, we deliver up to ${zone.max} km. You are ${zone.km} km away.`, code: 'far', km: zone.km, max: zone.max } : { error: 'Please share your location so we can price delivery', code: 'nogeo' };
  const lines = takeStock(want, 'online');
  if (!lines.length) return { error: 'Those items just ran out', code: 'soldout' };
  const byZone = zone && !zone.flat, fee = kind === 'delivery' && !byZone && !area && o.feeItemId ? db.items.find((y) => y.id === o.feeItemId) : null;
  if (area && area.fee > 0) lines.push({ id: id('l'), guestId: 'cust', itemId: 'delivery_fee', name: 'Delivery - ' + area.name, name_ar: 'توصيل - ' + (area.name_ar || area.name), emoji: '🛵', price: area.fee, qty: 1, note: area.name });
  if (byZone && zone.fee > 0) lines.push({ id: id('l'), guestId: 'cust', itemId: 'delivery_fee', name: 'Delivery', name_ar: 'توصيل', emoji: '🛵', price: zone.fee, qty: 1, note: zone.km + ' km' });
  if (fee) lines.push({ id: id('l'), guestId: 'cust', itemId: fee.id, name: fee.name, name_ar: fee.name_ar, emoji: fee.emoji, price: fee.price, qty: 1, note: '' });
  db.ticketSeq = (db.ticketSeq || 0) + 1;
  const s = { id: id('s'), tableId: p.tid, tableNumber: (kind === 'car' ? 'CR-' : kind === 'delivery' ? 'DL-' : 'TA-') + db.ticketSeq, kind, source: isCar ? 'car' : 'online', startedAt: Date.now(), lastAt: Date.now(), guests: [{ id: 'cust', name, avatar: kind === 'car' ? '🚗' : kind === 'delivery' ? '🛵' : '🛍️' }], cart: [], orders: [], requests: [], check: null, log: [], customer: { name, phone, ...(phone2.replace(/\D/g, '').length >= 7 ? { phone2 } : {}), address, ...(car ? { car } : {}), note: String(p.note || '').trim().slice(0, 200), ...(F.geoPoint(p.geo) ? { map: 'https://www.google.com/maps?q=' + F.geoPoint(p.geo).lat + ',' + F.geoPoint(p.geo).lng, geo: F.geoPoint(p.geo), km: zone ? zone.km : undefined } : {}), ...(p.acct ? { accountId: String(p.acct).slice(0, 24) } : {}) },
    ...(kind === 'delivery' ? { delivery: { status: 'new', areaId: area ? area.id : '', areaName: area ? area.name : '', areaName_ar: area ? area.name_ar : '', etaMin: area ? area.etaMin : 0, history: [{ at: Date.now(), s: 'new' }] } } : {}) };
  s.orders.push(stampEta({ id: id('o'), at: Date.now(), status: 'received', items: lines, by: 'online' }));
  db.sessions[p.tid] = s; log(s, 'ordered', `Online ${kind} order from ${name} (${lines.reduce((n, l) => n + l.qty, 0)} item(s))`);
  alertCaptains('order', s.tableNumber, isCar ? `🚗 Car ${s.tableNumber}: ${name} · ${car.color} ${car.type}${car.spot ? ' · spot ' + car.spot : ''}` : `🌐 Online ${kind === 'delivery' ? 'delivery' : 'pickup'} ${s.tableNumber}: ${name}`);
  save(); broadcast();
  return { ok: 1, tid: p.tid, number: s.tableNumber, kind, total: bill(s).total, prepMin: (isCar ? cc.prepMin : o.prepMin) + (area ? area.etaMin || 0 : 0), ...(area ? { area: area.name, fee: area.fee } : {}) };
}
// public tracking for the guest: derived from the ticket's orders; a closed ticket is 'done'
function onlineStatus(tid) {
  const s = db.sessions[tid];
  if (!s || (s.source !== 'online' && s.source !== 'car')) return { status: s ? 'unknown' : 'done' };
  const st = s.orders.map((x) => x.status), pick = (...k) => st.some((x) => k.includes(x));
  let status = pick('received') && !pick('kitchen', 'ready', 'served') ? 'received' : pick('received', 'kitchen') ? 'preparing' : 'ready';
  const d = s.kind === 'delivery' ? s.delivery : null;
  if (d && d.status === 'out') status = 'out'; else if (d && d.status === 'delivered') status = 'delivered'; else if (d && d.status === 'failed') status = 'failed';
  const pos = d && d.pos && Date.now() - d.pos.at < 300000 ? d.pos : null, to = s.customer && s.customer.geo;
  return { status, number: s.tableNumber, kind: s.kind, total: bill(s).total, at: s.startedAt, ...(s.kind === 'car' ? { arrived: !!(s.customer.car && s.customer.car.arrived), spot: (s.customer.car || {}).spot || '' } : {}),
    ...(d ? { delivery: { state: d.status, area: d.areaName || '', area_ar: d.areaName_ar || '', etaMin: d.etaMin || 0, driver: d.driverName || '', driverPhone: d.driverPhone || '', outAt: d.outAt || 0, deliveredAt: d.deliveredAt || 0, pos: pos ? { lat: pos.lat, lng: pos.lng, at: pos.at } : null, toKm: pos && to ? Math.round(F.distM(pos, to) / 100) / 10 : null, history: (d.history || []).slice(-12) } } : {}) };
}
// ---- delivery desk: drivers and staff move a delivery ticket through new -> out -> delivered; the guest sees it live ----
// 'cooking' while any order is still with the kitchen, 'ready' when all food is ready, then the delivery's own state
function deliveryStage(s) {
  const d = s.delivery || {}; if (d.status === 'out' || d.status === 'delivered' || d.status === 'failed') return d.status;
  return s.orders.some((o) => o.status === 'received' || o.status === 'kitchen') || !s.orders.length ? 'cooking' : 'ready';
}
function deliveryRow(s) {
  const d = s.delivery || {}, c = s.customer || {}, g = c.geo || F.geoPoint({ lat: (/q=([-\d.]+),/.exec(c.map || '') || [])[1], lng: (/,([-\d.]+)$/.exec(c.map || '') || [])[1] });
  return { tid: s.tableId, number: s.tableNumber, name: c.name || '', phone: c.phone || '', phone2: c.phone2 || '', address: c.address || '', note: c.note || '', map: g ? 'https://www.google.com/maps?q=' + g.lat + ',' + g.lng : '', nav: g ? 'https://www.google.com/maps/dir/?api=1&destination=' + g.lat + ',' + g.lng : '', geo: g || null, km: c.km,
    area: d.areaName || '', stage: deliveryStage(s), driverId: d.driverId || '', driverName: d.driverName || '', at: s.startedAt, outAt: d.outAt || 0, deliveredAt: d.deliveredAt || 0, failNote: d.failNote || '',
    items: s.orders.flatMap((o) => o.items.filter((i) => i.itemId !== 'delivery_fee').map((i) => ({ name: i.name, name_ar: i.name_ar, qty: i.qty, opt: i.opt || '', note: i.note || '' }))), total: bill(s).total, cash: true };
}
// the driver screen: my jobs and the ones nobody has taken yet (food cooking or ready), delivered jobs stay visible for 3 hours
function deliveryList(driverId, all) {
  const now = Date.now(), rows = Object.values(db.sessions).filter((s) => s.kind === 'delivery' && s.delivery).map(deliveryRow).filter((r) => {
    if (r.stage === 'delivered' || r.stage === 'failed') return (all || r.driverId === driverId) && now - (r.deliveredAt || r.at) < 3 * 3600000;
    return all || !r.driverId || r.driverId === driverId;
  });
  const rank = { out: 0, ready: 1, cooking: 2, delivered: 3, failed: 4 };
  return rows.sort((a, b) => (rank[a.stage] - rank[b.stage]) || a.at - b.at);
}
const dHist = (d, st) => { (d.history ||= []).push({ at: Date.now(), s: st }); d.history = d.history.slice(-20); };
// act: assign (staff picks a driver), claim / release / pickup / delivered / failed (driver or staff), ping (driver position)
function deliveryAct(tid, act, who, x) {
  const s = db.sessions[tid]; if (!s || s.kind !== 'delivery' || !s.delivery) return { error: 'Delivery ticket not found', code: 'nf' };
  const d = s.delivery, isDriver = who.role === 'driver', stage = deliveryStage(s), name = who.name || (isDriver ? 'Driver' : 'Staff');
  if (stage === 'delivered' && act !== 'ping') return { error: 'This delivery is already completed', code: 'done' };
  if (isDriver && d.driverId && d.driverId !== who.id) return { error: 'Another driver has this delivery', code: 'taken' };
  x = x || {};
  if (act === 'assign') {
    if (isDriver) return { error: 'Not allowed', code: 'role' };
    if (!x.driverId) { delete d.driverId; delete d.driverName; delete d.driverPhone; if (d.status === 'out') { d.status = 'new'; delete d.outAt; dHist(d, 'new'); } log(s, 'delivery', 'Driver removed by ' + name); }
    else { const dr = (rec.staff || []).find((u) => u.id === x.driverId && u.role === 'driver' && u.active !== false); if (!dr) return { error: 'Choose an active driver', code: 'driver' }; d.driverId = dr.id; d.driverName = dr.name; d.driverPhone = dr.phone || ''; log(s, 'delivery', `Assigned to ${dr.name} by ${name}`); alertCaptains('request', s.tableNumber, `🛵 ${s.tableNumber} assigned to ${dr.name}`); }
  } else if (act === 'claim') {
    if (!isDriver) return { error: 'Only a driver can take a delivery', code: 'role' };
    d.driverId = who.id; d.driverName = who.name; d.driverPhone = who.phone || ''; log(s, 'delivery', `${name} took the delivery`); alertCaptains('request', s.tableNumber, `🛵 ${name} took ${s.tableNumber}`);
  } else if (act === 'release') {
    if (stage === 'out' && isDriver) return { error: 'Call the restaurant before giving back an order that is already out', code: 'out' };
    delete d.driverId; delete d.driverName; delete d.driverPhone; if (d.status === 'out') { d.status = 'new'; delete d.outAt; dHist(d, 'new'); } log(s, 'delivery', name + ' gave the delivery back');
  } else if (act === 'pickup') {
    if (stage === 'cooking') return { error: 'The food is not ready yet', code: 'cooking' };
    if (!d.driverId) { if (isDriver) { d.driverId = who.id; d.driverName = who.name; d.driverPhone = who.phone || ''; } else return { error: 'Choose a driver first', code: 'driver' }; }
    d.status = 'out'; d.outAt = Date.now(); dHist(d, 'out'); log(s, 'delivery', `Out for delivery with ${d.driverName || name}`);
  } else if (act === 'delivered') {
    if (d.status !== 'out') return { error: 'Mark the order as picked up first', code: 'notout' };
    d.status = 'delivered'; d.deliveredAt = Date.now(); d.cash = bill(s).total; dHist(d, 'delivered'); delete d.pos;
    s.orders.forEach((o) => { o.status = 'closed'; o.servedAt = o.servedAt || Date.now(); o.items.forEach((i) => { if (!i.served) { i.served = Date.now(); i.servedBy = d.driverName || name; } }); });
    log(s, 'delivery', `Delivered by ${d.driverName || name}`); alertCaptains('check', s.tableNumber, `✅ ${s.tableNumber} delivered by ${d.driverName || name} - collect ${d.cash} from the driver`);
  } else if (act === 'failed') {
    d.status = 'failed'; d.failNote = String(x.note || '').replace(/[<>]/g, '').slice(0, 160); d.deliveredAt = Date.now(); dHist(d, 'failed'); log(s, 'delivery', `Could not deliver: ${d.failNote || 'no reason given'}`); alertCaptains('urgent', s.tableNumber, `⚠️ ${s.tableNumber} could not be delivered${d.failNote ? ': ' + d.failNote : ''}`);
  } else if (act === 'ping') {
    const g = F.geoPoint(x.geo); if (g && d.status === 'out') d.pos = { ...g, at: Date.now() };
    return { ok: 1 };
  } else return { error: 'Unknown action', code: 'act' };
  save(); broadcast(); return { ok: 1, stage: deliveryStage(s) };
}
// the guest taps "I'm here" (and may correct the spot): staff get an alert with the car details
function carArrive(tid, spot) {
  const s = db.sessions[tid]; if (!s || s.kind !== 'car' || !s.customer || !s.customer.car) return { error: 'Not found', code: 'nf' };
  const cc = F.carCfg(db.settings), car = s.customer.car, sp = String(spot == null ? '' : spot).replace(/[<>]/g, '').trim().slice(0, 12);
  if (cc.spots > 0 && sp && !(/^\d+$/.test(sp) && +sp >= 1 && +sp <= cc.spots)) return { error: 'Choose your parking spot number', code: 'spot' };
  if (sp) car.spot = sp; if (!car.arrived) car.arrived = Date.now();
  log(s, 'arrived', `Guest arrived${car.spot ? ' at spot ' + car.spot : ''}`);
  alertCaptains('request', s.tableNumber, `🚗 ${s.tableNumber} is here: ${car.color} ${car.type}${car.spot ? ' · spot ' + car.spot : ''} (${s.customer.name})`);
  save(); broadcast(); return { ok: 1, spot: car.spot };
}

function handle(c, m) {
  // idempotency: a queued staff action replayed after a reconnect (same key) is applied once only
  if (m && m.k && m.t !== 'join' && c.joined) {
    const k = String(m.k).slice(0, 64), seen = (db.idem ||= {});
    if (seen[k]) { c.ws.send(JSON.stringify({ t: 'notice', msg: 'Already applied', code: 'dup' })); return; }
    seen[k] = Date.now(); const ks = Object.keys(seen); if (ks.length > 800) ks.sort((a, b) => seen[a] - seen[b]).slice(0, ks.length - 600).forEach((x) => delete seen[x]);
  }
  if (m.t === 'join') {
    if (c.joined) return;
    if (m.role !== 'customer' && !c.authed) return;
    if (m.role === 'kitchen' && !F.has(rec, 'kds')) return c.ws.send(JSON.stringify({ t: 'error', msg: 'The Kitchen Display needs the Operations plan' }));
    c.joined = true;
    c.role = m.role;
    if (m.role === 'customer') {
      c.tableNumber = +m.tableNumber;
      const t = db.tables.find((x) => x.number === c.tableNumber);
      if (!t) return c.ws.send(JSON.stringify({ t: 'error', msg: 'Unknown table' }));
      const known = db.sessions[t.id] && db.sessions[t.id].guests.find((x) => x.id === m.guestId);
      if (!known && m.resume) return c.ws.send(JSON.stringify({ t: 'error', msg: 'newsession' }));
      if (!known && !keyOk(t, m.key)) return c.ws.send(JSON.stringify({ t: 'error', msg: 'scan' }));
      // in-cafe lock: a new guest must be physically at the cafe (a table the waiter seated is exempt: staff vouch for it)
      if (!known && F.has(rec, 'geo') && F.geoLockCfg(db.settings).enabled && !(db.sessions[t.id] && db.sessions[t.id].staffSeated)) { const gc = F.geoCheck(db.settings, m.geo); if (!gc.ok) return c.ws.send(JSON.stringify({ t: 'error', msg: 'geo', code: gc.code, dist: gc.dist })); }
      const s = openSession(t); s.lastAt = Date.now(); s.idle = false;
      let g = s.guests.find((x) => x.id === m.guestId);
      if (!g) { g = { id: rid('g'), name: m.name || 'Guest', avatar: m.avatar || '🙂' }; s.guests.push(g); if (!s.host || !s.guests.some((x) => x.id === s.host)) s.host = g.id; log(s, 'join', `${g.avatar} ${g.name} joined${s.host === g.id ? ' (host)' : ''}`); }
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
    // Tier 1 (Basic QR Menu) is a scan-only menu: no ordering from the phone
    if (['cart_add', 'cart_qty', 'cart_note', 'send_order', 'order_item_remove', 'order_item_qty', 'order_cancel'].includes(m.t) && !F.has(rec, 'ordering')) return;
    switch (m.t) {
      case 'loyalty_join': {
        const lc = F.loyaltyCfg(db.settings), ph = F.cleanPhone(m.phone); if (!F.has(rec, 'loyalty') || !lc.enabled || !ph) break;
        const L = (db.loyalty ||= { members: {} }); let mem = L.members[ph];
        const deny = (code, left) => c.ws.send(JSON.stringify({ t: 'notice', msg: { bad: 'Choose a PIN of 4 to 6 digits', wrong: 'Wrong PIN' + (left ? ' (' + left + ' tries left)' : ''), locked: 'Too many tries. This card is locked for 15 minutes.', many: 'Too many new cards from this table' }[code], code: 'loy_' + code }));
        if (!mem) { if ((s.loyNew || 0) >= 3) return deny('many'); if (!F.pinOk(m.pin)) return deny('bad'); mem = { phone: ph, name: String(m.name || '').slice(0, 24), points: 0, earned: 0, redeemed: 0, visits: 0, at: Date.now(), log: [] }; }
        const pc = F.pinCheck(mem, m.pin, Date.now());
        if (!pc.ok) { if (L.members[ph]) save(); return deny(pc.code, pc.left); }
        if (!L.members[ph]) { L.members[ph] = mem; s.loyNew = (s.loyNew || 0) + 1; }
        if (m.name && !mem.name) mem.name = String(m.name).slice(0, 24);
        s.loyaltyPhone = ph; s.redeem = null; log(s, 'loyalty', `${mem.name || 'Guest'} joined the loyalty card`); break;
      }
      case 'coupon_apply': {
        if (!F.promoCfg(db.settings).enabled || !F.has(rec, 'coupons')) { c.ws.send(JSON.stringify({ t: 'notice', msg: 'Coupons are not available here' })); break; }
        const code = F.normCode(m.code), cp = db.coupons.find((x) => x.code === code), gross = bill(s).gross, ck = F.couponCheck(cp, gross, Date.now());
        if (!ck.ok) { c.ws.send(JSON.stringify({ t: 'notice', msg: { unknown: 'Code not recognised', inactive: 'This code is not active', notyet: 'This code is not valid yet', expired: 'This code has expired', used: 'This code has been fully used', min: 'Spend at least ' + (ck.min || 0) + ' to use this code' }[ck.reason] || 'Code not valid', code: 'coupon_' + ck.reason })); break; }
        s.coupon = code; log(s, 'coupon', 'Coupon ' + code + ' applied'); break;
      }
      case 'coupon_remove': if (s.coupon) { log(s, 'coupon', 'Coupon ' + s.coupon + ' removed'); s.coupon = null; } break;
      case 'gift_apply': {
        const code = F.normCode(m.code), g = db.gifts && db.gifts[code];
        if (!F.has(rec, 'giftcards') || !F.giftBalanceOk(g)) { c.ws.send(JSON.stringify({ t: 'notice', msg: 'Gift card not valid', code: 'gift_bad' })); break; }
        s.gift = code; log(s, 'gift', 'Gift card ' + code.slice(0, 4) + '… applied'); break;
      }
      case 'gift_remove': s.gift = null; break;
      case 'loyalty_leave': s.loyaltyPhone = null; s.redeem = null; break;
      case 'loyalty_redeem': {
        const mem = s.loyaltyPhone && db.loyalty && db.loyalty.members[s.loyaltyPhone]; if (!mem) break;
        const pts = Math.max(0, Math.min(mem.points, Math.floor(+m.points) || 0)); s.redeem = pts ? { points: pts } : null; break;
      }
      case 'order_item_qty': {   // grace window: change an amount until the waiter sends the order to the kitchen
        for (const o of s.orders) {
          const l = o.items.find((x) => x.id === m.id && x.guestId === c.guestId); if (!l) continue;
          if (o.status !== 'received') break;
          if (m.d > 0) { if (l.qty < 20 && takeStock([{ itemId: l.itemId, qty: 1 }]).length) l.qty++; }
          else { putStock(l.itemId, 1, 'return', 'guest changed'); l.qty--; if (l.qty <= 0) { o.items.splice(o.items.indexOf(l), 1); if (!o.items.length) s.orders = s.orders.filter((x) => x !== o); } }
          log(s, 'ordered', 'Guest changed an item while the order was pending'); break;
        }
        break;
      }
      case 'order_cancel': {   // grace window: withdraw all of my items from a pending order
        const o = s.orders.find((x) => x.id === m.id && x.status === 'received'); if (!o) break;
        o.items.filter((x) => x.guestId === c.guestId).forEach((l) => putStock(l.itemId, l.qty, 'return', 'guest cancelled'));
        o.items = o.items.filter((x) => x.guestId !== c.guestId); if (!o.items.length) s.orders = s.orders.filter((x) => x !== o);
        log(s, 'ordered', 'Guest cancelled a pending order'); break;
      }
      case 'host_set': {   // the table host (first to sit down) can hand the role to anyone at the table
        const cur = s.guests.some((x) => x.id === s.host) ? s.host : (s.guests[0] || {}).id, to = s.guests.find((x) => x.id === m.guestId);
        if (to && c.guestId === cur && to.id !== cur) { s.host = to.id; log(s, 'host', `${to.avatar} ${to.name} is now the table host`); }
        break;
      }
      case 'profile': { const g = s.guests.find((x) => x.id === c.guestId); if (g) { g.name = String(m.name || g.name).slice(0, 20); g.avatar = String(m.avatar || g.avatar).slice(0, 8); } break; }
      case 'upsell_shown': {
        if (!upOn()) break; const seen = (s.upSeen ||= {}), d = upDay();
        (Array.isArray(m.ids) ? m.ids : []).slice(0, 6).forEach((x) => { if (db.items.some((i) => i.id === x) && !seen[x]) { seen[x] = 1; d.shown[x] = (d.shown[x] || 0) + 1; } });
        break;
      }
      case 'cart_add': {
        const it = db.items.find((x) => x.id === m.itemId); if (!it || it.soldOut) break;
        const nl = mkLine(it, 1, c.guestId, m.opts, '');
        if (!nl) { c.ws.send(JSON.stringify({ t: 'notice', msg: 'Please choose the options for this item', code: 'opt', itemId: it.id })); break; }
        const ex = s.cart.find((l) => l.itemId === it.id && l.guestId === c.guestId && !l.note && (l.ok || '') === (nl.ok || ''));
        if (ex) { if (ex.qty < 20) ex.qty++; }
        else if (s.cart.length < 40) {
          const up = !!m.up && upOn();   // added from the "Add something?" strip
          s.cart.push({ ...nl, ...(up ? { up: 1 } : {}) });
          if (up) { const d = upDay(); d.accepted[it.id] = (d.accepted[it.id] || 0) + 1; }
        }
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
        s.orders.push(stampEta({ id: id('o'), at: Date.now(), status: 'received', items: mine, by: c.guestId }));
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
        const labels = { waiter: 'Call waiter', water: 'Water', napkins: 'Napkins', cutlery: 'Cutlery & covers', urgent: 'Speed up order' };
        if (!labels[m.type] || s.requests.some((r) => r.type === m.type && !r.done)) break;
        const gq = s.guests.find((x) => x.id === c.guestId); if (gq) { gq.cd ||= {}; if (Date.now() - (gq.cd[m.type] || 0) < 45000) break; gq.cd[m.type] = Date.now(); }
        s.requests.push({ id: id('r'), type: m.type, at: Date.now(), done: false, by: c.guestId });
        log(s, 'request', labels[m.type]);
        alertCaptains(m.type === 'urgent' || m.type === 'waiter' ? 'urgent' : 'request', t.number, `Table ${t.number}: ${labels[m.type]}`);
        break;
      }
      case 'pay_claim': {   // the guest says they sent the money (InstaPay / wallet); the cashier still confirms before the table closes
        if (!F.has(rec, 'instapay') || !F.ipCfg(db.settings).enabled || !s || !s.orders.length || !F.DIGITAL.includes(m.method)) break;
        const ref = String(m.ref || '').replace(/[^\w\- .#]/g, '').trim().slice(0, 40), g = s.guests.find((x) => x.id === c.guestId);
        s.payClaim = { method: m.method, ref, by: c.guestId, name: g ? g.name : '', at: Date.now(), amount: +(+m.amount || 0).toFixed(2) };
        log(s, 'check', `Guest says paid by ${m.method}${ref ? ' ref ' + ref : ''}`);
        alertCaptains('check', t.number, `Table ${t.number}: guest says paid by ${m.method === 'wallet' ? 'wallet' : 'InstaPay'}${ref ? ' (' + ref + ')' : ''} - please confirm`);
        break;
      }
      case 'check': {
        if (!s.orders.length) break;
        const method = ['card', 'instapay', 'wallet'].includes(m.method) && (m.method === 'card' || (F.has(rec, 'instapay') && F.ipCfg(db.settings).enabled)) ? m.method : 'cash';
        if (m.scope === 'mine' || m.split === 'self') {
          // a SEPARATE check: only this guest's own items with their share of service and tax; the table keeps ordering, the host settles it when they leave
          const gq = s.guests.find((x) => x.id === c.guestId), mine = gq && bill(s).byGuest[c.guestId]; if (!mine || !mine.items.length) break;
          const tipPct = Math.min(100, Math.max(0, +m.tipPct || 0)), amount = +(mine.total + Math.round(mine.sub * tipPct / 100)).toFixed(2);
          (s.sepChecks ||= {})[c.guestId] = { method, tipPct, at: Date.now() };
          s.requests = s.requests.filter((r) => !(r.type === 'bill' && r.sep && r.by === c.guestId && r.done));
          if (!s.requests.some((r) => r.type === 'bill' && r.sep && r.by === c.guestId && !r.done)) s.requests.push({ id: id('r'), type: 'bill', at: Date.now(), done: false, sep: true, by: c.guestId });
          log(s, 'check', `${gq.name} asked for a separate check (${amount})`);
          alertCaptains('check', t.number, `Table ${t.number}: ${gq.name} asks for a SEPARATE check - ${amount}`);
          break;
        }
        s.check = { method, split: ['table', 'custom'].includes(m.split) ? m.split : 'table', tipPct: +m.tipPct || 0, custom: m.custom || null, by: c.guestId, at: Date.now() };
        if (!s.requests.some((r) => r.type === 'bill' && !r.sep && !r.done)) s.requests.push({ id: id('r'), type: 'bill', at: Date.now(), done: false });
        log(s, 'check', `Check requested (${s.check.split}, ${s.check.method})`);
        alertCaptains('check', t.number, `Table ${t.number} requests the FULL table check (${s.check.method}, ${s.check.split})`);
        break;
      }
      case 'check_cancel':
        if (m.scope === 'mine') { if (s.sepChecks) delete s.sepChecks[c.guestId]; s.requests = s.requests.filter((r) => !(r.type === 'bill' && r.sep && r.by === c.guestId)); }
        else { s.check = null; s.requests = s.requests.filter((r) => r.type !== 'bill' || r.sep); }
        break;
    }
    return broadcast();
  }
  if (c.role === 'kitchen') {
    if (m.t === 'order_status' && ['kitchen', 'served'].includes(m.status)) setStatus(c, m);
    if (m.t === 'order_lane') setLane(c, m);
    return broadcast();
  }
  if (c.role === 'captain') {
    switch (m.t) {
      case 'order_status': setStatus(c, m); break;
      case 'order_lane': setLane(c, m); break;
      case 'serve_items': {
        // the waiter takes the ready dishes to the table: tick what was served, the rest stays on the screen; the order closes when its last dish is served
        const t = tableOf(m.tableId), s = t && db.sessions[t.id], o = s && s.orders.find((x) => x.id === m.orderId); if (!o || o.status !== 'served') break;
        const want = new Set(Array.isArray(m.items) ? m.items.slice(0, 60).map(String) : []); let n = 0, left = 0; const names = [];
        for (const it of o.items) { if (!it.served && (m.all || want.has(it.id))) { it.served = Date.now(); it.servedBy = c.staffName || ''; n++; names.push(it.qty + '× ' + it.name); } if (!it.served) left++; }
        if (!n) break;
        if (!left) { o.status = 'closed'; o.servedAt = Date.now(); }
        own(s, c); bump(c, 'delivered'); s.lastAt = Date.now(); log(s, 'served', `Served ${names.join(', ')}` + (left ? ` (${left} still to serve)` : '') + (c.staffName ? ' by ' + c.staffName : ''));
        break;
      }
      case 'clear_empty': {
        // nobody is sitting here and nothing was ordered: remove the visit completely (no sale, no statistics, nothing kept)
        const t = tableOf(m.tableId), s = t && db.sessions[t.id]; if (s && !s.orders.length) delete db.sessions[t.id];
        break;
      }
      case 'host_set': { const t = tableOf(m.tableId), s = t && db.sessions[t.id], to = s && s.guests.find((x) => x.id === m.guestId); if (to) { s.host = to.id; log(s, 'host', `${to.avatar} ${to.name} is now the table host (set by staff)`); } break; }
      case 'resolve_request': {
        const s = db.sessions[m.tableId]; const r = s?.requests.find((x) => x.id === m.id);
        if (r) { own(s, c); r.done = true; log(s, 'handled', `Request ${r.type} handled` + (c.staffName ? ' by ' + c.staffName : '')); bump(c, 'handled'); bump(c, 'respMs', Math.max(0, Date.now() - r.at)); }
        break;
      }
      case 'close_table': { const t = tableOf(m.tableId); if (t) { bump(c, 'closed'); closeSession(t, m.unpaid ? 'unpaid' : m.method, c.staffName, m.pay, c.staffId); } break; }
      case 'open_ticket': {
        // takeaway / delivery order that is not tied to a table
        if (!['takeaway', 'delivery', 'car'].includes(m.kind) || (m.kind === 'car' && !F.has(rec, 'carservice')) || !/^tk_[a-z0-9]{6,14}$/.test(String(m.tid || '')) || db.sessions[m.tid]) break;
        db.ticketSeq = (db.ticketSeq || 0) + 1;
        const s = { id: id('s'), tableId: m.tid, tableNumber: (m.kind === 'car' ? 'CR-' : m.kind === 'delivery' ? 'DL-' : 'TA-') + db.ticketSeq, kind: m.kind, startedAt: Date.now(), lastAt: Date.now(), guests: [], cart: [], orders: [], requests: [], check: null, log: [],
          customer: { name: String(m.name || '').slice(0, 30), phone: String(m.phone || '').slice(0, 20), address: String(m.address || '').slice(0, 140) } };
        if (m.kind === 'car') { const car = F.carClean(m.car, { ...F.carCfg(db.settings), spots: 0 }); if (car.error) break; s.customer.car = car; }
        s.guests.push({ id: 'cust', name: s.customer.name || (m.kind === 'car' ? 'Car' : m.kind === 'delivery' ? 'Delivery' : 'Takeaway'), avatar: m.kind === 'car' ? '🚗' : m.kind === 'delivery' ? '🛵' : '🛍️' });
        db.sessions[m.tid] = s; log(s, 'seated', `${m.kind} ticket ${s.tableNumber} opened` + (c.staffName ? ' by ' + c.staffName : '')); break;
      }
      case 'staff_order': {
        if (!F.has(rec, 'ordering')) break;
        const t = db.tables.find((x) => x.id === m.tableId); let s = db.sessions[m.tableId];
        if (!s && t) s = openSession(t); if (!s) break; s.staffSeated = true; own(s, c);
        const want = [], dropped = [];
        (Array.isArray(m.items) ? m.items : []).slice(0, 40).forEach((x) => {
          const it = db.items.find((y) => y.id === x.itemId); const q = Math.min(20, Math.floor(+x.qty));
          if (it && it.soldOut && q > 0) dropped.push(it.name);
          if (!it || it.soldOut || !(q > 0)) return;
          const ln = mkLine(it, q, null, x.opts, String(x.note || '').slice(0, 140)); if (!ln) { dropped.push(it.name + ' (options)'); return; }
          want.push(ln);
        });
        if (dropped.length) c.ws.send(JSON.stringify({ t: 'notice', msg: 'Sold out, not added: ' + dropped.join(', '), code: 'conflict' }));
        if (!want.length) break;
        let g = s.guests.find((x) => x.id === m.guestId) || s.guests[0];
        if (!g) { g = { id: 'staff', name: 'Staff', avatar: '🧑‍🍳' }; s.guests.push(g); }
        const lines = takeStock(want, c.staffName); if (!lines.length) break;
        lines.forEach((l) => (l.guestId = g.id));
        s.orders.push(stampEta({ id: id('o'), at: Date.now(), status: 'received', items: lines, by: 'staff', staff: c.staffName || '' }));
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
      case 'promo_set': {   // staff attach / remove a coupon or gift card on a table
        const s = db.sessions[m.tableId]; if (!s) break;
        const say = (msg) => c.ws.send(JSON.stringify({ t: 'notice', msg }));
        if ('coupon' in m) {
          if (!m.coupon) { s.coupon = null; log(s, 'coupon', 'Coupon removed'); }
          else { const code = F.normCode(m.coupon), ck = F.promoCfg(db.settings).enabled && F.has(rec, 'coupons') ? F.couponCheck(db.coupons.find((x) => x.code === code), bill(s).gross, Date.now()) : { ok: false, reason: 'off' }; if (!ck.ok) { say('Coupon not valid (' + ck.reason + ')'); break; } s.coupon = code; log(s, 'coupon', 'Coupon ' + code + ' applied by ' + (c.staffName || 'staff')); }
        }
        if ('gift' in m) {
          if (!m.gift) s.gift = null;
          else { const code = F.normCode(m.gift), g = db.gifts && db.gifts[code]; if (!F.has(rec, 'giftcards') || !F.giftBalanceOk(g)) { say('Gift card not valid'); break; } s.gift = code; log(s, 'gift', 'Gift card applied by ' + (c.staffName || 'staff')); }
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
        { const clash = resClash(t, at); if (clash) { c.ws.send(JSON.stringify({ t: 'notice', msg: clash, code: 'taken' })); break; } }
        db.reservations.push({ id: id('rv'), tableId: t.id, tableNumber: t.number, name: String(m.name || 'Guest').slice(0, 30), phone: String(m.phone || '').slice(0, 20), guests: Math.min(50, Math.max(1, Math.floor(+m.guests) || 2)), at, note: String(m.note || '').slice(0, 100), by: c.staffName || '' });
        db.reservations = db.reservations.filter((r) => r.at > Date.now() - 3 * 3600000).slice(-300); break;
      }
      case 'res_del': db.reservations = (db.reservations || []).filter((r) => r.id !== m.id); break;
      case 'res_confirm': case 'res_decline': case 'wl_notify': case 'wl_seat': case 'wl_del': { const r = bookingAct({ res_confirm: 'confirm', res_decline: 'decline', wl_notify: 'notify', wl_seat: 'seat', wl_del: 'remove' }[m.t], m.id, { tableId: m.tableId }, c.staffName || ''); if (r && r.error) c.ws.send(JSON.stringify({ t: 'notice', msg: r.error, code: r.code })); break; }
      case 'res_seat': {
        const r = (db.reservations || []).find((x) => x.id === m.id), t = r && db.tables.find((x) => x.id === (r.tableId || m.tableId)); if (!t) break;
        const s = openSession(t); s.lastAt = Date.now(); if (!s.guests.length) s.guests.push({ id: 'cust', name: r.name, avatar: '📅' });
        log(s, 'seated', `Reservation for ${r.name} seated`); db.reservations = db.reservations.filter((x) => x !== r); break;
      }
      case 'seat_table': { const t = db.tables.find((x) => x.id === m.tableId); if (t) { const s = openSession(t); s.lastAt = Date.now(); s.staffSeated = true; own(s, c); } break; }
      case 'sim': simulate = !!m.on; break;
    }
    return broadcast();
  }
}
// priority lanes in the kitchen: normal, rush, VIP (VIP first, then rush, then oldest)
function setLane(c, m) {
  const lane = ['normal', 'rush', 'vip'].includes(m.lane) ? m.lane : '';
  for (const s of Object.values(db.sessions)) {
    const o = s.orders.find((x) => x.id === m.orderId); if (!o || !lane) continue;
    if (o.status === 'served' || o.status === 'closed') return;
    if (lane === 'normal') delete o.lane; else o.lane = lane;
    log(s, 'lane', `Order marked ${lane}` + (c.staffName ? ' by ' + c.staffName : '')); return;
  }
}
function setStatus(c, m) {
  for (const s of Object.values(db.sessions)) {
    const o = s.orders.find((x) => x.id === m.orderId); if (!o) continue;
    if (!['received', 'kitchen', 'served', 'closed'].includes(m.status)) return;
    o.status = m.status; log(s, 'status', `Order ${m.status}` + (c.staffName ? ' by ' + c.staffName : ''));
    if (m.status === 'closed') { o.servedAt = Date.now(); o.items.forEach((i) => { if (!i.served) { i.served = Date.now(); i.servedBy = c.staffName || ''; } }); }
    if (m.status === 'kitchen') { bump(c, 'started'); o.cookAt = Date.now(); o.etaAt = o.cookAt + (o.prep || 6) * 60000; o.etaMin = Math.max(1, Math.round((o.etaAt - o.at) / 60000)); }   // the clock restarts when the kitchen actually starts
    if (m.status === 'served') o.readyAt = Date.now();
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
      s.orders.push(stampEta({ id: id('o'), at: Date.now(), status: 'received', items })); s.check = null;
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
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const since = days === 1 ? d0.getTime() : Date.now() - days * 86400000, span = Date.now() - since, prevSince = since - span;
  const RS = db.statsReset || {}, from = (k) => Math.max(since, RS.all || 0, RS[k] || 0);
  const H = db.history.filter((h) => h.closedAt >= since && !h.unpaid);
  const HB = (k) => { const f = from(k); return H.filter((h) => h.closedAt >= f); };   // history for one statistics block (after its last "clear")
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const kp = (arr) => { const rev = sum(arr, (h) => h.total); return { revenue: rev, orders: arr.length, avg: arr.length ? rev / arr.length : 0, profit: sum(arr, (h) => sum(h.items, (l) => l.qty * (l.price - l.cost)) - (h.discount || 0)) }; };
  const kpi = { ...kp(HB('kpi')), prev: kp(db.history.filter((h) => h.closedAt >= Math.max(prevSince, RS.all || 0, RS.kpi || 0) && h.closedAt < since && !h.unpaid)) };
  const hourly = Array(24).fill(0); HB('trend').forEach((h) => { hourly[new Date(h.closedAt).getHours()] += h.total; });
  const lowStock = db.items.filter((i) => i.stock !== undefined && i.stock !== null && i.stock !== '' && i.stock <= (i.lowAt === undefined ? 5 : i.lowAt)).map((i) => ({ id: i.id, name: i.name, emoji: i.emoji, stock: i.stock })).sort((a, b) => a.stock - b.stock);
  const HD = HB('details');
  const revenue = {
    gross: sum(HD, (h) => h.sub), service: sum(HD, (h) => h.service), tax: sum(HD, (h) => h.tax), tips: sum(HD, (h) => h.tip), total: sum(HD, (h) => h.total),
    online: sum(HD, (h) => (h.pay ? h.pay.online || 0 : 0)), gift: sum(HD, (h) => (h.pay ? h.pay.gift || 0 : 0)), digital: sum(HD, (h) => (h.pay ? h.pay.digital || 0 : 0)), cash: sum(HD, (h) => (h.pay ? h.pay.cash : h.method === 'cash' ? h.total : 0)), card: sum(HD, (h) => (h.pay ? h.pay.card : h.method === 'card' ? h.total : 0)), discounts: sum(HD, (h) => h.discount || 0), sessions: HD.length,
  };
  const itemMap = {}, catMap = {};
  const item = (h, l) => {
    const a = (itemMap[l.name] ||= { name: l.name, emoji: (db.items.find((x) => x.id === l.itemId) || {}).emoji, qty: 0, revenue: 0, profit: 0 }); a.qty += l.qty; a.revenue += l.qty * l.price; a.profit += l.qty * (l.price - l.cost);
  };
  HB('best').forEach((h) => h.items.forEach((l) => item(h, l)));
  HB('cats').forEach((h) => h.items.forEach((l) => {
    const cat = db.categories.find((c) => c.id === l.cat); const cn = cat ? cat.name : 'Other';
    const b = (catMap[cn] ||= { name: cn, revenue: 0, profit: 0 }); b.revenue += l.qty * l.price; b.profit += l.qty * (l.price - l.cost);
  }));
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  const perTable = {};
  HB('heat').forEach((h) => { const d = new Date(h.startedAt); heat[d.getDay()][d.getHours()]++; });
  HB('tables').forEach((h) => { perTable[h.tableNumber] = (perTable[h.tableNumber] || 0) + 1; });
  const durs = HD.map((h) => (h.closedAt - h.startedAt) / 60000);
  const avgOcc = durs.length ? sum(durs, (x) => x) / durs.length : 0;
  // gaps between consecutive sessions on same table, same day
  const gaps = [];
  const byT = {}; HD.forEach((h) => (byT[h.tableId] ||= []).push(h));
  Object.values(byT).forEach((arr) => { arr.sort((a, b) => a.startedAt - b.startedAt); for (let i = 1; i < arr.length; i++) { const g = (arr[i].startedAt - arr[i - 1].closedAt) / 60000; if (g >= 0 && g < 240) gaps.push(g); } });
  const avgGap = gaps.length ? sum(gaps, (x) => x) / gaps.length : 0;
  const openMin = 14 * 60 * days * Math.max(1, db.tables.length);
  const occupancy = Math.min(100, sum(durs, (x) => x) / openMin * 100);
  const daily = {};
  HB('trend').forEach((h) => { const k = new Date(h.closedAt).toISOString().slice(0, 10); daily[k] = (daily[k] || 0) + h.total; });
  const audit = [...db.history.slice(-40).reverse().map((h) => ({ tableNumber: h.tableNumber, startedAt: h.startedAt, orderedAt: h.orderedAt, checkAt: h.checkAt, closedAt: h.closedAt, total: h.total, guests: h.guests, method: h.method })),];
  Object.values(db.sessions).forEach((s) => audit.unshift({ tableNumber: s.tableNumber, startedAt: s.startedAt, orderedAt: s.orders[0]?.at, checkAt: s.check?.at, closedAt: null, total: bill(s).total, guests: s.guests.length, method: s.check?.method || '—', live: true }));
  return {
    days, resets: RS, kpi, hourly, lowStock, revenue, turnover: { avgOccupiedMin: avgOcc, avgEmptyGapMin: avgGap, turnsPerTablePerDay: HD.length / Math.max(1, db.tables.length) / days, occupancyPct: occupancy },
    topItems: Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 8),
    categories: Object.values(catMap).sort((a, b) => b.profit - a.profit),
    heat, perTable, daily, audit,
  };
}

  function seedLive() { seedLiveSessions(); seedLoyalty(); }
  // OCR import: [{cat, name, name_ar, price, desc}] -> categories + items (categories are matched by name)
  function importParsed(list) {
    let nc = 0, ni = 0;
    (Array.isArray(list) ? list : []).slice(0, 300).forEach((x) => {
      if (!x || typeof x !== 'object') return; const name = String(x.name || '').trim().slice(0, 60), price = +x.price; if (!name || !(price >= 0 && price <= 100000)) return;
      const cn = String(x.cat || 'Menu').trim().slice(0, 40) || 'Menu';
      let c = db.categories.find((k) => k.name.toLowerCase() === cn.toLowerCase());
      if (!c) { c = { id: id('c'), name: cn, name_ar: String(x.cat_ar || '').slice(0, 40), emoji: '🍽️' }; db.categories.push(c); nc++; }
      db.items.push({ id: id('i'), cat: c.id, name, name_ar: String(x.name_ar || '').slice(0, 60), price, cost: 0, emoji: c.emoji || '🍽️', desc: String(x.desc || '').slice(0, 140), img: '' }); ni++;
    });
    broadcast(); return { categories: nc, items: ni };
  }
  function loyaltyStats() {
    const mem = Object.values((db.loyalty && db.loyalty.members) || {}), d0 = new Date().setHours(0, 0, 0, 0);
    let earnedToday = 0, redeemedToday = 0, redeemedEgpToday = 0, outstanding = 0;
    mem.forEach((m) => { outstanding += m.points; (m.log || []).forEach((e) => { if (e.at >= d0) { if (e.type === 'earn') earnedToday += e.pts; else { redeemedToday += e.pts; redeemedEgpToday += e.egp || 0; } } }); });
    return { members: mem.length, outstanding, earnedToday, redeemedToday, redeemedEgpToday, top: mem.slice().sort((a, b) => b.earned - a.earned).slice(0, 12).map(({ log, ...x }) => x) };
  }
  function copilotAsk(q) {
    const r = F.copilot(q, { db, analytics, loyaltyStats, setLang: (l) => (db.settings.lang = l) });
    if (r.action) broadcast(); return r;
  }
  const publicConfig = (asAdmin) => ({ settings: settingsFor(asAdmin ? 'admin' : 'guest', true), categories: db.categories, items: db.items, tables: db.tables.map(({ key, ...r }) => r), features: F.featuresOf(rec), plan: F.planOf(rec.plan) });
  return { placeBooking, bookingStatus, bookingAct, placeOnline, carArrive, onlineStatus, deliveryList, deliveryAct, applyOnline, notify: alertCaptains, rec, db, clients, importParsed, loyaltyStats, copilotAsk, publicConfig, ensure, sweep, handle, broadcast, snapshotFor, bill, analytics, seedLive, tick, openSession, setSim: (v) => (simulate = !!v), get simulate() { return simulate; }, liveCount: () => Object.keys(db.sessions).length };
}
module.exports = { createTenant, freshData, clone };
