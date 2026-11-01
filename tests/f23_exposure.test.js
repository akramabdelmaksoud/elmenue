const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F23 nothing private leaks to the open web or the wrong role [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { demo: true });
  await T.api('POST', '/settings', { wifi: 'Cafe', wifiPass: 'secret-wifi-123', requireKey: true });
  const open = (await S.J('GET', T.u('/config'))).j; const txt = JSON.stringify(open);
  assert.ok(!txt.includes('secret-wifi-123'), 'wifi password is for seated guests only');
  assert.equal(open.settings.ai, undefined); assert.ok(!/"key"/.test(JSON.stringify(open.tables)), 'table keys never public');
  const adminCfg = (await T.api('GET', '/config')).j; assert.ok(JSON.stringify(adminCfg).includes('secret-wifi-123'), 'the owner still sees it');

  // staff screens never receive AI notes or fiscal details
  const cap = await T.staff('captain', 'Wael', '4321'), st = JSON.stringify((await T.state(cap)).config.settings);
  assert.ok(!/"ai":/.test(st));

  // guest ids are random, not a counter
  const tb = open.tables[2]; await T.api('POST', '/settings', { requireKey: false });
  const a = T.guest(tb.number), b = T.guest(open.tables[3].number); await a.join(); await b.join();
  assert.match(a.g.guestId, /^g[a-z0-9]{12}$/); const n = (x) => parseInt(x.slice(1), 36); assert.ok(Math.abs(n(a.g.guestId) - n(b.g.guestId)) > 1e6, 'not sequential');

  // guessing the table key from one connection gets throttled; guessing a guest id does not open the table
  await T.api('POST', '/settings', { requireKey: true });
  const g = open.tables[4]; let last;
  for (let i = 0; i < 20; i++) last = await S.J('POST', T.u('/rpc'), { join: { role: 'customer', tableNumber: g.number, name: 'x', key: 'guess' + i, guestId: 'g' + i }, msg: null });
  assert.equal(last.s, 429);
});
