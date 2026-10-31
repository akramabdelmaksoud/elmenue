const test = require('node:test'), assert = require('node:assert/strict');
const I = require('../insights.js'), F = require('../features.js');
const at = (daysAgo, h, m = 0) => new Date(2026, 9, 31 - daysAgo, h, m).getTime();   // local time, so the test does not depend on the machine's zone
const NOW = at(0, 12);

function venue() {
  const history = [], reviews = [], hr = (b, who, total, over = {}) => history.push({ startedAt: b, closedAt: b + 40 * 60000, closedBy: who, total, sub: total, discount: 0, items: [{ name: 'Latte', qty: 1, price: 50, cost: 10 }], voids: [], ...over });
  for (let d = 1; d <= 13; d++) {
    if (d === 5 || d === 6) { hr(at(d, 13), 'Sara', 80); continue; }                        // two collapsed days
    for (let i = 0; i < 4; i++) { hr(at(d, 13, i * 5), i % 2 ? 'Ali' : 'Sara', 200, i % 2 ? { discount: 40, sub: 240 } : {}); hr(at(d, 14, i * 5), 'Sara', 200); }   // lunch peak
    for (let i = 0; i < 5; i++) hr(at(d, 20, i * 5), 'Sara', 220);                           // evening peak
    hr(at(d, 16), 'Sara', 100);                                                              // dead afternoon
  }
  const cat = (q, p, c, s, cl) => ({ quality: q, portions: 4, price: p, service: s, clean: cl });
  [['too expensive for what you get', 2], ['غالي جدا', 2], ['slow, waited long', 3]].forEach(([c, p], i) => reviews.push({ id: 'r' + i, at: at(i + 1, 15), stars: 2, comment: c, cats: cat(4, p, 4, 3, 4), waiter: 'Ali', handled: false }));
  [4, 5].forEach((s, i) => reviews.push({ id: 'g' + i, at: at(i + 2, 21), stars: s, comment: '', cats: cat(5, 3, 5, 5, 5), waiter: 'Sara' }));
  const bucket = (n, resp) => { const c = [n, n, n, n, n, resp * 1000 * n]; return c; };
  const staffLog = { a: { b: {}, ev: [] }, s: { b: {}, ev: [] } };
  for (let d = 1; d <= 13; d++) { staffLog.a.b[Math.floor(at(d, 13) / 3600000)] = bucket(1, 200); staffLog.s.b[Math.floor(at(d, 20) / 3600000)] = bucket(3, 30); }
  staffLog.a.ev.push([at(1, 13), 1, 1]);
  return { history, reviews, staffLog, staffList: [{ id: 'a', name: 'Ali', role: 'captain' }, { id: 's', name: 'Sara', role: 'captain' }], staffStats: {}, now: NOW, days: 14 };
}

test('F11 insights: peaks, quiet hours, drops', () => {
  const r = I.analyze(venue()), v = r.venue; assert.equal(r.ready, true);
  const has = (w, h) => w.some(([a, b]) => h >= a && h < b);
  assert.ok(has(v.peakWindows, 13) && has(v.peakWindows, 20), 'lunch and evening peaks: ' + JSON.stringify(v.peakWindows));
  assert.ok(has(v.quietWindows, 17) && !has(v.quietWindows, 20), 'dead afternoon is quiet: ' + JSON.stringify(v.quietWindows));
  assert.equal(v.drops.length, 2, 'two collapsed days'); assert.ok(r.suggestions.some((s) => s.id === 'drops'));
  const peak = r.suggestions.find((s) => s.id === 'peak'); assert.ok(peak && /13:00/.test(peak.en.title) && /الزحمة/.test(peak.ar.title));
  assert.ok(r.suggestions.some((s) => s.id === 'quiet'));
});

test('F11 insights: captains are flagged for slowness, discounts and rating', () => {
  const r = I.analyze(venue()), ali = r.staff.find((s) => s.name === 'Ali'), sara = r.staff.find((s) => s.name === 'Sara');
  assert.equal(ali.avgResponseSec, 200); assert.ok(ali.flags.some((f) => /Slow to respond/.test(f.en)), 'slow'); assert.ok(ali.flags.some((f) => /discounts/.test(f.en)), 'discount');
  assert.ok(ali.flags.some((f) => /rate their tables/.test(f.en)), 'rating'); assert.equal(sara.flags.length, 0, 'the good captain is not flagged');
  assert.deepEqual(ali.peak, [[13, 14]]); assert.deepEqual(sara.peak, [[20, 21]]); assert.equal(ali.perDay.length, 13); assert.equal(ali.events.length, 1);
  assert.ok(r.suggestions.some((s) => s.id === 'staff-a' && s.level === 'alert') && !r.suggestions.some((s) => s.id === 'staff-s'));
});

test('F11 insights: reviews turn into specific advice', () => {
  const r = I.analyze(venue()), rv = r.reviews;
  assert.equal(rv.cats.price.avg, 2.6); assert.ok(r.suggestions.some((s) => s.id === 'cat-price' && s.level === 'alert' && /value/i.test(s.en.detail)));
  assert.ok(rv.themes.find((t) => t.key === 'price').count === 2, 'English + Arabic price complaints grouped'); assert.ok(r.suggestions.some((s) => s.id === 'theme-price'));
  assert.ok(!r.suggestions.some((s) => s.id === 'cat-quality'), 'a healthy category is not flagged');
  assert.equal(r.suggestions[0].level, 'alert', 'most serious first'); assert.equal(rv.unhandled, 3);
});

test('F11 insights: drop vs previous period and fading items', () => {
  const d = venue(); d.days = 7;                                                           // 7 days: this week vs the week before
  d.history.forEach((h) => { if (h.closedAt > at(7, 0)) h.total = h.total * 0.5; });       // halve this week
  d.history.forEach((h, i) => { if (h.closedAt > at(7, 0)) h.items = [{ name: 'Mocha', qty: 1, price: 60, cost: 10 }]; else h.items = [{ name: 'Mocha', qty: 3, price: 60, cost: 10 }]; });
  const r = I.analyze(d); assert.ok(r.venue.revDelta <= -15, 'revDelta ' + r.venue.revDelta); assert.ok(r.suggestions.some((s) => s.id === 'rev-down'));
  assert.ok(r.venue.fading.some((f) => f.name === 'Mocha'));
  assert.equal(I.analyze({ history: [], reviews: [], now: NOW }).suggestions[0].id, 'few-data', 'no data -> honest message, no invented advice');
});
