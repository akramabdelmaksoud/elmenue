const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');

for (const mode of ['ws', 'rpc']) test(`F45 call from the table: guest calls, captain answers, owner sees the numbers [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true });
  const cap = await T.staff('captain', 'Wael', '73028461');
  const g = T.guest(15, 'Karim'); await g.join();
  assert.equal((await g.call({ t: 'request', type: 'waiter' })).s, 200);
  const sessOf = async () => Object.values((await T.state(cap)).sessions).find((x) => x.tableNumber === 15);
  let s = await sessOf(); const r = s.requests.find((x) => x.type === 'waiter');
  assert.ok(r && !r.done, 'the call reaches the captain screen');
  // the same call cannot be stacked while it is still open
  await g.call({ t: 'request', type: 'waiter' }); s = await sessOf(); assert.equal(s.requests.filter((x) => x.type === 'waiter').length, 1);
  assert.equal((await T.api('GET', '/calls')).j.today.n, 0, 'nothing answered yet');
  await new Promise((r) => setTimeout(r, 1200));
  await T.rpc('captain', cap, { t: 'resolve_request', tableId: s.tableId, id: r.id });
  s = await sessOf(); const done = s.requests.find((x) => x.id === r.id);
  assert.ok(done.done && done.doneBy === 'Wael' && done.doneAt >= done.at, 'the guest can see who answered');
  const c = (await T.api('GET', '/calls?days=7')).j;
  assert.equal(c.today.n, 1); assert.ok(c.today.maxSec >= 1 && c.today.avgSec >= 1, JSON.stringify(c.today)); assert.equal(c.list.length, 1);
  // answering twice does not count twice
  await T.rpc('captain', cap, { t: 'resolve_request', tableId: s.tableId, id: r.id });
  assert.equal((await T.api('GET', '/calls')).j.today.n, 1);
  // staff cannot read the owner's numbers, the escalation setting is bounded
  assert.equal((await S.J('GET', T.u('/calls'), undefined, cap)).s, 403);
  await T.api('POST', '/settings', { callEscalateMin: 999 }); assert.equal((await T.api('GET', '/calls')).j.escalateMin, 30);
  await T.api('POST', '/settings', { callEscalateMin: 0 }); assert.equal((await T.api('GET', '/calls')).j.escalateMin, 0);
});
