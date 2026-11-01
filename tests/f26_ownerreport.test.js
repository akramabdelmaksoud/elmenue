const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F26 owner report pack [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { demo: true }), B = await S.tenant('operations');
  assert.equal((await B.api('GET', '/ownerreport')).s, 402, 'VIP bundle by default');
  const r = (await T.api('GET', '/ownerreport?days=90')).j;
  assert.ok(r.ready && r.orders > 15, 'the demo café has history'); assert.ok(r.kpis.revenue > 0 && r.kpis.avgTicket > 0);
  assert.ok(Array.isArray(r.findings) && r.findings.length >= 3); for (const f of r.findings) { assert.ok(f.title && f.action && ['risk', 'opportunity', 'win'].includes(f.type)); assert.ok(!/NaN|undefined|Infinity/.test(JSON.stringify(f)), 'no broken numbers: ' + f.title); }
  assert.ok(r.decisions.length >= 1 && r.decisions.length <= 5); assert.ok(r.overall === null || (r.overall >= 0 && r.overall <= 100));
  assert.ok(!/NaN|undefined|Infinity/.test(JSON.stringify(r.kpis)));
  assert.equal((await S.J('GET', T.u('/ownerreport'))).s, 401, 'owner only');
  // advisor notes come from the platform owner and are cleaned
  assert.equal((await S.J('PUT', `/api/super/tenants/${T.slug}`, { advice: 'Raise <b>prices</b> on lattes.' }, S.sup)).s, 200);
  assert.equal((await T.api('GET', '/ownerreport')).j.advisor, 'Raise bprices/b on lattes.');
  // an empty café still produces an honest report
  const e = (await B.api('GET', '/ownerreport')); assert.equal(e.s, 402);
  const page = await fetch(S.base + `/r/${T.slug}/ownerreport`); assert.equal(page.status, 200);
});
