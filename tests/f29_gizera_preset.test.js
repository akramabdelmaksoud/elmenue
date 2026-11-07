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

// the built-in showroom creates itself on the first visit: no console login, and it comes with sales history and live tables (not an empty café)
for (const mode of ['ws', 'rpc']) test(`F29 Gizera showroom self-creates with demo data [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  assert.equal((await S.J('GET', '/api/prospect/info?slug=nothere')).s, 404);
  const info = await S.J('GET', '/api/prospect/info?slug=gizera'); assert.equal(info.s, 200); assert.equal(info.j.name_ar, 'كافيه الجزيرة');
  const adm = (await S.J('POST', '/api/prospect/login', { slug: 'gizera', role: 'admin' })).j.token;
  const hist = await S.J('GET', '/api/r/gizera/orders?from=2000-01-01&to=2100-01-01', undefined, adm); assert.equal(hist.s, 200);
  const n = (hist.j.orders || []).length; assert.ok(n > 20, 'sample sales history, got ' + n);
  const cfg = (await S.J('GET', '/api/r/gizera/config')).j; assert.equal(cfg.items.length, 116);
});

// FRÍO: second built-in showroom, with real item options (sizes, milk, flavours) and its own brand
for (const mode of ['ws', 'rpc']) test(`F29 FRÍO showroom [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const info = await S.J('GET', '/api/prospect/info?slug=frio'); assert.equal(info.s, 200); assert.equal(info.j.name, 'FRÍO'); assert.ok(info.j.brand && info.j.brand.g);
  const cfg = (await S.J('GET', '/api/r/frio/config')).j;
  assert.ok(cfg.items.length > 35 && cfg.categories.length === 6);
  const lat = cfg.items.find((i) => i.name === 'Latte'); assert.equal(lat.price, 25); assert.ok(lat.options.some((o) => o.id === 'size' && o.choices.some((c) => c.price === 10)) && lat.options.some((o) => o.id === 'milk'));
  const adm = (await S.J('POST', '/api/prospect/login', { slug: 'frio', role: 'admin' })).j.token;
  assert.ok(((await S.J('GET', '/api/r/frio/orders?from=2000-01-01&to=2100-01-01', undefined, adm)).j.orders || []).length > 20);
  // a guest can order a customised drink and the price includes the option
  const sess = await S.J('POST', '/api/r/frio/join', { tableNumber: 1, name: 'T' }); assert.ok(sess.s < 500);
});

// every item has a photo, and an older build of a built-in showroom is rebuilt on the next visit
for (const mode of ['ws', 'rpc']) test(`F29 showroom photos and rebuild [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  for (const slug of ['gizera', 'frio']) {
    assert.equal((await S.J('GET', `/api/prospect/info?slug=${slug}`)).s, 200);
    const cfg = (await S.J('GET', `/api/r/${slug}/config`)).j;
    assert.ok(cfg.items.every((i) => /^\/demo\/(photos|gizera)\/[a-z]+\.jpg$/.test(i.img)), slug + ': every item has a photo');
    for (const i of cfg.items.slice(0, 200)) assert.equal((await fetch(S.base + i.img)).status, 200, i.img);
  }
});
