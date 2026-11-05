const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
test('F42 add-on prices, the bundle request and the website settings', async (t) => {
  const S = await start('rpc'); t.after(() => S.stop());
  const sup = (await S.J('POST', '/api/super/login', { email: 'super@test.dev', password: 'SuperPass123!' })).j.token;
  const pub = (await S.J('GET', '/api/public/site')).j;
  assert.equal(pub.plans.length, 3); assert.ok(pub.catalog.length > 20);
  const ops = pub.plans.find((p) => p.id === 'operations'), loy = pub.catalog.find((c) => c.id === 'loyalty'), gift = pub.catalog.find((c) => c.id === 'giftcards');
  assert.ok(!ops.features.includes('loyalty') && loy.price > 0, 'loyalty is an add-on on Operations, and it has a price');
  // the owner prices a feature, and the public list follows
  assert.equal((await S.J('PUT', '/api/super/site', { mult: { life: 20, svc: 4, yearMonths: 10 }, text: {} })).s, 401, 'only the platform owner');
  const bad = await S.J('PUT', '/api/super/site', { mult: { life: 0, svc: 4, yearMonths: 10 } }, sup); assert.equal(bad.s, 400);
  assert.equal((await S.J('PUT', '/api/super/features', { features: [{ id: 'loyalty', en: 'Loyalty points', ar: 'نقاط الولاء', area: 'guest', level: 4, price: 250 }] }, sup)).s, 200, 'prices come from the feature catalog');
  const saved = await S.J('PUT', '/api/super/site', { mult: { life: 15, svc: 3, yearMonths: 10 }, announce: { on: true, en: 'Launch offer', ar: 'عرض الإطلاق' }, text: { en: { h1: 'Custom headline' }, ar: {} } }, sup);
  assert.equal(saved.s, 200);
  const pub2 = (await S.J('GET', '/api/public/site')).j;
  assert.equal(pub2.catalog.find((c) => c.id === 'loyalty').price, 250); assert.equal(pub2.mult.life, 15); assert.equal(pub2.announce.en, 'Launch offer'); assert.equal(pub2.text.en.h1, 'Custom headline');
  // a bundle request is priced on the server, whatever the browser says
  const q = { plan: 'operations', mode: 'life', features: ['loyalty', 'giftcards', 'menu', 'nonsense', 'loyalty'], price: 1 };
  const r = await S.J('POST', '/api/contact', { name: 'Mona Adel', email: 'mona@cafe.eg', place: 'Cafe Nile', quote: q }, null, { 'X-Forwarded-For': '10.4.4.4' }); assert.equal(r.s, 200);
  const row = (await S.J('GET', '/api/super/contacts', undefined, sup)).j[0];
  const month = ops.price + 250 + gift.price;
  assert.equal(row.quote.month, month, 'base + add-ons, included and unknown features ignored'); assert.equal(row.quote.addons.length, 2);
  assert.equal(row.quote.total, month * 15, 'lifetime uses the owner multiplier'); assert.equal(row.quote.service, month * 3);
  assert.match(row.message, /BUNDLE REQUEST/); assert.match(row.message, /Loyalty/i);
  assert.equal((await S.J('POST', '/api/contact', { name: 'Mona Adel', email: 'mona@cafe.eg', quote: { plan: 'zzz' } }, null, { 'X-Forwarded-For': '10.4.4.5' })).s, 400, 'an unknown plan is not a request');
  // the console can read the website texts it may edit
  const site = (await S.J('GET', '/api/super/site', undefined, sup)).j; assert.ok(Object.keys(site.texts.en).length > 20 && site.texts.en.h1);
  // the builder page is served
  const pg = await fetch(S.base + '/build'); assert.equal(pg.status, 200); assert.match(await pg.text(), /Build your bundle/);
  // ready-made bundles and the most-picked badge
  const withB = await S.J('PUT', '/api/super/site', { mult: { life: 15, svc: 3, yearMonths: 10 }, text: {}, bundles: [{ name: 'Coffee shop pack', name_ar: 'باقة الكافيه', plan: 'basic', features: ['loyalty', 'zzz', 'upsell'] }, { name: '' }] }, sup);
  assert.equal(withB.s, 200); const pub3 = (await S.J('GET', '/api/public/site')).j;
  assert.equal(pub3.bundles.length, 1); assert.deepEqual(pub3.bundles[0].features, ['loyalty', 'upsell']); assert.equal(pub3.bundles[0].plan, 'basic');
  assert.ok(pub3.popular.includes('loyalty') && pub3.popular.includes('giftcards'), 'features people asked for are marked most picked');
});
