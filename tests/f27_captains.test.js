const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F27 several captains on at once are kept apart [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), cfg = (await T.api('GET', '/config', null, null)).j;
  const item = cfg.items.find((i) => !i.soldOut && i.stock == null && i.price > 0 && !(i.options || []).some((o) => o.required));
  // two people cannot share a name (the reports would merge them)
  const a = await T.staff('captain', 'Ahmed', '11111111'), b = await T.staff('captain', 'Salma', '22222222');
  assert.equal((await T.api('POST', '/staff', { name: ' ahmed ', role: 'captain', pin: '33333333' })).s, 400);
  const cash = await T.staff('cashier', 'Mona', '66666666'); assert.equal((await S.J('POST', T.u('/shift/open'), { opening: 50 }, cash)).s, 200);

  // both are on shift at the same time; each serves a different table; the cashier closes both
  const served = {};
  for (const [name, tok, i] of [['Ahmed', a, 8], ['Salma', b, 9]]) {
    const tb = cfg.tables[i]; assert.equal((await T.rpc('captain', tok, { t: 'staff_order', tableId: tb.id, items: [{ itemId: item.id, qty: 2 }] })).s, 200);
    assert.equal((await T.rpc('cashier', cash, { t: 'close_table', tableId: tb.id, method: 'cash', pay: { tip: 0 } })).s, 200); served[name] = tb.number;
  }
  const att = (await T.api('GET', '/attendance?from=' + (Date.now() - 86400000) + '&to=' + (Date.now() + 60000))).j; assert.ok(att.here.some((x) => x.name === 'Ahmed') && att.here.some((x) => x.name === 'Salma'), 'both clocked in together');
  const ins = (await T.api('GET', '/insights?days=1')).j, by = (n) => ins.staff.find((s) => s.name === n);
  assert.ok(by('Ahmed').tables >= 1 && by('Salma').tables >= 1, 'each captain gets credit for the table they served, not the cashier');
  assert.ok(by('Ahmed').sales > 0 && by('Salma').sales > 0);
  const rep = (await T.api('GET', '/report?from=' + (Date.now() - 86400000) + '&to=' + (Date.now() + 60000))).j; assert.ok(rep.sessions >= 2 && rep.salesBy);

  // the shared legacy PIN can be turned off
  assert.equal((await S.J('POST', T.u('/login'), { role: 'captain', pin: T.pin })).s, 200);
  assert.equal((await T.api('POST', '/legacy-pin', { off: true })).s, 200);
  assert.equal((await S.J('POST', T.u('/login'), { role: 'captain', pin: T.pin })).s, 401);
});
