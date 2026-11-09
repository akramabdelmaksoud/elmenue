const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const F = require('../features');
for (const mode of ['ws', 'rpc']) test(`F36 separate checks, serving, empty tables, recommendations [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations');
  const cap = await T.staff('captain', 'Wael', '43214321');
  const cfg = (await T.guest(1).join()).j.state.config, item = (n) => cfg.items.find((x) => x.name === n);
  const state = async () => await T.state(cap), sess = async (n) => Object.values((await state()).sessions).find((x) => x.tableNumber === n);
  // ---- two guests at table 21, each orders their own dish
  const a = T.guest(3, 'Host'), b = T.guest(3, 'Sara'); await a.join(); await b.join();
  await a.call({ t: 'cart_add', itemId: item('Classic Burger').id }); await a.call({ t: 'send_order', scope: 'mine' });
  await b.call({ t: 'cart_add', itemId: item('Caesar Salad').id }); await b.call({ t: 'cart_add', itemId: item('Still Water').id }); await b.call({ t: 'send_order', scope: 'mine' });
  let s = await sess(3); assert.equal(s.orders.length, 2);
  // ---- SEPARATE check: only her own dishes, her own service and tax; the table is not asking for a full check
  await b.call({ t: 'check', scope: 'mine', method: 'cash', tipPct: 10 });
  s = await sess(3); const bid = s.guests.find((g) => g.name === 'Sara').id, aid = s.guests.find((g) => g.name === 'Host').id;
  assert.equal(s.check, null, 'not a full table check'); assert.ok(s.sepChecks[bid], 'her separate check is recorded'); assert.equal(s.sepChecks[bid].tipPct, 10);
  const req = s.requests.find((r) => r.type === 'bill' && r.sep); assert.equal(req.by, bid);
  assert.deepEqual(s.bill.byGuest[bid].items.map((i) => i.name).sort(), ['Caesar Salad', 'Still Water'], 'only what she ordered');
  assert.ok(s.bill.byGuest[bid].service > 0 && s.bill.byGuest[bid].tax > 0, 'with her service and tax');
  assert.ok(s.bill.byGuest[bid].total < s.bill.total, 'less than the whole table');
  assert.equal((await T.state(cap)).states[s.tableId], 'check', 'the captain map shows the check');
  // a guest with nothing of their own cannot ask for one, and one guest cannot ask on behalf of another
  const c = T.guest(3, 'Late'); await c.join(); await c.call({ t: 'check', scope: 'mine', method: 'cash' }); s = await sess(3); assert.equal(Object.keys(s.sepChecks).length, 1);
  // the host can still ask for the full table at the same time, and cancelling one leaves the other alone
  await a.call({ t: 'check', method: 'cash', split: 'table', tipPct: 0 }); s = await sess(3); assert.ok(s.check && s.sepChecks[bid]); assert.equal(s.requests.filter((r) => r.type === 'bill' && !r.done).length, 2);
  await b.call({ t: 'check_cancel', scope: 'mine' }); s = await sess(3); assert.ok(!s.sepChecks[bid] && s.check, 'only hers was cancelled');
  await a.call({ t: 'check_cancel' }); s = await sess(3); assert.equal(s.check, null);
  // the old 'self' split now means a separate check as well
  await b.call({ t: 'check', split: 'self', method: 'card', tipPct: 0 }); s = await sess(3); assert.equal(s.sepChecks[bid].method, 'card'); assert.equal(s.check, null);
  assert.equal(aid !== bid, true);
  // ---- SERVING: the kitchen finishes, the waiter serves some dishes; the rest stays; the order closes with its last dish
  const ord = s.orders.find((o) => o.items.length === 2); assert.ok(ord, 'an order with two dishes');
  const serve = (msg) => T.rpc('captain', cap, { t: 'serve_items', tableId: s.tableId, orderId: ord.id, ...msg });
  await serve({ items: [ord.items[0].id] }); assert.equal((await sess(3)).orders.find((o) => o.id === ord.id).items[0].served, undefined, 'cannot serve before the kitchen is done');
  await T.rpc('captain', cap, { t: 'order_status', orderId: ord.id, status: 'kitchen' }); await T.rpc('captain', cap, { t: 'order_status', orderId: ord.id, status: 'served' });
  await serve({ items: [ord.items[0].id] }); let o2 = (await sess(3)).orders.find((o) => o.id === ord.id);
  assert.ok(o2.items[0].served, 'first dish served'); assert.ok(!o2.items[1].served, 'second still to serve'); assert.equal(o2.status, 'served', 'the order stays open');
  assert.equal(o2.items[0].servedBy, 'Wael');
  await serve({ items: ['nope'] }); assert.equal((await sess(3)).orders.find((o) => o.id === ord.id).status, 'served', 'an unknown dish serves nothing');
  await serve({ all: true }); o2 = (await sess(3)).orders.find((o) => o.id === ord.id); assert.equal(o2.status, 'closed'); assert.ok(o2.items.every((i) => i.served));
  // ---- an empty table: the captain clears it and it leaves no trace
  const e = T.guest(4, 'Browser'); await e.join(); await e.call({ t: 'cart_add', itemId: item('Cheesecake').id });
  const hist0 = (await T.api('GET', '/orders?from=0&to=' + (Date.now() + 1000))).j; const n0 = (hist0.orders || hist0).length;
  const stats0 = JSON.stringify(((await T.api('GET', '/staff')).j.stats) || {});
  assert.ok(await sess(4), 'the browsing table is open');
  await T.rpc('captain', cap, { t: 'clear_empty', tableId: (await sess(4)).tableId }); assert.equal(await sess(4), undefined, 'cleared');
  await T.rpc('captain', cap, { t: 'clear_empty', tableId: s.tableId }); assert.ok(await sess(3), 'a table with orders is never cleared this way');
  const hist1 = (await T.api('GET', '/orders?from=0&to=' + (Date.now() + 1000))).j; assert.equal((hist1.orders || hist1).length, n0, 'no sale recorded');
  assert.equal(JSON.stringify(((await T.api('GET', '/staff')).j.stats) || {}), stats0, 'no staff statistic changed');
  // ---- RECOMMENDATIONS: a lunch gets a drink, a side, a dessert and water
  const role = (id) => F.itemRole(cfg.items.find((x) => x.id === id), cfg.categories.find((c2) => c2.id === cfg.items.find((x) => x.id === id).cat));
  const sug = F.upsellFor(cfg, [item('Classic Burger').id]); const roles = sug.map(role);
  assert.ok(cfg.settings.upsell.enabled && sug.length >= 3 && sug.length <= 4, 'suggestions on by default: ' + sug.length);
  assert.ok(roles.includes('drink') && roles.includes('side') && roles.includes('dessert'), 'drink + side + dessert: ' + roles);
  assert.ok(sug.some((id) => /water/i.test(cfg.items.find((x) => x.id === id).name)), 'water is offered');
  const sug2 = F.upsellFor(cfg, [item('Classic Burger').id, item('Still Water').id], { ordered: [] }); assert.ok(!sug2.includes(item('Still Water').id) && sug2.map(role).includes('side'), 'a meal with a drink is offered a side');
  assert.equal(F.itemRole({ name: 'Pepsi', name_ar: '' }, { name: 'Extras' }), 'drink'); assert.equal(F.itemRole({ name: 'Tahini dip', name_ar: 'طحينة' }, { name: 'Mains' }), 'side'); assert.equal(F.itemRole({ name: 'Extra Shot', name_ar: '' }, { name: 'Shisha & Extras' }), 'addon');
});
