const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const fs = require('node:fs'), path = require('node:path');
for (const mode of ['ws', 'rpc']) test(`F6 plan limits [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const B = await S.tenant('basic'), O = await S.tenant('operations'), V = await S.tenant('vip');
  // New cafes start with sample tables trimmed to their plan (basic = 10). To get a cafe that is OVER its limit, raise the limit, add tables, lower it again.
  assert.equal((await B.api('GET', '/account')).j.usage.tables, 10, 'sample tables are capped at the plan limit');
  assert.equal((await S.J('PUT', `/api/super/tenants/${B.slug}`, { limits: { tables: 18 } }, S.sup)).s, 200);
  for (let i = 0; i < 8; i++) assert.equal((await B.api('POST', '/tables', {})).s, 200);
  assert.equal((await S.J('PUT', `/api/super/tenants/${B.slug}`, { limits: { tables: '' } }, S.sup)).s, 200);
  // LIM-01 new table blocked at the limit (basic = 10; this cafe has 18, so it is already over -> grandfathered)
  const over = await B.api('POST', '/tables', {});
  assert.equal(over.s, 402); assert.equal(over.j.kind, 'tables'); assert.equal(over.j.limit, 10); assert.equal(over.j.upgrade, 'operations');
  // LIM-03 existing over-limit tenant keeps everything: tables, layout save, guests, ordering path untouched
  const tabs = (await B.api('GET', '/account')).j; assert.equal(tabs.usage.tables, 18); assert.ok(tabs.usage.tables > tabs.limits.tables);
  assert.equal((await B.guest(3).join()).s, 200);
  // operations: 30 tables; seed 18 -> can add 12, then blocked
  for (let i = 0; i < 12; i++) assert.equal((await O.api('POST', '/tables', {})).s, 200, 'add table ' + i);
  const full = await O.api('POST', '/tables', {}); assert.equal(full.s, 402); assert.equal(full.j.limit, 30); assert.equal(full.j.upgrade, 'vip');
  // LIM-02 staff: operations 10
  for (let i = 0; i < 10; i++) assert.equal((await O.api('POST', '/staff', { name: 'S' + i, role: 'captain', pin: String(200000 + i * 7) })).s, 200);
  const sf = await O.api('POST', '/staff', { name: 'X', role: 'captain', pin: '99999999' }); assert.equal(sf.s, 402); assert.equal(sf.j.kind, 'staff');
  // basic has no staff feature/limit 0
  assert.equal((await B.api('POST', '/staff', { name: 'X', role: 'captain', pin: '99999999' })).s, 402);
  // vip: unlimited tables and staff
  for (let i = 0; i < 3; i++) assert.equal((await V.api('POST', '/tables', {})).s, 200);
  assert.equal((await V.api('POST', '/staff', { name: 'A', role: 'captain', pin: '33333333' })).s, 200);
  assert.equal((await V.api('GET', '/account')).j.limits.tables, null);
  // LIM-04 tier change updates limits immediately
  assert.equal((await S.J('PUT', `/api/super/tenants/${O.slug}`, { plan: 'vip' }, S.sup)).s, 200);
  assert.equal((await O.api('POST', '/tables', {})).s, 200); assert.equal((await O.api('GET', '/account')).j.limits.tables, null);
  // LIM-05 super override
  assert.equal((await S.J('PUT', `/api/super/tenants/${B.slug}`, { limits: { tables: 50 } }, S.sup)).s, 200);
  assert.equal((await B.api('POST', '/tables', {})).s, 200, 'override lifts the limit');
  const ov = await S.J('GET', '/api/super/overview', null, S.sup); const row = ov.j.tenants.find((x) => x.slug === B.slug);
  assert.equal(row.limits.tables, 50); assert.ok(row.staffCount >= 0); // LIM-07 usage visible in /super
  // X-04 isolation: a token for tenant V cannot change tenant O's limits or tables
  assert.equal((await S.J('POST', `/api/r/${O.slug}/tables`, {}, V.admin)).s, 403);
  assert.equal((await S.J('PUT', `/api/super/tenants/${O.slug}`, { limits: { tables: 1 } }, V.admin)).s, 401);
  // branches: vip allows 3 in a group, 4th blocked
  const mk = (n, plan) => S.J('POST', '/api/super/tenants', { name: n, slug: n, plan, email: n + '@x.dev', password: 'Pass12345', group: 'grp' + mode }, S.sup);
  for (const n of ['bra' + mode, 'brb' + mode, 'brc' + mode]) assert.equal((await mk(n, 'vip')).s, 200);
  const b4 = await mk('brd' + mode, 'vip'); assert.equal(b4.s, 402); assert.equal(b4.j.kind, 'branches');
  assert.equal((await S.J('POST', '/api/super/tenants', { name: 'solo', slug: 'solo' + mode, plan: 'basic', email: 's@x.dev', password: 'Pass12345', group: 'g2' + mode }, S.sup)).s, 200);
  assert.equal((await S.J('POST', '/api/super/tenants', { name: 'solo2', slug: 'solob' + mode, plan: 'basic', email: 's2@x.dev', password: 'Pass12345', group: 'g2' + mode }, S.sup)).s, 402);
});
test('F6 legacy plan names map', () => {
  const F = require('../features');
  for (const [old, now] of [['standard', 'operations'], ['pro', 'vip'], ['enterprise', 'vip'], ['demo', 'vip']]) assert.deepEqual(F.limitsOf(old), F.limitsOf(now), old);
  assert.equal(F.limitsOf('???').tables, 30);
});
