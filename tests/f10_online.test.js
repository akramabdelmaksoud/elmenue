const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F10 online ordering [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations'), B = await S.tenant('basic');
  const order = (b, ip) => S.J('POST', T.u('/online/order'), b, null, { 'X-Forwarded-For': ip || '10.3.0.1' });
  const items = (await T.api('GET', '/config', null, null)).j.items;
  const food = items.find((i) => !i.soldOut && i.stock == null), food2 = items.filter((i) => !i.soldOut && i.stock == null)[1];
  const base = { kind: 'takeaway', name: 'Mona', phone: '01001234567', items: [{ itemId: food.id, qty: 2 }] };
  // off by default, tier-gated setting
  assert.equal((await order(base)).s, 403);
  assert.equal((await B.api('POST', '/settings', { online: { enabled: true } })).s, 402);
  // owner switches it on: pickup only, minimum order, a hidden delivery-fee item
  const fee = (await T.api('POST', '/items', { cat: food.cat, name: 'Delivery fee', price: 15, emoji: '🛵' })).j;
  assert.equal((await T.api('POST', '/settings', { online: { enabled: true, pickup: true, delivery: false, minOrder: Math.round(food.price * 3) } })).s, 200);
  // validation: min order, name, phone, delivery not offered, empty, junk item, qty cap
  assert.equal((await order(base)).j.code, 'min');
  const big = { ...base, items: [{ itemId: food.id, qty: 5 }] };
  assert.equal((await order({ ...big, name: '' })).j.code, 'name');
  assert.equal((await order({ ...big, phone: '12' })).j.code, 'phone');
  assert.equal((await order({ ...big, kind: 'delivery', address: 'Street 1, Cairo' })).j.code, 'kind');
  assert.equal((await order({ ...big, items: [] })).j.code, 'empty');
  assert.equal((await order({ ...big, items: [{ itemId: 'nope', qty: 1 }] })).j.code, 'empty');
  // pickup order succeeds: a TA-n ticket appears for the captain, unpaid, with the customer on it
  const ok = await order(big, '10.3.0.2'); assert.equal(ok.s, 200); assert.equal(ok.j.ok, 1); assert.match(ok.j.number, /^TA-\d+$/); assert.ok(ok.j.total >= food.price * 5);
  const cap = await T.staff('captain', 'Wael', '4321'), st = await T.state(cap), ses = Object.values(st.sessions || {}).find((x) => x.tableNumber === ok.j.number);
  assert.ok(ses, 'ticket visible to captain'); assert.equal(ses.kind, 'takeaway'); assert.equal(ses.customer.phone, '01001234567'); assert.equal(ses.orders[0].status, 'received');
  // guest tracking follows the kitchen: received -> preparing -> ready -> done after payment
  const status = async () => (await S.J('GET', T.u('/online/status/' + ok.j.tid))).j.status;
  assert.equal(await status(), 'received');
  const oid = ses.orders[0].id;
  await T.rpc('captain', cap, { t: 'order_status', orderId: oid, status: 'kitchen' }); assert.equal(await status(), 'preparing');
  await T.rpc('captain', cap, { t: 'order_status', orderId: oid, status: 'served' }); assert.equal(await status(), 'ready');
  await T.rpc('captain', cap, { t: 'close_table', tableId: ok.j.tid, method: 'cash', pay: { tendered: 9999 } }); assert.equal(await status(), 'done');
  const hist = (await T.api('GET', '/orders?from=0&to=' + (Date.now() + 1000))).j; const row = (hist.orders || hist).find((h) => h.tableNumber === ok.j.number); assert.ok(row, 'closed ticket in history'); assert.equal(row.source, 'online');
  // delivery: address required, fee item added automatically, sold-out items are refused with a clear message
  await T.api('POST', '/settings', { online: { enabled: true, pickup: true, delivery: true, account: 'off', minOrder: 0, feeItemId: fee.id } });
  const dl = { kind: 'delivery', name: 'Omar', phone: '+201112223334', address: '12 Nile St, Giza', items: [{ itemId: food2.id, qty: 1 }] };
  assert.equal((await order({ ...dl, address: '' }, '10.3.0.3')).j.code, 'address');
  const d = await order(dl, '10.3.0.3'); assert.equal(d.s, 200); assert.match(d.j.number, /^DL-\d+$/); assert.equal(d.j.total > food2.price + 15 - 0.01, true);
  await T.api('PUT', '/items/' + food2.id, { soldOut: true });
  const so = await order(dl, '10.3.0.4'); assert.equal(so.s, 400); assert.equal(so.j.code, 'soldout');
  // abuse: per-IP limit; unauthenticated callers cannot read admin data through these routes
  let limited = 0; for (let i = 0; i < 8; i++) { const r = await order(big, '10.3.9.9'); if (r.s === 429) limited++; } assert.ok(limited >= 1, 'rate limit kicks in');
  assert.equal((await S.J('GET', T.u('/online/status/tk_doesnotexist'))).j.status, 'done');
  assert.equal((await S.J('POST', T.u('/settings'), { online: { enabled: false } }, null)).s, 401);
});
