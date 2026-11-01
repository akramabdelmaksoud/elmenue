const test = require('node:test'), assert = require('node:assert/strict');
const CH = require('../chain'), { start } = require('./helper');
const NOW = Date.UTC(2026, 5, 15, 18), D = 86400000;
const sale = (daysAgo, total, o = {}) => ({ id: 'h' + Math.random(), kind: 'table', startedAt: NOW - daysAgo * D - 3000000, closedAt: NOW - daysAgo * D, guests: 2, sub: total, total, discount: 0, items: [{ name: o.dish || 'Latte', qty: 2, price: total / 2, cost: o.cost === undefined ? total / 20 : o.cost }], ...o });
const mk = (slug, n, total, o) => ({ slug, name: slug.toUpperCase(), currency: 'EGP', hist: Array.from({ length: n }, (_, i) => sale(1 + (i % 25), total, o)), ins: { reviews: { count: 10, avg: o && o.rating || 4.5 } } });
test('F30 chain compares branches, ranks them and explains the gaps', () => {
  const r = CH.build({ days: 30, now: NOW, branches: [mk('a', 60, 200, {}), mk('b', 60, 120, { cost: 30, discount: 12, rating: 3.8 }), { ...mk('c', 4, 100), hist: [] }] });
  assert.equal(r.branches.length, 3);
  const a = r.branches.find((x) => x.slug === 'a'), b = r.branches.find((x) => x.slug === 'b');
  assert.equal(a.revenue, 12000); assert.equal(a.avgTicket, 200); assert.equal(a.foodCostPct, 10); assert.equal(b.foodCostPct, 50);
  assert.equal(r.totals.revenue, 12000 + 7200); assert.equal(a.rank.revenue, 1); assert.equal(b.rank.avgTicket, 2);
  assert.equal(r.rank.foodCostPct.best, 'a'); assert.equal(r.rank.foodCostPct.worst, 'b');
  assert.equal(a.series.length, 30); assert.equal(Math.round(a.series.reduce((n, x) => n + x, 0)), 12000);
  assert.equal(a.share + b.share, 100);
  assert.ok(r.findings.some((f) => /spends 50% of sales on ingredients/.test(f.title) && f.branch === 'b'), 'food cost gap');
  assert.ok(r.findings.some((f) => /bills .*less per table/.test(f.title)), 'ticket gap');
  assert.ok(r.findings.some((f) => /rated 3.8/.test(f.title)), 'rating gap');
  assert.ok(!r.findings.some((f) => f.branch === 'c' && f.type === 'risk' && /spends/.test(f.title)), 'quiet branch not judged');
});
test('F30 a single branch, or none, never throws', () => {
  assert.equal(CH.build({ days: 7, now: NOW, branches: [] }).branches.length, 0);
  const r = CH.build({ days: 7, now: NOW, branches: [{ slug: 'x', name: 'X', hist: [], ins: {} }] }); assert.ok(r.findings.some((f) => /Only one branch/.test(f.title)));
});
for (const mode of ['ws', 'rpc']) test(`F30 branches route [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop()); const T = await S.tenant('vip', { demo: true }), B = await S.tenant('basic');
  assert.equal((await B.api('GET', '/branches')).s, 402);
  const r = await T.api('GET', '/branches?days=60'); assert.equal(r.s, 200); assert.equal(r.j.days, 60); assert.equal(r.j.branches.length, 1); assert.ok(r.j.branches[0].series.length === 60);
  assert.equal(typeof r.j.totals.revenue, 'number'); assert.ok(Array.isArray(r.j.findings)); assert.equal((await T.api('GET', '/branches?days=abc')).j.days, 30);
});
