const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`smoke [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { demo: true });
  const cap = await T.staff('captain', 'Wael', '43214321');
  const st = await T.state(cap);
  assert.ok(st.config.items.length > 10 && Object.keys(st.sessions).length > 0);
  const g = T.guest(15); const r = await g.join(); assert.equal(r.s, 200);
});
