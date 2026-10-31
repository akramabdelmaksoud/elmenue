const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F9 review categories [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations');
  const post = (b, ip) => S.J('POST', T.u('/feedback'), b, null, { 'X-Forwarded-For': ip || '10.1.1.1' });
  await T.api('POST', '/settings', { fb: { enabled: true, googleUrl: 'https://g.page/r/abc/review' } });
  // overall stars = rounded average of the five categories (5,5,4,4,4 -> 4.4 -> 4 => Google link offered)
  const hi = await post({ cats: { quality: 5, portions: 5, price: 4, service: 4, clean: 4 }, table: 2, guestId: 'a', visit: 'v1' }, '10.2.0.1');
  assert.equal(hi.j.google, 'https://g.page/r/abc/review');
  // a weak visit (price 1, clean 2 ...) averages to 2 => private, and the owner is alerted
  const lo = await post({ cats: { quality: 3, portions: 2, price: 1, service: 3, clean: 2 }, comment: 'too expensive', table: 3, guestId: 'b', visit: 'v1' }, '10.2.0.2');
  assert.equal(lo.j.private, true); assert.equal(lo.j.google, '');
  // out-of-range / junk categories are ignored; with none valid the plain stars field still works (old clients)
  const junk = await post({ cats: { quality: 9, price: 'x', service: 0 }, stars: 4, table: 4, guestId: 'c', visit: 'v1' }, '10.2.0.3'); assert.equal(junk.j.ok, 1);
  assert.equal((await post({ cats: { quality: 9 }, table: 4, guestId: 'd', visit: 'v1' }, '10.2.0.4')).s, 400);
  const sm = (await T.api('GET', '/feedback/summary')).j;
  assert.equal(sm.count, 3);
  assert.equal(sm.catAvg.quality.count, 2); assert.equal(sm.catAvg.quality.avg, 4);
  assert.equal(sm.catAvg.price.avg, 2.5); assert.equal(sm.catAvg.clean.avg, 3);
  const stored = (await T.api('GET', '/feedback')).j.reviews.find((x) => x.guestId === 'a'); assert.equal(stored.stars, 4); assert.equal(stored.cats.clean, 4);
  const csv = await (await fetch(S.base + T.u('/feedback/export.csv?token=' + T.admin))).text(); assert.ok(/Quality,Portions,Price,Service,Cleanliness/.test(csv));
});
