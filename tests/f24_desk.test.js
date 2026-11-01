const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F24 online desk page and switch [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true });
  const page = await fetch(S.base + `/r/${T.slug}/desk`); assert.equal(page.status, 200); assert.match(await page.text(), /Online desk/);
  assert.equal((await T.api('POST', '/settings', { online: { enabled: true, pickup: true, desk: true } })).s, 200);
  assert.equal((await T.api('GET', '/config')).j.settings.online.desk, true);
  assert.equal((await T.api('POST', '/settings', { online: { enabled: true, pickup: true, desk: 'yes' } })).s, 200);
});
