const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F20 recipes, ingredient stock and food cost [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { demo: true }), B = await S.tenant('basic');
  const cfg = async () => (await T.api('GET', '/config', null, null)).j;
  const item = (await cfg()).items.find((i) => !i.soldOut && i.stock == null && i.price > 0 && !(i.options || []).some((o) => o.required));

  // plan gate
  assert.equal((await B.api('GET', '/ingredients')).s, 402);
  assert.equal((await B.api('POST', '/ingredients', { name: 'x' })).s, 402);

  // ingredients: cleaned and limited
  assert.equal((await T.api('POST', '/ingredients', { name: '' })).s, 400);
  const beans = (await T.api('POST', '/ingredients', { name: 'Beans <b>', unit: 'g', cost: 0.5, stock: 1000, low: 100 })).j, milk = (await T.api('POST', '/ingredients', { name: 'Milk', unit: 'bad', cost: 0.04, stock: 2000, low: 500 })).j;
  assert.ok(!/[<>]/.test(beans.name)); assert.equal(milk.unit, 'g', 'unknown units fall back');

  // recipe: unknown ingredients and zero quantities dropped; item cost follows
  const rr = (await T.api('PUT', `/items/${item.id}/recipe`, { recipe: [{ ing: beans.id, qty: 18 }, { ing: milk.id, qty: 200 }, { ing: 'nope', qty: 5 }, { ing: beans.id, qty: 7 }, { ing: milk.id, qty: 0 }] })).j;
  assert.equal(rr.recipe.length, 2); assert.equal(rr.cost, 17, '18 x 0.5 + 200 x 0.04');
  assert.equal((await T.api('GET', '/config')).j.items.find((i) => i.id === item.id).cost, 17);
  assert.equal((await T.api('PUT', `/ingredients/${beans.id}`, { cost: 1 })).s, 200);
  assert.equal((await T.api('GET', '/config')).j.items.find((i) => i.id === item.id).cost, 26, 'a price change re-costs the dish');

  // guests never see costs or recipes
  const pub = (await S.J('GET', T.u('/config'))).j.items.find((i) => i.id === item.id); assert.equal(pub.cost, undefined); assert.equal(pub.recipe, undefined);

  // selling takes ingredients
  const tb = (await cfg()).tables[3], g = T.guest(tb.number); await g.join();
  await g.call({ t: 'cart_add', itemId: item.id }); await g.call({ t: 'cart_add', itemId: item.id }); await g.call({ t: 'send_order', scope: 'all' });
  const ings = async () => (await T.api('GET', '/ingredients')).j;
  let st = await ings(); assert.equal(st.ingredients.find((x) => x.id === beans.id).stock, 1000 - 36); assert.equal(st.ingredients.find((x) => x.id === milk.id).stock, 2000 - 400);
  assert.ok(st.log.some((l) => l.type === 'sale' && l.ing === 'Beans b'), 'logged');

  // restock / waste / count
  assert.equal((await T.api('POST', `/ingredients/${beans.id}/adjust`, { type: 'restock', qty: 500, cost: 0.5 })).s, 200);
  assert.equal((await T.api('POST', `/ingredients/${beans.id}/adjust`, { type: 'waste', qty: 99999 })).s, 200);
  st = await ings(); assert.equal(st.ingredients.find((x) => x.id === beans.id).stock, 0, 'never below zero');
  assert.equal((await T.api('POST', `/ingredients/${beans.id}/adjust`, { type: 'count', qty: 250 })).s, 200); assert.equal((await ings()).ingredients.find((x) => x.id === beans.id).stock, 250);
  assert.equal((await T.api('POST', `/ingredients/${beans.id}/adjust`, { type: 'bogus', qty: 5 })).s, 400);

  // deleting an ingredient removes it from recipes
  assert.equal((await T.api('DELETE', `/ingredients/${milk.id}`)).s, 200);
  assert.deepEqual((await T.api('GET', '/config')).j.items.find((i) => i.id === item.id).recipe.map((r) => r.ing), [beans.id]);

  // feature lock stops stock movement
  await S.J('PUT', `/api/super/tenants/${T.slug}`, { feat: { recipes: false } }, S.sup);
  const before = (await T.api('GET', '/config')).j; assert.equal(before.features.recipes, false);
  await g.call({ t: 'cart_add', itemId: item.id }); await g.call({ t: 'send_order', scope: 'all' });
  await S.J('PUT', `/api/super/tenants/${T.slug}`, { feat: { recipes: true } }, S.sup);
  assert.equal((await ings()).ingredients.find((x) => x.id === beans.id).stock, 250, 'locked: ingredients untouched');
});
