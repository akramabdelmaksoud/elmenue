const test = require('node:test'), assert = require('node:assert/strict');
const INS = require('../insights'), { start } = require('./helper');
const NOW = new Date(2026, 5, 15, 20).getTime(), D = 86400000;
const sale = (ago, hour, items, o = {}) => { const t = new Date(NOW - ago * D); t.setHours(hour, 0, 0, 0); const total = items.reduce((n, i) => n + i.price * i.qty, 0); return { id: 'h' + Math.random(), kind: 'table', startedAt: t.getTime(), closedAt: t.getTime() + (o.mins || 50) * 60000, guests: 2, sub: total, total, items, pay: { cash: total }, ...o }; };
test('F31 deep dive: pairs, dead menu, day parts, repeat guests, forecast', () => {
  const hist = []; for (let i = 1; i <= 28; i++) { hist.push(sale(i, 13, [{ name: 'Burger', qty: 1, price: 100 }, { name: 'Cola', qty: 1, price: 20 }], { customer: { phone: i % 4 ? '0100' + (i % 5) : '' } })); hist.push(sale(i, 20, [{ name: 'Tea', qty: 1, price: 15 }])); }
  hist.push(...[1, 2, 3, 4].map((i) => sale(i, 19, [{ name: 'Tea', qty: 1, price: 15 }], { mins: 170 })));
  const r = INS.analyze({ history: hist, days: 30, now: NOW, menu: [{ name: 'Burger' }, { name: 'Cola' }, { name: 'Tea' }, ...['A', 'B', 'C', 'D', 'E'].map((n) => ({ name: 'Ghost ' + n }))], reviews: [], staffLog: {}, staffStats: {}, staffList: [] });
  const d = r.deep; assert.ok(d);
  assert.equal(d.pairs[0].a, 'Burger'); assert.equal(d.pairs[0].b, 'Cola'); assert.equal(d.pairs[0].n, 28);
  assert.equal(d.menu.unsold.length, 5); assert.ok(r.suggestions.some((s) => s.id === 'dead'));
  assert.ok(d.parts.find((p) => p.en === 'Lunch').orders === 28 && d.parts.find((p) => p.en === 'Evening').orders >= 28);
  assert.equal(d.parts.reduce((n, p) => n + p.share, 0) > 99, true);
  assert.ok(d.guests.unique >= 4 && d.guests.repeat >= 4); assert.equal(d.forecast.length, 7); assert.ok(d.forecast.every((f) => f.expected === null || f.expected > 0));
  assert.equal(d.map.length, 7); assert.equal(d.dwell.long, 4); assert.ok(d.pay.cash > 0);
  assert.ok(r.suggestions.some((s) => s.id === 'pair') && r.suggestions.some((s) => s.id === 'forecast'));
});
test('F31 an empty café never breaks the deep dive', () => {
  const d = INS.analyze({ history: [], days: 14, now: NOW }).deep; assert.equal(d.pairs.length, 0); assert.equal(d.dwell.avg, 0); assert.equal(d.guests.unique, 0);
});
for (const mode of ['ws', 'rpc']) test(`F31 insights route carries the deep block [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop()); const T = await S.tenant('operations', { demo: true });
  const r = await T.api('GET', '/insights?days=30'); assert.equal(r.s, 200); assert.ok(r.j.deep && r.j.deep.menu.size > 0);
});
