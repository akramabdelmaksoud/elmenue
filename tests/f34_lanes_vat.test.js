const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F34 kitchen priority lanes and monthly VAT summary [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop()); const T = await S.tenant('vip', { demo: true }), B = await S.tenant('basic');
  const cap = await T.staff('captain', 'Wael', '43214321'), kit = await T.staff('kitchen', 'Hany', '55555555'), cfg = (await T.api('GET', '/config', null, null)).j;
  const item = cfg.items.find((i) => !i.soldOut && i.stock == null), tb = cfg.tables.find((x) => x.number === 9) || cfg.tables[cfg.tables.length - 1];
  await T.rpc('captain', cap, { t: 'staff_order', tableId: tb.id, items: [{ itemId: item.id, qty: 1 }] });
  const get = async () => Object.values((await T.state(cap)).sessions).find((x) => x.tableId === tb.id).orders[0];
  const oid = (await get()).id;
  assert.equal((await get()).lane, undefined);
  await T.rpc('captain', cap, { t: 'order_lane', orderId: oid, lane: 'rush' }); assert.equal((await get()).lane, 'rush');
  await T.rpc('kitchen', kit, { t: 'order_lane', orderId: oid, lane: 'vip' }); assert.equal((await get()).lane, 'vip');
  await T.rpc('kitchen', kit, { t: 'order_lane', orderId: oid, lane: 'bogus' }); assert.equal((await get()).lane, 'vip', 'unknown lanes are ignored');
  await T.rpc('kitchen', kit, { t: 'order_lane', orderId: oid, lane: 'normal' }); assert.equal((await get()).lane, undefined);
  await T.rpc('kitchen', kit, { t: 'order_status', orderId: oid, status: 'served' }); await T.rpc('captain', cap, { t: 'order_lane', orderId: oid, lane: 'rush' }); assert.equal((await get()).lane, undefined, 'served tickets cannot be re-prioritised');
  // VAT summary
  assert.equal((await B.api('GET', '/vat-summary')).s, 402); assert.equal((await T.api('GET', '/vat-summary?month=2026-13')).s, 400);
  const sup = (await T.api('POST', '/suppliers', { name: 'S' })).j, ing = (await T.api('POST', '/ingredients', { name: 'Flour', unit: 'g', stock: 0, cost: 1 })).j;
  const po = (await T.api('POST', '/pos', { supplier: sup.id, taxPct: 14, lines: [{ ing: ing.id, qty: 100, price: 1 }] })).j; await T.api('POST', `/pos/${po.id}/receive`, {});
  const now = new Date(), m = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), v = (await T.api('GET', '/vat-summary?month=' + m)).j;
  assert.equal(v.purchases.orders, 1); assert.equal(v.purchases.net, 100); assert.equal(v.purchases.vat, 14); assert.equal(v.payable, Math.round((v.sales.vat - 14) * 100) / 100); assert.ok(v.sales.orders >= 1);
});
