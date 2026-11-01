const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F22 loyalty PIN and fresh visits [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { demo: true });
  const cfg = (await T.api('GET', '/config', null, null)).j, tb = cfg.tables[5];
  assert.equal((await T.api('POST', '/settings', { loyalty: { enabled: true } })).s, 200);
  const cap = await T.staff('captain', 'Wael', '4321');
  const mine = async (n) => Object.values((await T.state(cap)).sessions).find((x) => x.tableNumber === n);

  // a phone number alone never opens a card
  const a = T.guest(tb.number); await a.join();
  await a.call({ t: 'loyalty_join', phone: '01012345678', name: 'Sara' }); assert.ok(!(await mine(tb.number)).loyalty, 'no PIN: refused');
  await a.call({ t: 'loyalty_join', phone: '01012345678', pin: '12', name: 'Sara' }); assert.ok(!(await mine(tb.number)).loyalty, 'short PIN refused');
  await a.call({ t: 'loyalty_join', phone: '01012345678', pin: '4821', name: 'Sara' }); assert.ok((await mine(tb.number)).loyalty, 'new card with its own PIN');
  await a.call({ t: 'loyalty_leave' });

  // someone else who knows only the number is turned away and then locked out
  const b = T.guest(cfg.tables[6].number); await b.join();
  for (const p of ['0000', '1111', '2222', '3333', '4444']) await b.call({ t: 'loyalty_join', phone: '01012345678', pin: p });
  assert.ok(!(await mine(cfg.tables[6].number)).loyalty);
  await b.call({ t: 'loyalty_join', phone: '01012345678', pin: '4821' }); assert.ok(!(await mine(cfg.tables[6].number)).loyalty, 'locked even with the right PIN');
  assert.ok(!JSON.stringify(await T.state(cap)).includes('"pin"'), 'the PIN hash never reaches screens');

  // a returning device whose visit ended is not silently re-created
  const c = T.guest(cfg.tables[7].number); await c.join(); const old = c.g.guestId;
  await T.rpc('captain', cap, { t: 'close_table', tableId: cfg.tables[7].id, method: 'cash', pay: {} });
  const r = await S.J('POST', T.u('/rpc'), { join: { ...c.g, guestId: old, resume: true }, msg: null });
  assert.equal(r.s, 403); assert.equal(r.j.error, 'newsession', 'asked to start from the beginning');
});
