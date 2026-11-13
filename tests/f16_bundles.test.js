const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F16 editable bundles and per-cafe locks [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const B = await S.tenant('basic'), O = await S.tenant('operations');
  const feats = async (T) => (await T.api('GET', '/config', null, null)).j.features;
  const put = (body, tok = S.sup) => S.J('PUT', '/api/super/plans', body, tok);

  // read: catalogue and the three bundles
  const pl = await S.J('GET', '/api/super/plans', undefined, S.sup); assert.equal(pl.s, 200);
  assert.ok(pl.j.catalog.length >= 30); assert.deepEqual(pl.j.plans.map((p) => p.id), ['lite', 'basic', 'operations', 'vip']);
  assert.equal((await S.J('GET', '/api/super/plans', undefined, B.admin)).s, 401, 'cafe owners cannot read or edit bundles');
  assert.equal((await put({ plans: {} }, B.admin)).s, 401);
  const pub = await S.J('GET', '/api/public/plans'); assert.equal(pub.s, 200); assert.equal(pub.j.plans.length, 4);

  // default: basic has ordering + options, no kitchen display
  assert.equal((await feats(B)).ordering, true); assert.equal((await feats(B)).options, true); assert.ok(!(await feats(B)).kds);

  // edit the Starter bundle: add insights, drop ordering, new price and table limit
  const basic = pl.j.plans[1];
  const saved = await put({ plans: { basic: { features: [...basic.features.filter((f) => f !== 'ordering'), 'insights'], price: [700, 900], limits: { tables: 12 }, name: 'Starter Plus' } } });
  assert.equal(saved.s, 200); const nb = saved.j.plans[1];
  assert.equal(nb.name, 'Starter Plus'); assert.deepEqual(nb.price, [700, 900]); assert.equal(nb.limits.tables, 12);
  assert.ok(!(await feats(B)).ordering, 'ordering locked for every Starter cafe'); assert.equal((await feats(B)).insights, true);
  assert.equal((await B.api('GET', '/insights')).s, 200, 'insights endpoint now open for Starter');
  assert.equal((await S.J('GET', '/api/public/plans')).j.plans[1].price, 700);

  // validation
  assert.equal((await put({ plans: { basic: { features: 'x', price: [1, 2] } } })).s, 400);
  assert.equal((await put({ plans: { basic: { features: [], price: [-5, 2] } } })).s, 400);
  assert.equal((await put({})).s, 400);
  const junk = await put({ plans: { basic: { features: ['menu', 'nope', '__proto__'], price: [1, 2] } } }); assert.equal(junk.s, 200); assert.deepEqual(junk.j.plans[1].features, ['menu']);

  // per-cafe lock / unlock on top of the bundle
  await put({ plans: { basic: { features: basic.features, price: [600, 800] } } });
  assert.equal((await feats(B)).ordering, true);
  assert.equal((await S.J('PUT', `/api/super/tenants/${B.slug}`, { feat: { kds: true, ordering: false, bogus: true } }, S.sup)).s, 200);
  const f = await feats(B); assert.equal(f.kds, true, 'unlocked for this cafe'); assert.equal(f.ordering, false, 'locked for this cafe'); assert.ok(!('bogus' in f));
  assert.equal((await feats(O)).ordering, true, 'other cafes untouched');
  const g = B.guest(1); await g.join(); const r = await g.call({ t: 'cart_add', itemId: (await B.api('GET', '/config', null, null)).j.items[0].id });
  assert.ok(!(r.j.state && r.j.state.session && r.j.state.session.cart && r.j.state.session.cart.length), 'locked ordering really blocks the cart');
  const ov = await S.J('GET', '/api/super/overview', undefined, S.sup); assert.deepEqual(ov.j.tenants.find((x) => x.slug === B.slug).feat, { kds: true, ordering: false });
  assert.equal((await S.J('PUT', `/api/super/tenants/${B.slug}`, { feat: {} }, S.sup)).s, 200); assert.equal((await feats(B)).ordering, true);

  // restore built-in bundles
  assert.equal((await put({ reset: true })).s, 200); assert.equal((await S.J('GET', '/api/super/plans', undefined, S.sup)).j.plans[1].name, 'Starter QR Ordering');
});
