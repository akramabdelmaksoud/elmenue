const test = require('node:test');
const assert = require('node:assert');
const { normalizeDomain, createHostIndex } = require('../hosts');

test('normalizeDomain', () => {
  assert.equal(normalizeDomain('HTTPS://Menu.Cafe.com:443/x?y'), 'menu.cafe.com');
  assert.equal(normalizeDomain(''), ''); assert.equal(normalizeDomain(null), '');
  for (const bad of ['bad_host', 'nodot', 'a..b.com', '-x.com', 'http://', 'x.c']) assert.equal(normalizeDomain(bad), null, bad);
});

test('host index: subdomains, custom domains, reserved names, tls known()', async () => {
  let loads = 0;
  const idx = createHostIndex({ base: 'elmenue.com', ttlMs: 60000, load: async () => { loads++; return [{ slug: 'cafe1', domain: 'Menu.Cafe.com' }, { slug: 'cafe2' }]; } });
  assert.deepEqual(await idx.resolve('cafe1.elmenue.com'), { slug: 'cafe1' });
  assert.deepEqual(await idx.resolve('menu.cafe.com'), { slug: 'cafe1' });
  assert.deepEqual(await idx.resolve('ghost.elmenue.com'), { unknown: true });
  assert.equal(await idx.resolve('elmenue.com'), null);                 // the platform itself
  assert.equal(await idx.resolve('www.elmenue.com'), null);             // reserved
  assert.equal(await idx.resolve('a.b.elmenue.com'), null);             // only one label
  assert.equal(await idx.resolve('other.com'), null);
  assert.equal(await idx.resolve('localhost'), null);
  assert.equal(loads, 1, 'cached');
  assert.equal(await idx.known('cafe2.elmenue.com'), true);
  assert.equal(await idx.known('menu.cafe.com'), true);
  assert.equal(await idx.known('elmenue.com'), true);
  assert.equal(await idx.known('ghost.elmenue.com'), false);
  assert.equal(await idx.known('evil.com'), false);
  assert.equal(await idx.known('1.2.3.4'), false);
  idx.clear(); await idx.resolve('cafe1.elmenue.com'); assert.equal(loads, 2);
});
