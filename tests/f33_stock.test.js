const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F33 stocktake, waste causes, expiry and planned vs actual food cost [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop()); const T = await S.tenant('vip', { demo: true }), B = await S.tenant('basic');
  assert.equal((await B.api('POST', '/stocktake', { counts: [] })).s, 402); assert.equal((await B.api('GET', '/food-cost')).s, 402);
  const milk = (await T.api('POST', '/ingredients', { name: 'Milk', unit: 'ml', stock: 1000, cost: 0.05, low: 100 })).j, beans = (await T.api('POST', '/ingredients', { name: 'Beans', unit: 'g', stock: 500, cost: 0.4, low: 50, expiry: '2020-01-01' })).j;
  assert.equal(beans.expiry, '2020-01-01'); assert.equal((await T.api('PUT', `/ingredients/${beans.id}`, { expiry: 'not a date' })).j.expiry, '');
  await T.api('PUT', `/ingredients/${beans.id}`, { expiry: '2020-01-01' });
  // waste with a cause, value at cost
  assert.equal((await T.api('POST', `/ingredients/${milk.id}/adjust`, { type: 'waste', qty: 200, cause: 'spilled' })).s, 200);
  await T.api('POST', `/ingredients/${milk.id}/adjust`, { type: 'waste', qty: 100, cause: 'nonsense' });
  // a restock can set the expiry
  assert.equal((await T.api('POST', `/ingredients/${milk.id}/adjust`, { type: 'restock', qty: 100, expiry: '2099-12-31' })).s, 200);
  // stocktake: milk should be 800, counted 750 (50 short = 2.5), beans counted 520 (20 extra = 8)
  assert.equal((await T.api('POST', '/stocktake', { counts: [] })).s, 400);
  const st = await T.api('POST', '/stocktake', { note: 'weekly', counts: [{ id: milk.id, qty: 750 }, { id: beans.id, qty: 520 }, { id: 'nope', qty: 1 }, { id: milk.id, qty: -4 }] });
  assert.equal(st.s, 200); assert.equal(st.j.lines.length, 2); const lm = st.j.lines.find((l) => l.id === milk.id);
  assert.equal(lm.expected, 800); assert.equal(lm.diff, -50); assert.equal(lm.value, -2.5); assert.equal(st.j.short, 2.5); assert.equal(st.j.extra, 8);
  const cur = (await T.api('GET', '/ingredients')).j.ingredients; assert.equal(cur.find((x) => x.id === milk.id).stock, 750); assert.equal(cur.find((x) => x.id === beans.id).stock, 520);
  assert.equal((await T.api('GET', '/stocktakes')).j.takes.length, 1);
  const fc = (await T.api('GET', '/food-cost?days=7')).j;
  assert.equal(fc.waste, 15); assert.equal(fc.byCause.spilled, 10); assert.equal(fc.byCause.other, 5); assert.equal(fc.shrink, 2.5); assert.equal(fc.found, 8);
  assert.ok(fc.actual >= fc.planned + 15); assert.ok(fc.expired.some((x) => x.id === beans.id)); assert.ok(fc.topWaste[0].ing === 'Milk');
  assert.equal((await T.api('GET', '/food-cost?days=999')).j.days, 30);
});
