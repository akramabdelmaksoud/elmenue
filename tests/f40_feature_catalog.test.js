const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F40 feature catalog: prices, add-ons, custom and retired features [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const B = await S.tenant('basic');
  const feats = async (T) => (await T.api('GET', '/config', null, null)).j.features;
  const putF = (features, tok = S.sup) => S.J('PUT', '/api/super/features', { features }, tok);
  const plans = async () => (await S.J('GET', '/api/super/plans', undefined, S.sup)).j;
  const mrr = async () => (await S.J('GET', '/api/super/overview', undefined, S.sup)).j.tenants.find((x) => x.slug === B.slug).mrr;

  // every feature carries a price; cafe owners cannot touch the catalog
  const p0 = await plans(); assert.ok(p0.catalog.every((c) => typeof c.price === 'number')); assert.equal(p0.catalog.find((c) => c.id === 'kds').price, 150);
  assert.equal((await putF([], B.admin)).s, 401);

  // re-price a built-in feature, add a custom one; an add-on is billed on top of the bundle
  const base = await mrr();
  let r = await putF([{ id: 'kds', price: 500 }, { id: 'delivery_app', custom: true, en: 'Delivery app link', ar: 'ربط تطبيقات التوصيل', area: 'admin', level: 3, price: 300 }]);
  assert.equal(r.s, 200); assert.equal(r.j.catalog.find((c) => c.id === 'kds').price, 500); assert.equal(r.j.catalog.find((c) => c.id === 'delivery_app').custom, true);
  assert.equal((await S.J('PUT', `/api/super/tenants/${B.slug}`, { feat: { kds: true, delivery_app: true } }, S.sup)).s, 200);
  const f = await feats(B); assert.equal(f.kds, true); assert.equal(f.delivery_app, true);
  assert.equal(await mrr(), base + 800, 'bundle + both add-ons');

  // a custom feature can go into a bundle like any other
  const basic = (await plans()).plans.find((p) => p.id === 'basic');
  assert.equal((await S.J('PUT', '/api/super/plans', { plans: { basic: { features: [...basic.features, 'delivery_app'], price: basic.price } } }, S.sup)).s, 200);
  assert.equal(await mrr(), base + 500, 'no longer an add-on once the bundle includes it');
  assert.ok((await plans()).catalog.some((c) => c.id === 'delivery_app'), 'saving bundles keeps the catalog');

  // retire a built-in: off everywhere, even where it was unlocked; core features cannot be retired; bad ids are refused
  r = await putF([{ id: 'kds', price: 500, retired: true }, { id: 'menu', retired: true }, { id: 'delivery_app', custom: true, en: 'Delivery app link', price: 300 }]);
  assert.equal(r.s, 200); assert.ok(r.j.retired.some((c) => c.id === 'kds')); assert.ok(r.j.catalog.some((c) => c.id === 'menu'), 'core stays');
  assert.equal((await feats(B)).kds, false);
  assert.equal((await putF([{ id: 'Bad Id!', custom: true }])).s, 400);
  assert.equal((await putF([{ id: 'abc', custom: true }, { id: 'abc', custom: true }])).s, 400);

  // deleting the custom feature (leaving it out) and restoring kds
  r = await putF([]); assert.equal(r.s, 200); assert.ok(!r.j.catalog.some((c) => c.id === 'delivery_app')); assert.equal(r.j.retired.length, 0);
  assert.equal((await feats(B)).kds, true, 'the cafe add-on is back');
  assert.ok(!('delivery_app' in (await feats(B))), 'a deleted feature disappears');
  await S.J('PUT', '/api/super/plans', { reset: true }, S.sup);
});
