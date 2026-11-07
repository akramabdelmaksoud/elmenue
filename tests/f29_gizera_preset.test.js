const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F29 Gizera branded showroom preset [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const mk = (slug, preset) => S.J('POST', '/api/super/tenants', { name: 'Gizera Cafe', slug, email: `o@${slug}.com`, password: 'secret123', plan: 'vip', demo: true, preset }, S.sup);
  const a = await mk('gizeratest', 'gizera'); assert.equal(a.s, 200);
  const cfg = (await S.J('GET', '/api/r/gizeratest/config')).j;
  assert.equal(cfg.settings.name_ar, 'كافيه الجزيرة'); assert.equal(cfg.settings.logo, '/demo/gizera/logo.png'); assert.equal(cfg.settings.tax, 0);
  assert.ok(cfg.items.length > 100 && cfg.categories.length === 15);
  assert.ok(cfg.items.some((i) => i.name === 'Alfredo Pasta' && i.price === 124));
  // passwordless prospect access: info + role tokens, only for the flagged café
  const info = await S.J('GET', '/api/prospect/info?slug=gizeratest'); assert.equal(info.s, 200); assert.equal(info.j.name_ar, 'كافيه الجزيرة'); assert.ok(info.j.tables.length);
  const own = await S.J('POST', '/api/prospect/login', { slug: 'gizeratest', role: 'admin' }); assert.equal(own.s, 200);
  assert.equal((await S.J('GET', '/api/r/gizeratest/stats', undefined, own.j.token)).s < 500, true);
  assert.equal((await S.J('POST', '/api/r/gizeratest/staff', { name: 'x', role: 'captain', pin: '9999' }, own.j.token)).s, 403, 'staff changes stay blocked in the demo');
  const kit = await S.J('POST', '/api/prospect/login', { slug: 'gizeratest', role: 'kitchen' }); assert.equal(kit.s, 200); assert.equal((await S.J('POST', '/api/prospect/login', { slug: 'gizeratest', role: 'super' })).s, 400);
  assert.equal((await S.J('GET', '/p/gizeratest')).s, 200);
  // an unknown preset is ignored: normal showroom
  const b = await mk('gizeraplain', 'evil'); assert.equal(b.s, 200);
  assert.equal((await S.J('GET', '/api/r/gizeraplain/config')).j.settings.name_ar, 'ميزون أوريليا');
  assert.equal((await S.J('GET', '/api/prospect/info?slug=gizeraplain')).s, 404, 'ordinary cafés never open without a password');
  assert.equal((await S.J('POST', '/api/prospect/login', { slug: 'gizeraplain', role: 'admin' })).s, 404);
});
