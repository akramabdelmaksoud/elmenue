const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { start } = require('./helper');

test('F46 launch basics: favicon, robots, sitemap, legal pages carry the brand', async (t) => {
  const S = await start('ws'); t.after(() => S.stop());
  const fav = await fetch(S.base + '/favicon.ico'); assert.equal(fav.status, 200); assert.match(fav.headers.get('content-type'), /png/);
  const rob = await (await fetch(S.base + '/robots.txt')).text(); assert.match(rob, /User-agent: \*/); assert.match(rob, /Disallow: \//, 'app hosts are closed to search engines');
  assert.equal((await fetch(S.base + '/sitemap.xml')).status, 404, 'only the marketing site has a sitemap');
  for (const f of ['privacy', 'terms']) { const h = fs.readFileSync(path.join(__dirname, '..', 'public', f + '.html'), 'utf8'); assert.ok(!/elmenue/i.test(h), f + ' must use the TableTab name'); assert.ok(!/\[(PRIVACY EMAIL|CONTACT EMAIL|HOSTING PROVIDER|DATABASE PROVIDER|DATE)\]/.test(h), f + ' has no placeholder we can fill ourselves'); }
});

test('F46 the guest page falls back to polling at once on hosts without websockets', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared.js'), 'utf8');
  assert.match(s, /tt:nows/); assert.match(s, /if \(noWs && !everOpened\) return fallback\(\)/);
});
