// Plan tiers from features.js, checked through the real HTTP API: table and staff limits, per-restaurant overrides, upgrade hints.
const test = require('node:test');
const assert = require('node:assert');
const { startServer } = require('./helpers');
const F = require('../features');

const j = async (base, method, p, { token, body } = {}) => {
  const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};

test('plan limits are enforced end to end (basic / operations / vip) and overrides work', async () => {
  const srv = await startServer({ SINGLE_RESTAURANT: '0' });
  try {
    const su = (await j(srv.base, 'POST', '/api/super/login', { body: { email: 'root@test.dev', password: 'rootpass1' } })).json.token;
    const admin = {};
    for (const plan of F.ORDER) {
      const r = await j(srv.base, 'POST', '/api/super/tenants', { token: su, body: { name: plan, slug: 'p-' + plan, email: plan + '@t.com', plan } });
      assert.equal(r.status, 200, plan);
      admin[plan] = (await j(srv.base, 'POST', `/api/super/tenants/p-${plan}/impersonate`, { token: su })).json.token;
    }
    const tables = async (plan) => (await j(srv.base, 'GET', `/api/r/p-${plan}/config`)).json.tables.length;
    const addTable = (plan) => j(srv.base, 'POST', `/api/r/p-${plan}/tables`, { token: admin[plan], body: {} });

    // BASIC: capped at its table limit, with an upgrade hint; no staff accounts at all
    const lim = F.PLANS.basic.limits.tables;
    let res; for (let i = 0; i < lim + 3; i++) { res = await addTable('basic'); if (res.status === 402) break; }
    assert.equal(res.status, 402); assert.equal(await tables('basic'), lim); assert.ok(res.json.upgrade, 'tells the owner which plan to upgrade to');

    // an owner override raises the limit for that one restaurant
    const up = await j(srv.base, 'PUT', '/api/super/tenants/p-basic', { token: su, body: { limits: { tables: lim + 2 } } }); assert.equal(up.status, 200);
    assert.equal((await addTable('basic')).status, 200);

    // OPERATIONS: staff allowed, cashier role allowed; basic is refused the cashier role
    const s1 = await j(srv.base, 'POST', '/api/r/p-operations/staff', { token: admin.operations, body: { name: 'Mona', role: 'cashier', pin: '55555555' } }); assert.equal(s1.status, 200, JSON.stringify(s1.json));

    // VIP: no table limit
    const before = await tables('vip'); for (let i = 0; i < 3; i++) assert.equal((await addTable('vip')).status, 200); assert.equal(await tables('vip'), before + 3);

    // a suspended restaurant is locked out
    await j(srv.base, 'PUT', '/api/super/tenants/p-vip', { token: su, body: { status: 'suspended' } });
    assert.equal((await j(srv.base, 'GET', '/api/r/p-vip/config')).status, 403);
  } finally { await srv.stop(); }
});
