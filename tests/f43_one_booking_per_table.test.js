const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F43 one booking per table [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations');
  const cap = await T.staff('captain', 'Wael', '4321'), c = (await T.api('GET', '/config', null, null)).j, tb = c.tables[1], at = Date.now() + 3 * 3600000;
  const add = (m) => T.rpc('captain', cap, { t: 'res_add', tableId: tb.id, name: 'Sara', guests: 2, at, ...m });
  const mine = async () => ((await T.state(cap)).config.reservations || []).filter((r) => r.tableId === tb.id);

  assert.equal((await add()).s, 200); assert.equal((await mine()).length, 1);
  // same table, overlapping time: refused with a reason, nothing saved
  const r = await add({ name: 'Omar', at: at + 30 * 60000 });
  assert.ok((r.j.notices || []).some((n) => /already reserved for Sara/.test(n)), 'staff are told why');
  assert.equal((await mine()).length, 1);
  // later the same evening (2+ hours apart) is fine, and another table is fine
  await add({ name: 'Late', at: at + 3 * 3600000 }); assert.equal((await mine()).length, 2);
  await T.rpc('captain', cap, { t: 'res_add', tableId: c.tables[2].id, name: 'Other', guests: 2, at });
  assert.ok(((await T.state(cap)).config.reservations || []).some((x) => x.name === 'Other'));
  // a table with guests at it cannot be booked for now
  await T.rpc('captain', cap, { t: 'seat_table', tableId: c.tables[3].id });
  const busy = await T.rpc('captain', cap, { t: 'res_add', tableId: c.tables[3].id, name: 'Now', guests: 2, at: Date.now() + 10 * 60000 });
  assert.ok((busy.j.notices || []).some((n) => /has guests now/.test(n)));
});
