#!/usr/bin/env node
// Live-ordering load test: N guests on ONE restaurant over WebSocket, adding items and sending orders.
//
//   node tests/load/loadtest.js https://test.yourdomain.com --slug test --guests 30 --tables 6 --seconds 60 [--keys keys.json] [--orders]
//
// Use a TEST restaurant only: --orders creates real orders that appear on the kitchen screen.
// --keys keys.json  = {"1":"tablekey1","2":"..."}  needed when the restaurant requires the QR table key (default).
//                     Or set the restaurant's "require table key" off while testing.
// While it runs, watch the server:  docker stats   (CPU of the app container should stay well below 100%).
const WebSocket = require('ws');
const fs = require('fs');

const argv = process.argv.slice(2), base = (argv.find((a) => /^https?:/.test(a)) || '').replace(/\/$/, '');
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
if (!base) { console.error('usage: node tests/load/loadtest.js <https://host> --slug <slug> [--guests 30] [--tables 6] [--seconds 60] [--keys file] [--orders]'); process.exit(2); }
const slug = opt('slug', 'main'), N = +opt('guests', 30), TABLES = +opt('tables', 6), SECS = +opt('seconds', 60), ORDERS = !!opt('orders', false);
const keys = opt('keys', null) ? JSON.parse(fs.readFileSync(opt('keys'), 'utf8')) : {};
const wsUrl = base.replace(/^http/, 'ws') + '/ws';

const pct = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);
const stats = { connect: [], join: [], action: [], errors: [], closed: 0, opened: 0, msgs: 0, orders: 0 };

(async () => {
  const cfg = await (await fetch(`${base}/api/r/${slug}/config`)).json().catch(() => null);
  if (!cfg || !cfg.items) { console.error('Could not read the restaurant config - wrong URL or slug?'); process.exit(1); }
  const items = cfg.items.filter((i) => !i.soldOut), tableNums = cfg.tables.map((t) => t.number).slice(0, TABLES);
  if (!items.length || !tableNums.length) { console.error('Restaurant has no items or tables'); process.exit(1); }
  console.log(`Target ${base} (${slug}): ${N} guests on ${tableNums.length} tables for ${SECS}s${ORDERS ? ', sending orders' : ', cart only'}`);

  const deadline = Date.now() + SECS * 1000, guests = [];
  // --poll: no websockets (Vercel). Each guest asks /rpc the way the real page does: every 2.5 s right after an action, backing off to 6.5 s when idle.
  if (opt('poll', false)) {
    for (let g = 0; g < N; g++) guests.push((async () => {
      const table = tableNums[g % tableNums.length], join = { role: 'customer', tableNumber: table, guestId: 'lt' + g + Math.random().toString(36).slice(2, 7), name: 'Load ' + g, avatar: '🙂', key: keys[table] };
      let etag = null, lastChange = Date.now(), nextAct = Date.now() + 2500 + Math.random() * 3000;
      while (Date.now() < deadline) {
        const act = Date.now() >= nextAct, it = items[Math.floor(Math.random() * items.length)], t0 = Date.now();
        try {
          const r = await fetch(`${base}/api/r/${slug}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ join, msg: act ? { t: 'cart_add', itemId: it.id } : null, since: -1, etag: act ? null : etag }) });
          const j = await r.json().catch(() => ({})); stats.msgs++;
          if (!r.ok) stats.errors.push('HTTP ' + r.status + ' ' + (j.error || '')); else { stats.action.push(Date.now() - t0); if (j.guestId) join.guestId = j.guestId; if (!j.same) { etag = j.etag; lastChange = Date.now(); } }
          if (act) { lastChange = Date.now(); nextAct = Date.now() + 2500 + Math.random() * 3000; }
        } catch (e) { stats.errors.push(e.message); }
        const idle = Date.now() - lastChange;
        await new Promise((r) => setTimeout(r, idle < 15000 ? 2500 : idle < 45000 ? 4500 : 6500));
      }
      stats.opened++;
    })());
    await Promise.all(guests);
    const f = (a) => `p50 ${pct(a, 0.5)} ms   p95 ${pct(a, 0.95)} ms   max ${pct(a, 1)} ms   (n=${a.length})`;
    console.log(`\nguests ${stats.opened}/${N}, requests ${stats.msgs} (${(stats.msgs / SECS).toFixed(1)}/s)`); console.log('rpc round trip', f(stats.action));
    const errs = [...new Set(stats.errors)]; if (errs.length) console.log('errors:', errs.slice(0, 8).join(' | '));
    const ok = !errs.length && pct(stats.action, 0.95) < 1500;
    console.log(ok ? '\nPASS (no errors, p95 round trip under 1.5 s)' : '\nCHECK RESULTS ABOVE'); process.exit(ok ? 0 : 1);
  }
  for (let g = 0; g < N; g++) guests.push(new Promise((done) => {
    const table = tableNums[g % tableNums.length], gid = 'lt' + g + Math.random().toString(36).slice(2, 7);
    const t0 = Date.now(); let joined = false, lastSent = 0, timer;
    const ws = new WebSocket(wsUrl, { headers: { Origin: base } });
    ws.on('open', () => {
      stats.opened++; stats.connect.push(Date.now() - t0);
      ws.send(JSON.stringify({ t: 'join', slug, role: 'customer', tableNumber: table, guestId: gid, name: 'Load ' + g, avatar: '🙂', key: keys[table] }));
      const tJoin = Date.now(); ws.once('message', () => stats.join.push(Date.now() - tJoin));
      timer = setInterval(() => {
        if (Date.now() > deadline) { clearInterval(timer); return ws.close(); }
        const it = items[Math.floor(Math.random() * items.length)];
        lastSent = Date.now(); ws.send(JSON.stringify({ t: 'cart_add', itemId: it.id }));
        if (ORDERS && Math.random() < 0.15) { ws.send(JSON.stringify({ t: 'send_order', scope: 'me' })); stats.orders++; }
      }, 2500 + Math.random() * 3000);
    });
    ws.on('message', (d) => {
      stats.msgs++; joined = true;
      try { const m = JSON.parse(d); if (m.t === 'error') stats.errors.push(m.msg); } catch {}
      if (lastSent) { stats.action.push(Date.now() - lastSent); lastSent = 0; }
    });
    ws.on('error', (e) => stats.errors.push(e.message));
    ws.on('close', () => { stats.closed++; clearInterval(timer); done(); });
    setTimeout(() => { if (!joined) { stats.errors.push('no reply from server'); try { ws.terminate(); } catch {} } }, 15000).unref();
  }));
  await Promise.all(guests);

  const f = (a) => `p50 ${pct(a, 0.5)} ms   p95 ${pct(a, 0.95)} ms   max ${pct(a, 1)} ms   (n=${a.length})`;
  console.log(`\nconnected ${stats.opened}/${N}, messages received ${stats.msgs}, orders sent ${stats.orders}`);
  console.log('connect  ', f(stats.connect)); console.log('join     ', f(stats.join)); console.log('cart_add -> update', f(stats.action));
  const errs = [...new Set(stats.errors)]; if (errs.length) console.log('errors:', errs.slice(0, 8).join(' | '));
  const ok = stats.opened === N && !errs.length && pct(stats.action, 0.95) < 1500;
  console.log(ok ? '\nPASS (all guests connected, no errors, p95 update under 1.5 s)' : '\nCHECK RESULTS ABOVE (a guest failed, errors seen, or updates were slow)');
  process.exit(ok ? 0 : 1);
})();
