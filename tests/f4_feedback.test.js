const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F4 feedback + Google [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations'), B = await S.tenant('basic');
  const post = (b, ip) => S.J('POST', T.u('/feedback'), b, null, ip ? { 'X-Forwarded-For': ip } : {});
  // X-02 flag OFF by default: legacy behaviour, no google link, no dedupe fields
  const cfg = (await T.api('GET', '/settings')).j; 
  const off = await post({ stars: 5, comment: 'great', table: 3, name: 'A' }); assert.equal(off.j.ok, 1); assert.equal(off.j.google, ''); assert.equal(off.j.private, false);
  // X-03 tier gating of the setting
  assert.equal((await B.api('POST', '/settings', { fb: { enabled: true } })).s, 402);
  // enable + google link (https only)
  assert.equal((await T.api('POST', '/settings', { fb: { enabled: true, googleUrl: 'javascript:alert(1)' } })).s, 200);
  assert.equal((await T.api('POST', '/settings', { fb: { enabled: true, googleUrl: 'https://g.page/r/abc/review' } })).s, 200);
  // the link is never in the public config
  const guest = T.guest(4, 'Nour'); const j = await guest.join(); assert.equal(j.j.state.config.settings.fb.googleUrl, undefined); assert.equal(j.j.state.config.settings.fb.enabled, true);
  // FB-02 4-5 stars -> google link; FB-03 1-3 stars private + no google
  const hi = await post({ stars: 5, comment: 'ممتاز جداً ☕', table: 4, name: 'Nour', guestId: 'g1', visit: 'v1' }, '10.0.0.1'); assert.equal(hi.j.google, 'https://g.page/r/abc/review');
  const lo = await post({ stars: 2, comment: 'cold food', table: 4, name: 'Sam', guestId: 'g2', visit: 'v1' }, '10.0.0.1'); assert.equal(lo.j.google, ''); assert.equal(lo.j.private, true);
  // FB-01 one rating per guest per visit
  const dup = await post({ stars: 1, table: 4, guestId: 'g1', visit: 'v1' }, '10.0.0.1'); assert.equal(dup.j.dup, true);
  const all = (await T.api('GET', '/feedback')).j.reviews; assert.equal(all.filter((x) => x.guestId === 'g1').length, 1);
  // FB-07 Arabic round-trips
  assert.ok(all.some((x) => x.comment === 'ممتاز جداً ☕'));
  // FB-03 owner is alerted for the low rating (captain alert feed) and admin badge count
  const cap = await T.staff('captain', 'Wael', '43214321'); const al = await S.J('POST', T.u('/rpc'), { join: { role: 'captain', token: cap }, msg: null, since: 0 }, cap); assert.ok(al.j.alerts.some((a) => a.kind === 'feedback'), 'alert for low rating');
  // FB-04 dashboard numbers vs seeded reviews
  for (const [s, g] of [[4, 'g3'], [3, 'g4'], [5, 'g5']]) await post({ stars: s, table: 5, guestId: g, visit: 'v2' }, '10.0.1.' + g);
  const sm = (await T.api('GET', '/feedback/summary')).j; assert.equal(sm.count, 6); assert.deepEqual(sm.distribution, [0, 1, 1, 1, 2 + 1].map((x, i) => [0, 1, 1, 1, 3][i]));
  assert.equal(sm.avg, Math.round((5 + 5 + 2 + 4 + 3 + 5) / 6 * 100) / 100); assert.ok(sm.trend.length >= 1); assert.equal(sm.unhandledLow, 2);
  const low = sm.latest.find((x) => x.stars === 2); assert.equal((await T.api('PUT', '/feedback/' + low.id, { handled: true })).s, 200); assert.equal((await T.api('GET', '/feedback/summary')).j.unhandledLow, 1);
  // FB-05 CSV
  const csv = await fetch(S.base + T.u('/feedback/export.csv?token=' + T.admin)); const txt = await csv.text(); assert.equal(csv.status, 200); assert.ok(txt.includes('Stars') && txt.includes('ممتاز'));
  // FB-06 rate limit per IP in plus mode
  let limited = 0; for (let i = 0; i < 16; i++) { const r = await post({ stars: 4, table: 6, guestId: 'x' + i, visit: 'v9' }, '10.9.9.9'); if (r.j.limited) limited++; } assert.ok(limited >= 4, 'rate limit kicks in: ' + limited);
  // bad input + X-04 isolation (other tenant's admin cannot read this tenant's feedback) + X-09 unauthenticated admin endpoints
  assert.equal((await post({ stars: 9 })).s, 400);
  assert.equal((await S.J('GET', T.u('/feedback/summary'), null, B.admin)).s, 403);
  assert.equal((await S.J('GET', T.u('/feedback/summary'), null, null)).s, 401);
});
