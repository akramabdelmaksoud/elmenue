const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.011, `${m}: ${a} vs ${b}`);
for (const mode of ['ws', 'rpc']) test(`F8 shifts X/Z [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true });
  const C = await T.staff('cashier', 'Mona', '7788');
  const sh = (m, p, b) => T.api(m, p, b, C);
  assert.equal((await sh('GET', '/shift/x')).s, 400, 'X without open shift');
  // SHF-01 open with float
  const o = await sh('POST', '/shift/open', { float: 200 }); assert.equal(o.s, 200); assert.equal(o.j.cur.float, 200);
  assert.equal((await sh('POST', '/shift/open', { float: 1 })).s, 400);
  // SHF-02 cash in / out with reasons
  assert.equal((await sh('POST', '/shift/move', { kind: 'out', amount: 30 })).s, 400, 'out needs a reason');
  assert.equal((await sh('POST', '/shift/move', { kind: 'out', amount: 30, note: 'ice' })).s, 200);
  assert.equal((await sh('POST', '/shift/move', { kind: 'in', amount: 10, note: 'change from bank' })).s, 200);
  const pay = (tid, method, p) => T.rpc('cashier', C, { t: 'close_table', tableId: tid, method, pay: p });
  let st = (await T.rpc('cashier', C, null)).j.state; const open = () => Object.values(st.sessions).filter((s) => s.orders.length);
  const [a, b, c] = open();
  // a: cash, b: card with tip, c: unpaid clear
  const ra = await pay(a.tableId, 'cash', { tip: 0, tendered: 5000 }); const rb = await pay(b.tableId, 'card', { tip: 20 }); const rc = await T.rpc('cashier', C, { t: 'close_table', tableId: c.tableId, unpaid: true });
  assert.equal(ra.s, 200); assert.equal(rb.s, 200); assert.equal(rc.s, 200);
  // SHF-03 X report does not close, totals correct
  const x = (await sh('GET', '/shift/x')).j.x;
  assert.equal(x.sales, 2); assert.equal(x.unpaidClears, 1, 'unpaid clear excluded from revenue');
  near(x.byMethod.cash, a.bill.total, 'cash method'); near(x.byMethod.card, b.bill.total + 20, 'card method incl tip');
  near(x.total, a.bill.total + b.bill.total + 20, 'total = sum of sessions');
  near(x.expected, 200 - 30 + 10 + a.bill.total, 'expected drawer cash');
  assert.ok((await sh('GET', '/shift')).j.cur, 'still open after X');
  // SHF-06 closing with open tables warns and lists them
  const w = await sh('POST', '/shift/close', { counted: 0 }); assert.equal(w.s, 409); assert.ok(w.j.warn && w.j.openTables.length >= 3);
  assert.ok((await sh('GET', '/shift')).j.cur, 'warning did not close it');
  // SHF-05 variance, SHF-04 totals, SHF-08 Z number
  const counted = +(x.expected - 7.5).toFixed(2);
  const z = await sh('POST', '/shift/close', { counted, force: true }); assert.equal(z.s, 200);
  assert.equal(z.j.z.number, 1); near(z.j.z.variance, -7.5, 'variance'); near(z.j.z.total, x.total, 'Z total = X total');
  assert.equal(z.j.z.closedBy, 'Mona'); assert.equal(z.j.z.by, 'Mona'); assert.ok(z.j.z.itemsSold.length > 0 && z.j.z.kinds.table.count === 2);
  assert.equal((await sh('POST', '/shift/close', { counted: 1 })).s, 400, 'cannot close twice');
  // second shift gets Z 2 (no repeat / skip)
  await sh('POST', '/shift/open', { float: 100 }); const z2 = await sh('POST', '/shift/close', { counted: 100, force: true }); assert.equal(z2.j.z.number, 2);
  // SHF-07 immutable: no endpoint edits a closed shift; stored list unchanged
  assert.equal((await sh('PUT', '/shift/z/1', { counted: 0 })).s, 404);
  const list = (await T.api('GET', '/shifts')).j.list; assert.deepEqual(list.map((x) => x.number), [2, 1]); near(list[1].variance, -7.5, 'Z1 untouched');
  // SHF-09 export
  const ex = await fetch(S.base + T.u('/shifts/export.csv'), { headers: { Authorization: 'Bearer ' + T.admin } }); const text = await ex.text();
  assert.equal(ex.status, 200); assert.ok(text.includes('Z no') && text.split('\n').length >= 3);
  const ez = await fetch(S.base + T.u('/shift/z/1/export.csv'), { headers: { Authorization: 'Bearer ' + C } }); assert.equal(ez.status, 200); assert.ok((await ez.text()).includes('Items sold'));
  // X-04 isolation + staff-only
  const O = await S.tenant('operations'); assert.equal((await S.J('GET', O.u('/shift'), null, C)).s, 403);
  assert.equal((await S.J('GET', T.u('/shift'), null, null)).s, 401);
});
