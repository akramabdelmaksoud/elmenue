const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const F = require('../features');
for (const mode of ['ws', 'rpc']) test(`F1 upsell [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), B = await S.tenant('basic');
  const C = await T.staff('cashier', 'Mona', '77887788');
  const g = T.guest(15, 'Karim'); let st = (await g.join()).j.state; const cfg0 = st.config; const id = (n) => cfg0.items.find((x) => x.name === n).id;
  // UP-07 off by default, no effect
  assert.equal(cfg0.settings.upsell.enabled, true, 'a new venue starts with recommendations on'); const off = { ...cfg0, settings: { ...cfg0.settings, upsell: { enabled: false, max: 3 } } }; assert.deepEqual(F.upsellFor(off, [id('Prime Ribeye 300g')]), []);
  // UP-08 basic tier cannot use it
  assert.equal((await B.api('POST', '/settings', { upsell: { enabled: true } })).s, 402); assert.equal((await B.api('GET', '/upsell/stats')).s, 402);
  assert.equal((await T.api('POST', '/settings', { upsell: { enabled: true, max: 3 } })).s, 200);
  // UP-01 hand-picked pairs first
  assert.equal((await T.api('PUT', `/items/${id('Rack of Lamb')}`, { pairs: [id('Molten Chocolate Fondant'), id('Fresh Orange Juice'), 'bogus', id('Rack of Lamb')] })).s, 200);
  let cfg = (await g.join()).j.state.config; assert.deepEqual(cfg.items.find((x) => x.name === 'Rack of Lamb').pairs, [id('Molten Chocolate Fondant'), id('Fresh Orange Juice')], 'bogus + self ids dropped');
  let sug = F.upsellFor(cfg, [id('Rack of Lamb')]); assert.deepEqual(sug.slice(0, 2), [id('Molten Chocolate Fondant'), id('Fresh Orange Juice')]); assert.ok(sug.length <= 3);
  // UP-02 fallback to best sellers of complementary categories (drinks/desserts for a food-only cart)
  assert.ok(cfg.best.length > 5, 'best sellers computed from history');
  sug = F.upsellFor(cfg, [id('Prime Ribeye 300g')]); const roles = sug.map((i) => F.catRole(cfg.categories.find((c) => c.id === cfg.items.find((x) => x.id === i).cat))); assert.ok(sug.length > 0 && roles.every((r) => r === 'drink' || r === 'dessert'), roles.join());
  // UP-03 never sold-out / in-cart / out-of-hours / dismissed
  await T.api('PUT', `/items/${id('Molten Chocolate Fondant')}`, { soldOut: true });
  cfg = (await g.join()).j.state.config;
  sug = F.upsellFor(cfg, [id('Rack of Lamb'), id('Fresh Orange Juice')]); assert.ok(!sug.includes(id('Molten Chocolate Fondant')), 'sold out hidden'); assert.ok(!sug.includes(id('Fresh Orange Juice')), 'in cart hidden');
  sug = F.upsellFor(cfg, [id('Rack of Lamb')], { isOpen: (i) => i.cat !== 'c5' }); assert.ok(!sug.some((x) => cfg.items.find((i) => i.id === x).cat === 'c5'), 'closed category hidden');
  sug = F.upsellFor(cfg, [id('Rack of Lamb')], { skip: [id('Fresh Orange Juice')] }); assert.ok(!sug.includes(id('Fresh Orange Juice')), 'dismissed hidden');
  assert.ok(F.upsellFor(cfg, [id('Rack of Lamb')]).length <= 3); assert.deepEqual(F.upsellFor(cfg, []), [], 'empty cart -> nothing');
  await T.api('PUT', `/items/${id('Molten Chocolate Fondant')}`, { soldOut: false });
  // UP-04 accepting adds exactly one line; total updates exactly
  await g.call({ t: 'cart_add', itemId: id('Rack of Lamb') });
  let s = (await g.call({ t: 'upsell_shown', ids: [id('Fresh Orange Juice'), id('Molten Chocolate Fondant')] })).j.state.session; const before = s.cart.length, total0 = s.cart.reduce((n, l) => n + l.qty * l.price, 0);
  s = (await g.call({ t: 'cart_add', itemId: id('Fresh Orange Juice'), up: 1 })).j.state.session;
  assert.equal(s.cart.length, before + 1); assert.equal(s.cart.reduce((n, l) => n + l.qty * l.price, 0), total0 + cfg.items.find((x) => x.id === id('Fresh Orange Juice')).price); assert.equal(s.cart.filter((l) => l.up).length, 1);
  // a repeat "shown" for the same visit is not double counted
  await g.call({ t: 'upsell_shown', ids: [id('Fresh Orange Juice')] });
  // UP-06 metrics match the orders: send, pay at the cashier
  await g.call({ t: 'send_order', scope: 'all' });
  const sess = Object.values((await T.rpc('cashier', C, null)).j.state.sessions).find((x) => x.tableNumber === 15); assert.ok(sess);
  assert.equal((await T.rpc('cashier', C, { t: 'close_table', tableId: sess.tableId, method: 'cash', pay: { tip: 0, tendered: 9999 } })).s, 200);
  let m = (await T.api('GET', '/upsell/stats')).j;
  assert.equal(m.shown, 2); assert.equal(m.accepted, 1); assert.equal(m.rate, 50); assert.equal(m.revenue, cfg.items.find((x) => x.id === id('Fresh Orange Juice')).price);
  const oj = m.items.find((x) => x.id === id('Fresh Orange Juice')); assert.equal(oj.accepted, 1); assert.equal(oj.rate, 100);
  const csv = await (await fetch(S.base + T.u('/upsell/export.csv?token=' + T.admin))).text(); assert.ok(csv.includes('Fresh Orange Juice') && csv.includes('TOTAL'));
  // non-destructive Clear: counters restart, sales history untouched
  const rcBefore = (await T.api('GET', '/receipts', null, C)).j.receipts.length;
  await T.api('POST', '/upsell/clear', {}); m = (await T.api('GET', '/upsell/stats')).j; assert.equal(m.shown, 0); assert.equal(m.revenue, 0);
  assert.equal((await T.api('GET', '/receipts', null, C)).j.receipts.length, rcBefore);
  // flag off: engine ignores the flag even if a client sends it
  await T.api('POST', '/settings', { upsell: { enabled: false } }); const g2 = T.guest(16); await g2.join();
  const s2 = (await g2.call({ t: 'cart_add', itemId: id('Wagyu Burger'), up: 1 })).j.state.session; assert.equal(s2.cart.filter((l) => l.up).length, 0);
  // isolation / auth
  assert.equal((await S.J('GET', T.u('/upsell/stats'), null, B.admin)).s, 403); assert.equal((await S.J('GET', T.u('/upsell/stats'), null, null)).s, 401);
});
