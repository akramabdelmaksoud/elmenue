const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
test('F28 versioned assets are cached for a year, pages are never cached', async (t) => {
  const S = await start('rpc'); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true });
  const html = await (await fetch(S.base + `/r/${T.slug}/t/1`)).text(), m = html.match(/src="(\/shared\.js\?v=[0-9a-f]+)"/); assert.ok(m, 'scripts carry a build version');
  assert.ok(/href="\/shared\.css\?v=[0-9a-f]+"/.test(html));
  const a = await fetch(S.base + m[1]); assert.equal(a.status, 200); assert.match(a.headers.get('cache-control'), /immutable/); assert.match(a.headers.get('cache-control'), /31536000/);
  const plain = await fetch(S.base + '/shared.js'); assert.doesNotMatch(plain.headers.get('cache-control') || '', /immutable/, 'unversioned stays revalidated');
  const p = await fetch(S.base + `/r/${T.slug}/t/1`); assert.match(p.headers.get('cache-control'), /no-cache/);
  assert.equal(html.includes('?v=undefined'), false);
});
