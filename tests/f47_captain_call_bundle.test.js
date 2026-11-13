const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../features');
const { start } = require('./helper');

test('F47 bundle prices and order', () => {
  assert.deepEqual(F.ORDER, ['lite', 'basic', 'operations', 'vip']);
  assert.deepEqual(F.ORDER.map((id) => F.PLANS[id].price[0]), [499, 999, 1499, 2499]);
  // every bundle holds everything in the cheaper ones
  F.ORDER.forEach((id, i) => { if (i) F.PLANS[F.ORDER[i - 1]].features.forEach((f) => assert.ok(F.PLANS[id].features.includes(f), id + ' keeps ' + f)); });
  assert.ok(F.has('lite', 'micro') && F.has('lite', 'captainpos') && !F.has('lite', 'ordering') && !F.has('lite', 'kds'));
  assert.ok(F.has('basic', 'ordering') && F.has('operations', 'kds') && F.has('vip', 'copilot'));
});

test('F47 Captain Call: guests cannot order, call works, the captain takes the order and closes the bill', async (t) => {
  const S = await start('rpc', { env: { ANTHROPIC_API_KEY: '' } }); t.after(() => S.stop());
  const L = await S.tenant('lite'), cap = await L.staff('captain', 'Wael', '43214321');
  const cfg = (await L.api('GET', '/config', null, null)).j, item = cfg.items.find((i) => !i.soldOut && i.stock == null), tb = cfg.tables[0];
  assert.equal(cfg.features.ordering, false); assert.equal(cfg.features.micro, true);
  const g = L.guest(1); assert.equal((await g.join()).s, 200);
  const blocked = await g.call({ t: 'cart_add', itemId: item.id }); assert.ok(!blocked.cart || !blocked.cart.length, 'guest cannot add to a cart');
  await g.call({ t: 'request', type: 'waiter' });
  const seen = await L.state(cap); assert.ok(JSON.stringify(seen).includes('waiter'), 'the captain sees the guest call');
  assert.equal((await L.api('GET', '/insights')).s, 402, 'insights stay in higher bundles');
  await L.rpc('captain', cap, { t: 'staff_order', tableId: tb.id, items: [{ itemId: item.id, qty: 2 }] });
  const st = await L.state(cap), ses = Object.values(st.sessions).find((x) => x.tableId === tb.id);
  assert.equal(ses.orders.length, 1, 'captain order recorded');
  const oid = ses.orders[0].id;
  await L.rpc('captain', cap, { t: 'order_status', orderId: oid, status: 'served' });
  await L.rpc('captain', cap, { t: 'close_table', tableId: tb.id, method: 'cash', pay: { tendered: 9999 } });
  const after = await L.state(cap); assert.ok(!Object.values(after.sessions).find((x) => x.tableId === tb.id && x.orders && x.orders.length), 'bill closed by the captain');
});
