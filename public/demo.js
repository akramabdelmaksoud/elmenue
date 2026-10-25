/* In-browser demo: runs the real order engine (tenant.js) inside the page with sample data, so the whole app can be
   tried without a server or database. Nothing leaves the browser; tabs of the same browser share the demo through
   localStorage, so a guest tab, the captain screen and the kitchen screen can talk to each other. */
(() => {
  const KEY = 'demo:v1', raw = App.rawFetch;
  let rec, T, ver = 0, loading = false, mods = {}, client = null, sim = null;
  const nid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  async function load(n) {
    const src = await (await raw('/engine/' + n)).text(), m = { exports: {} };
    new Function('module', 'exports', 'require', src)(m, m.exports, (p) => mods[p.replace('./', '')] || {});
    mods[n.replace('.js', '')] = m.exports;
  }
  function build(r) {
    rec = r; T = mods.tenant.createTenant(rec, () => { if (!loading) { try { localStorage.setItem(KEY, JSON.stringify({ ver: ++ver, rec })); } catch {} } }, (a) => App.demoAlert && App.demoAlert(a));
    T.ensure(); return T;
  }
  function fresh() {
    const data = mods.tenant.freshData(true); data.settings.name = 'Demo Café'; data.settings.requireKey = false;
    const r = { id: 'demo', slug: 'demo', name: 'Demo Café', status: 'active', owner: { email: 'owner@demo.test' }, pin: '1234', plan: 'demo', data, stats: { staff: {} }, alerts: [], alertSeq: 0, reviews: [], staff: [], stockLog: [] };
    build(r); T.seedLive(); T.broadcast(); return T;
  }
  App.demoReady = async () => {
    if (T) return;
    await load('data.js'); await load('tenant.js');
    let saved = null; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
    if (saved && saved.rec && saved.rec.data) { ver = saved.ver || 0; loading = true; build(saved.rec); loading = false; } else fresh();
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY || !e.newValue) return;
      try { const s = JSON.parse(e.newValue); loading = true; const had = T.clients; build(s.rec); had.forEach((c) => T.clients.add(c)); ver = s.ver; clients(); loading = false; } catch (er) { loading = false; }
    });
    setInterval(() => { if (T.simulate) T.tick(); }, 4500);
    banner();
  };
  const clients = () => { T.clients.forEach((c) => c.ws.send(JSON.stringify(T.snapshotFor(c)))); };
  function banner() {
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:300;background:#111c;color:#fff;backdrop-filter:blur(8px);padding:7px 8px 7px 14px;border-radius:99px;font:600 12.5px system-ui;display:flex;gap:10px;align-items:center;box-shadow:0 8px 30px #0006;max-width:94vw';
    b.innerHTML = '🎭 Demo — sample data, nothing is saved <button style="background:#ffffff26;color:#fff;border:0;border-radius:99px;padding:5px 12px;cursor:pointer" id="dmx">Menu</button><button style="background:#ffffff26;color:#fff;border:0;border-radius:99px;padding:5px 12px;cursor:pointer" id="dmr">Reset</button>';
    document.body.appendChild(b);
    b.querySelector('#dmx').onclick = () => { sessionStorage.removeItem('demo'); location.href = '/demo'; };
    b.querySelector('#dmr').onclick = () => { localStorage.removeItem(KEY); location.reload(); };
  }

  // realtime connection for one page
  App.demoConnect = (joinMsg, handlers) => {
    App.handlers = handlers;
    const onMsg = (m) => {
      if (m.t === 'state') { App.state = m; App.config = m.config; App.applyTheme(); handlers.render && handlers.render(m); }
      else if (handlers[m.t]) handlers[m.t](m);
    };
    const c = { ws: { readyState: 1, send: (d) => setTimeout(() => onMsg(JSON.parse(d)), 0) }, role: null, joined: false, authed: true, staffName: 'Demo', adm: true };
    client = c; App.demoAlert = (a) => handlers.alert && handlers.alert({ t: 'alert', ...a });
    T.clients.add(c);
    App.demoSend = (o) => { T.handle(c, o); };
    T.handle(c, { ...joinMsg, t: 'join' });
    if (joinMsg.role === 'customer') { const s = T.db.sessions[(T.db.tables.find((x) => x.number === +joinMsg.tableNumber) || {}).id]; const g = s && s.guests.find((x) => x.id === c.guestId); if (g) onMsg({ t: 'you', guestId: g.id }); }
  };

  // the handful of REST endpoints the owner screens use
  const J = (x, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json' } });
  function report(from, to) {
    const H = T.db.history.filter((h) => h.closedAt >= from && h.closedAt <= to && !h.unpaid), sum = (a, f) => a.reduce((n, x) => n + f(x), 0), items = {}, cats = {}, salesBy = {}, kinds = {}, by = {}, methods = { cash: 0, card: 0 };
    let vc = 0, vv = 0, vw = 0;
    H.forEach((h) => {
      methods.cash += h.pay ? h.pay.cash : h.method === 'cash' ? h.total : 0; methods.card += h.pay ? h.pay.card : h.method === 'card' ? h.total : 0;
      if (h.closedBy) { by[h.closedBy] = (by[h.closedBy] || 0) + 1; salesBy[h.closedBy] = (salesBy[h.closedBy] || 0) + h.total; } kinds[h.kind || 'table'] = (kinds[h.kind || 'table'] || 0) + h.total;
      (h.voids || []).forEach((v) => { vc += v.qty; vv += v.qty * v.price; if (v.waste) vw += v.qty * v.price; });
      h.items.forEach((l) => { const c = T.db.categories.find((x) => x.id === l.cat), cn = c ? c.name : 'Other'; const a = (items[l.name] ||= { name: l.name, category: cn, qty: 0, revenue: 0, profit: 0 }); a.qty += l.qty; a.revenue += l.qty * l.price; a.profit += l.qty * (l.price - l.cost); const b = (cats[cn] ||= { name: cn, revenue: 0, profit: 0, qty: 0 }); b.revenue += l.qty * l.price; b.profit += l.qty * (l.price - l.cost); b.qty += l.qty; });
    });
    const disc = sum(H, (h) => h.discount || 0);
    return { from, to, sessions: H.length, guests: sum(H, (h) => h.guests), gross: sum(H, (h) => h.sub), discounts: disc, voids: { count: vc, value: vv, waste: vw }, salesBy, kinds, profit: Object.values(items).reduce((n, x) => n + x.profit, 0) - disc, service: sum(H, (h) => h.service), tax: sum(H, (h) => h.tax), tips: sum(H, (h) => h.tip), total: sum(H, (h) => h.total), avgTicket: H.length ? sum(H, (h) => h.total) / H.length : 0, avgMinutes: 0, methods, closedBy: by, items: Object.values(items).sort((a, b) => b.qty - a.qty), categories: Object.values(cats).sort((a, b) => b.revenue - a.revenue), staff: [], reviews: { count: 0, avg: 0, low: 0 }, currency: T.db.settings.currency, name: 'Demo Café' };
  }
  App.demoFetch = async (u, o = {}) => {
    const m = (o.method || 'GET').toUpperCase(), url = new URL(u, location.origin), p = url.pathname.replace(/^\/api\/r\/[^/]+/, '/api'), q = url.searchParams, d = T.db;
    let body = {}; try { body = o.body && typeof o.body === 'string' ? JSON.parse(o.body) : {}; } catch {}
    const done = (x) => { T.broadcast(); return J(x); };
    let r;
    if (m === 'GET') {
      if (p === '/api/config') return J({ settings: d.settings, categories: d.categories, items: d.items, tables: d.tables.map(({ key, ...x }) => x) });
      if (p === '/api/analytics') return J(T.analytics(+q.get('days') || 7));
      if (p === '/api/report') return J(report(+q.get('from') || Date.now() - 864e5, +q.get('to') || Date.now()));
      if (p === '/api/orders') return J({ orders: d.history.filter((h) => h.closedAt >= +q.get('from') && h.closedAt <= +q.get('to')).slice(-400).reverse().map(({ log, ...h }) => h) });
      if (p === '/api/receipts') return J({ receipts: d.history.slice(-40).reverse().map(({ log, ...h }) => h) });
      if (p === '/api/stock-log') return J({ log: T.rec.stockLog || [] });
      if (p === '/api/feedback') return J({ reviews: T.rec.reviews || [] });
      if (p === '/api/staff') return J({ staff: [], stats: (T.rec.stats || {}).staff || {}, legacyPin: '1234' });
      if (p === '/api/account') return J({ name: 'Demo Café', email: 'owner@demo.test', pin: '1234', plan: 'demo' });
      if (p === '/api/me') return J({ ok: 1, name: 'Demo Café', who: 'Demo' });
      if (p === '/api/push/key') return J({ key: '' });
      return J({ error: 'Not available in the demo' }, 404);
    }
    if ((r = p.match(/^\/api\/items\/([^/]+)\/image$/))) {
      const i = d.items.find((x) => x.id === r[1]); if (!i) return J({ error: 'not found' }, 404);
      if (m === 'DELETE') i.img = ''; else { const f = o.body && o.body.get && o.body.get('image'); if (!f) return J({ error: 'bad request' }, 400); i.img = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); }); }
      return done({ ok: 1 });
    }
    if (p === '/api/stats/clear') { const k = String(body.key || ''); d.statsReset ||= {}; if (body.restore) { if (k === 'all') d.statsReset = {}; else delete d.statsReset[k]; } else d.statsReset[k] = Date.now(); return done({ ok: 1 }); }
    if ((r = p.match(/^\/api\/categories\/([^/]+)\/image$/)) || p === '/api/hero-image') {
      const tgt = r ? d.categories.find((x) => x.id === r[1]) : d.settings; if (!tgt) return J({ error: 'not found' }, 404);
      const key = r ? 'img' : 'heroImg';
      if (m === 'DELETE') tgt[key] = ''; else { const f = o.body && o.body.get && o.body.get('image'); if (!f) return J({ error: 'bad request' }, 400); tgt[key] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(f); }); }
      return done({ ok: 1 });
    }
    if (p === '/api/feedback') { T.rec.reviews = [{ id: nid('f'), at: Date.now(), stars: Math.round(+body.stars) || 5, comment: String(body.comment || '').slice(0, 400), table: +body.table || 0, name: String(body.name || '').slice(0, 24) }, ...(T.rec.reviews || [])]; return done({ ok: 1 }); }
    if (p === '/api/settings') { delete body.presets; Object.assign(d.settings, body); return done(d.settings); }
    if (p === '/api/account') return J({ ok: 1 });
    if ((r = p.match(/^\/api\/items\/([^/]+)\/stock$/))) { const i = d.items.find((x) => x.id === r[1]); if (i) i.soldOut = !!body.soldOut; return done({ ok: 1 }); }
    if ((r = p.match(/^\/api\/items\/([^/]+)\/adjust$/))) {
      const i = d.items.find((x) => x.id === r[1]); if (!i) return J({ error: 'not found' }, 404);
      const q2 = Math.floor(+body.qty), cur = i.stock == null || i.stock === '' ? 0 : Math.floor(+i.stock), type = body.type, next = type === 'waste' ? Math.max(0, cur - q2) : type === 'count' ? q2 : cur + q2;
      i.stock = next; i.soldOut = next <= 0; T.rec.stockLog = [{ at: Date.now(), itemId: i.id, item: i.name, delta: next - cur, type, reason: body.reason || '', who: 'owner', left: next }, ...(T.rec.stockLog || [])].slice(0, 400); return done({ id: i.id, stock: next });
    }
    if (p === '/api/items' && m === 'POST') { const i = { id: nid('i'), cat: body.cat, name: body.name || 'New item', name_ar: '', price: +body.price || 0, cost: +body.cost || 0, emoji: body.emoji || '🍽️', desc: '', img: '' }; d.items.push(i); return done(i); }
    if ((r = p.match(/^\/api\/items\/([^/]+)$/))) {
      if (m === 'DELETE') { d.items = d.items.filter((x) => x.id !== r[1]); return done({ ok: 1 }); }
      const i = d.items.find((x) => x.id === r[1]); if (i) { Object.assign(i, body, { id: i.id }); i.price = +i.price; i.cost = +i.cost; if ('stock' in body) i.stock = body.stock === null || body.stock === '' ? null : Math.max(0, Math.floor(+body.stock) || 0); } return done(i);
    }
    if (p === '/api/categories' && m === 'POST') { const c = { id: nid('c'), name: body.name || 'New', name_ar: '', emoji: '🍽️' }; d.categories.push(c); return done(c); }
    if (p === '/api/categories/order') { d.categories.sort((a, b) => (body.ids || []).indexOf(a.id) - (body.ids || []).indexOf(b.id)); return done({ ok: 1 }); }
    if ((r = p.match(/^\/api\/categories\/([^/]+)$/))) {
      if (m === 'DELETE') { d.categories = d.categories.filter((x) => x.id !== r[1]); d.items = d.items.filter((i) => i.cat !== r[1]); return done({ ok: 1 }); }
      const c = d.categories.find((x) => x.id === r[1]); if (c) Object.assign(c, body, { id: c.id }); return done(c);
    }
    if (p === '/api/layout') {
      (body.tables || []).forEach((u2) => { const t = d.tables.find((x) => x.id === u2.id); if (!t) return; ['fx', 'fy', 'fw', 'fh'].forEach((k) => { if (Number.isFinite(+u2[k])) t[k] = Math.round(+u2[k] * 2) / 2; }); if (u2.shape) t.shape = u2.shape; if (u2.seats) t.seats = u2.seats; if (typeof u2.zone === 'string') t.zone = u2.zone; });
      if (Array.isArray(body.decor)) { const F = d.settings.floor || { cols: 24, rows: 16 }; d.settings.floor = { cols: F.cols || 24, rows: F.rows || 16, decor: body.decor }; }
      return done({ ok: 1 });
    }
    if (p === '/api/tables' && m === 'POST') {
      const num = Math.max(0, ...d.tables.map((t) => t.number)) + 1; let fx = 0.5, fy = 0.5;
      outer: for (let y = 0; y <= 13; y++) for (let x = 0; x <= 21; x++) if (!d.tables.some((t) => x < (t.fx || 0) + (t.fw || 3) && x + 3 > (t.fx || 0) && y < (t.fy || 0) + (t.fh || 3) && y + 3 > (t.fy || 0))) { fx = x; fy = y; break outer; }
      const t = { id: nid('t'), number: num, seats: 4, shape: 'square', fx, fy, fw: 3, fh: 3, key: Math.random().toString(36).slice(2, 10) }; d.tables.push(t); return done(t);
    }
    if ((r = p.match(/^\/api\/tables\/([^/]+)$/))) {
      if (m === 'DELETE') { d.tables = d.tables.filter((x) => x.id !== r[1]); delete d.sessions[r[1]]; return done({ ok: 1 }); }
      const t = d.tables.find((x) => x.id === r[1]); if (t) Object.assign(t, body, { id: t.id }); return done(t);
    }
    return J({ error: 'Not available in the demo' }, 400);
  };
})();
