const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F12 insights API + captain log [${mode}]`, async (t) => {
  const S = await start(mode, { env: { ANTHROPIC_API_KEY: '' } }); t.after(() => S.stop());
  const T = await S.tenant('operations'), V = await S.tenant('vip'), B = await S.tenant('basic');
  // tier gating: basic has no insights; the AI narrative is the VIP "copilot" feature
  assert.equal((await B.api('GET', '/insights')).s, 402); assert.equal((await S.J('GET', T.u('/insights'), null, null)).s, 401);
  assert.equal((await T.api('POST', '/insights/ai', { lang: 'en' })).s, 402);
  // a real captain does real work: every action lands in that captain's hourly log
  const cap = await T.staff('captain', 'Wael', '43214321'), item = (await T.api('GET', '/config', null, null)).j.items.find((i) => !i.soldOut && i.stock == null), tb = (await T.api('GET', '/config', null, null)).j.tables[0];
  await T.rpc('captain', cap, { t: 'staff_order', tableId: tb.id, items: [{ itemId: item.id, qty: 2 }] });
  const st = await T.state(cap), ses = Object.values(st.sessions).find((x) => x.tableId === tb.id), oid = ses.orders[0].id;
  await T.rpc('captain', cap, { t: 'order_status', orderId: oid, status: 'kitchen' }); await T.rpc('captain', cap, { t: 'order_status', orderId: oid, status: 'served' });
  await T.rpc('captain', cap, { t: 'close_table', tableId: tb.id, method: 'cash', pay: { tendered: 9999 } });
  const r = (await T.api('GET', '/insights?days=7')).j, me = r.staff.find((s) => s.name === 'Wael');
  assert.ok(me, 'captain appears in insights'); assert.equal(me.counts.taken, 1); assert.equal(me.counts.started, 1); assert.equal(me.counts.served, 1); assert.equal(me.counts.closed, 1);
  assert.equal(me.total, 4); assert.equal(me.tables, 1); assert.ok(me.sales > 0, 'sales attributed to the captain who closed the table'); assert.equal(me.profile.reduce((a, b) => a + b, 0), 4); assert.equal(me.events.length, 4);
  assert.equal(r.ready, false); assert.equal(r.suggestions[0].id, 'few-data', 'honest: one order is not enough data'); assert.equal(r.ai.available, false);
  // the "log file": one CSV row per captain per active hour, in local time, with a readable header
  const csv = await (await fetch(S.base + T.u('/insights/staff.csv?days=7&token=' + T.admin))).text();
  assert.ok(csv.includes('Orders taken') && /"Wael",1,0,1,1,1/.test(csv), csv);
  // the log is private to this venue
  assert.equal((await S.J('GET', T.u('/insights'), null, B.admin)).s, 403);
  // AI narrative without an API key: falls back to the rule-based summary, never fails
  const ai = await V.api('POST', '/insights/ai', { lang: 'ar' }); assert.equal(ai.s, 200); assert.equal(ai.j.ai, false); assert.ok(ai.j.text.length > 10);
});
