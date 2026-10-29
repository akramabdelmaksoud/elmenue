const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { start } = require('./helper');
const F = require('../features');

test('F7 queueable whitelist (OFF: money never queued)', () => {
  ['staff_order', 'open_ticket', 'seat_table', 'resolve_request', 'order_status'].forEach((t) => assert.ok(F.offlineQueueable(t), t));
  ['close_table', 'discount', 'void_item', 'promo_set', 'shift_open'].forEach((t) => assert.ok(!F.offlineQueueable(t), t + ' must need a live connection'));
  // the browser queue in shared.js uses the same list
  const js = fs.readFileSync(path.join(__dirname, '../public/shared.js'), 'utf8'); F.OFFLINE_OK.forEach((t) => assert.ok(js.includes("'" + t + "'")));
});

for (const mode of ['ws', 'rpc']) test(`F7 offline queue server rules [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), B = await S.tenant('basic'), O2 = await S.tenant('operations');
  const W = await T.staff('captain', 'Ali', '1234');
  const st0 = (await T.rpc('captain', W, null)).j.state, cfg = st0.config, tid = cfg.tables.find((x) => !st0.sessions[x.id]).id;
  const item = cfg.items.find((x) => !x.soldOut), item2 = cfg.items.filter((x) => !x.soldOut)[1];
  // OFF-01 flag off by default; basic tier cannot enable
  assert.equal(cfg.settings.offline.enabled, false); assert.equal((await B.api('POST', '/settings', { offline: { enabled: true } })).s, 402);
  assert.equal((await T.api('POST', '/settings', { offline: { enabled: true } })).s, 200);
  // OFF-02/03 a keyed action is applied once; replaying the same key (reconnect, double flush) changes nothing
  const msg = { t: 'staff_order', tableId: tid, items: [{ itemId: item.id, qty: 2 }], k: 'key-aaa-1' };
  let r = await T.rpc('captain', W, msg); assert.equal(r.s, 200);
  const qty = async () => { const s = (await T.rpc('captain', W, null)).j.state.sessions[tid]; return s ? s.orders.flatMap((o) => o.items).reduce((n, i) => n + i.qty, 0) : 0; };
  assert.equal(await qty(), 2);
  r = await T.rpc('captain', W, msg); assert.deepEqual(r.j.notices, ['Already applied']); assert.equal(await qty(), 2, 'replay did not double the order');
  for (let i = 0; i < 3; i++) await T.rpc('captain', W, msg); assert.equal(await qty(), 2, 'three more replays: still once');
  // OFF-04 a new key is a new action; order of replay preserved
  await T.rpc('captain', W, { t: 'staff_order', tableId: tid, items: [{ itemId: item2.id, qty: 1 }], k: 'key-aaa-2' }); assert.equal(await qty(), 3);
  // OFF-05 conflict: item sold out while the device was offline -> not added, the waiter is told which one
  await T.api('PUT', `/items/${item2.id}`, { soldOut: true });
  r = await T.rpc('captain', W, { t: 'staff_order', tableId: tid, items: [{ itemId: item2.id, qty: 1 }], k: 'key-aaa-3' });
  assert.ok(r.j.notices.some((n) => n.startsWith('Sold out, not added') && n.includes(item2.name)), JSON.stringify(r.j.notices)); assert.equal(await qty(), 3);
  // OFF-06 keys are per venue-database: another venue's identical key is independent
  const W2 = await O2.staff('captain', 'Zed', '4321'); const bs = (await O2.rpc('captain', W2, null)).j.state, tid2 = bs.config.tables[0].id, it2 = bs.config.items[0];
  await O2.rpc('captain', W2, { t: 'staff_order', tableId: tid2, items: [{ itemId: it2.id, qty: 1 }], k: 'key-aaa-1' });
  assert.equal((await O2.rpc('captain', W2, null)).j.state.sessions[tid2].orders.length > 0, true);
  // OFF-07 payments are not idempotency-queued: closing is a normal live action, and an unkeyed close works
  assert.equal((await T.rpc('captain', W, { t: 'close_table', tableId: tid, method: 'cash', pay: { tip: 0, tendered: 9999 } })).s, 200);
  assert.equal((await T.rpc('captain', W, null)).j.state.sessions[tid], undefined, 'table paid once and cleared');
  // OFF-08 the app shell worker never caches API calls or guest pages
  const sw = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'); assert.ok(sw.includes("pathname.startsWith('/api/')")); assert.ok(!/customer|\/t\//.test(sw.match(/STAFF_PAGE = [^\n]+/)[0]));
  // OFF-09 old data: a venue created before F7 loads and defaults to off (ensure() fills the new fields)
  assert.equal((await S.J('GET', B.u('/config'))).j.settings.offline.enabled, false);
});
