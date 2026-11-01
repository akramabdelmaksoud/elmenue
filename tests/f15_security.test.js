const test = require('node:test'), assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { start } = require('./helper');

for (const mode of ['ws', 'rpc']) test(`F15 input safety and access control [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { demo: true }), B = await S.tenant('operations');
  const raw = (path, body, headers = {}, method = 'POST') => fetch(S.base + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body });

  // malformed / non-object JSON is a 400, never a 500
  for (const body of ['{"a":', '"str"', '123', '[1,2']) assert.equal((await raw(T.u('/settings'), body, { Authorization: 'Bearer ' + T.admin })).status, 400, body);
  // oversized body is refused (413), server stays up
  assert.equal((await raw(T.u('/settings'), JSON.stringify({ name: 'x'.repeat(3 * 1024 * 1024) }), { Authorization: 'Bearer ' + T.admin })).status, 413);
  assert.equal((await S.J('GET', '/health')).s, 200);

  // anonymous and cross-tenant callers cannot use admin routes
  for (const [m, p] of [['GET', '/orders'], ['GET', '/staff'], ['POST', '/settings'], ['GET', '/export.json'], ['GET', '/account'], ['GET', '/insights'], ['POST', '/menu/import']]) {
    assert.ok([401, 403].includes((await S.J(m, T.u(p), m === 'GET' ? undefined : {}, null)).s), `anon ${m} ${p}`);
    assert.ok([401, 403].includes((await S.J(m, T.u(p), m === 'GET' ? undefined : {}, B.admin)).s), `cross-tenant ${m} ${p}`);
  }
  // tampered / garbage tokens
  const parts = T.admin.split('.');
  for (const tok of ['', 'x', parts[0] + '.AAAA', 'AAAA.' + parts[1], T.admin.slice(0, -2) + 'zz']) assert.ok([401, 403].includes((await S.J('GET', T.u('/staff'), undefined, tok)).s), 'bad token ' + tok.slice(0, 8));

  // prototype pollution attempts do nothing
  await raw(T.u('/settings'), '{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"p2":1}}}', { Authorization: 'Bearer ' + T.admin });
  assert.equal(({}).polluted, undefined); assert.equal((await S.J('GET', '/health')).s, 200);

  // menu import: size cap, binary junk, row cap, field caps, prices clamped
  const post = async (buf, name = 'm.xlsx') => { const fd = new FormData(); fd.append('file', new Blob([buf]), name); const r = await fetch(S.base + T.u('/menu/import'), { method: 'POST', headers: { Authorization: 'Bearer ' + T.admin }, body: fd }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  assert.equal((await post(Buffer.alloc(1100 * 1024, 65))).s, 413);
  assert.equal((await post(Buffer.from([0, 1, 2, 3, 4, 5]))).s, 400);
  const rows = Array.from({ length: 700 }, (_, i) => ({ name: 'Item' + i + 'x'.repeat(200), category: 'Imp', price: i === 0 ? 1e12 : i, description: 'd'.repeat(500) }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Menu');
  const ok = await post(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })); assert.equal(ok.s, 200); assert.equal(ok.j.added, 500);
  const items = (await T.api('GET', '/config', null, null)).j.items.filter((i) => /^Item\d/.test(i.name));
  assert.ok(items.every((i) => i.name.length <= 60 && i.price <= 100000 && String(i.desc).length <= 140), 'fields clamped');

  // public showroom admin token cannot upload, call AI, or change staff / payments
  const sr = await S.J('POST', '/api/demo/login', { role: 'admin' });
  if (sr.s === 200) {
    for (const [m, p] of [['POST', '/staff'], ['POST', '/pay/config'], ['POST', '/copilot'], ['POST', '/insights/ai'], ['POST', '/hero-image'], ['POST', '/account']]) assert.equal((await S.J(m, `/api/r/showroom${p}`, {}, sr.j.token)).s, 403, 'showroom ' + p);
  }
  // super console exists only on admin.<ROOT_DOMAIN>
  const R2 = await start('ws', { env: { ROOT_DOMAIN: 'example-tt.test' } }); t.after(() => R2.stop());
  // fetch() cannot override Host, so use http.request
  const host = (h, p) => new Promise((res, rej) => require('node:http').get({ host: '127.0.0.1', port: R2.port, path: p, headers: { Host: h } }, (r) => { r.resume(); res(r.statusCode); }).on('error', rej));
  assert.equal(await host('admin.example-tt.test', '/super'), 200);
  for (const h of ['example-tt.test', 'www.example-tt.test', 'app.example-tt.test', 'demo.example-tt.test', 'other.test']) { assert.equal(await host(h, '/super'), 404, h); assert.equal(await host(h, '/api/super/overview'), 404, h); }
});
