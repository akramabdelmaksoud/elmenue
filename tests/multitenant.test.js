const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { startServer } = require('./helpers');

// fetch() cannot override the Host header, so use http.request
const call = (srv, method, path, { host, body, token, headers = {} } = {}) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: '127.0.0.1', port: srv.port, method, path, headers: { ...(host ? { Host: host } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers } }, (res) => {
    let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch {} resolve({ status: res.statusCode, headers: res.headers, text: b, json }); });
  });
  req.on('error', reject); if (data) req.write(data); req.end();
});

test('multi-tenant: SINGLE_RESTAURANT=0, host routing, domains, TLS ask, headers, rate limit', async () => {
  const srv = await startServer({ SINGLE_RESTAURANT: '0', BASE_DOMAIN: 'elmenue.test', TLS_ASK_TOKEN: 'tok' });
  try {
    const h = await call(srv, 'GET', '/health'); assert.equal(h.status, 200); assert.equal(h.json.ok, true); assert.equal(h.json.storage, 'files');
    assert.equal(h.headers['x-content-type-options'], 'nosniff'); assert.ok(h.headers['content-security-policy-report-only']);
    assert.equal(h.headers['x-powered-by'], undefined);

    assert.equal((await call(srv, 'GET', '/super')).status, 200, '"0" must mean multi-restaurant mode');
    const login = await call(srv, 'POST', '/api/super/login', { body: { email: 'root@test.dev', password: 'rootpass1' } });
    const token = login.json.token; assert.ok(token);
    const mk = (b) => call(srv, 'POST', '/api/super/tenants', { token, body: { name: 'Cafe', email: 'o@cafe.com', ...b } });

    assert.equal((await mk({ slug: 'www' })).status, 400, 'reserved slug');
    assert.equal((await mk({ slug: 'cafe1', domain: 'not a domain' })).status, 400);
    assert.equal((await mk({ slug: 'cafe1', domain: 'x.elmenue.test' })).status, 400, 'our own names are not custom domains');
    const c1 = await mk({ slug: 'cafe1', domain: 'https://Menu.Cafe-One.com/' }); assert.equal(c1.status, 200, c1.text);
    assert.equal((await mk({ slug: 'cafe2', domain: 'menu.cafe-one.com' })).status, 409, 'domain already used');
    assert.equal((await mk({ slug: 'cafe2' })).status, 200);

    // pages are SERVED (not redirected) on the subdomain and on the custom domain
    for (const host of ['cafe1.elmenue.test', 'menu.cafe-one.com:3000']) {
      for (const p of ['/', '/captain', '/admin', '/kitchen', '/t/4?k=abc']) {
        const r = await call(srv, 'GET', p, { host }); assert.equal(r.status, 200, host + p); assert.ok(r.text.includes('<meta name="elm-slug" content="cafe1">'), host + p);
      }
    }
    // the API works on the restaurant's host through the same /api/r/<slug> paths
    const cfg = await call(srv, 'GET', '/api/r/cafe1/config', { host: 'cafe1.elmenue.test' }); assert.equal(cfg.status, 200); assert.ok(cfg.json.settings);

    // old URLs still work everywhere and carry no injected slug
    for (const host of [undefined, 'cafe1.elmenue.test']) {
      const r = await call(srv, 'GET', '/r/cafe1', { host }); assert.equal(r.status, 200); assert.ok(!r.text.includes('elm-slug"'));
      assert.equal((await call(srv, 'GET', '/r/cafe1/t/2?k=abc', { host })).status, 200);
    }
    assert.equal((await call(srv, 'GET', '/')).status, 200);                                  // platform landing on the base host
    assert.ok(!(await call(srv, 'GET', '/', { host: 'elmenue.test' })).text.includes('elm-slug"'));
    assert.equal((await call(srv, 'GET', '/', { host: 'ghost.elmenue.test' })).status, 404);  // unclaimed subdomain
    assert.equal((await call(srv, 'GET', '/super', { host: 'cafe1.elmenue.test' })).status, 404, 'platform console never on a restaurant host');

    // /info gives the QR base address
    const ar = await call(srv, 'POST', '/api/super/tenants/cafe1/impersonate', { token });
    const info = await call(srv, 'GET', '/api/r/cafe1/info', { token: ar.json.token }); assert.equal(info.status, 200); assert.ok(/^http/.test(info.json.base));

    // TLS ask: known hosts yes, strangers no, wrong token no, anything that came through the proxy no
    const ask = (d, q = '&token=tok', headers = {}) => call(srv, 'GET', '/internal/tls-ask?domain=' + d + q, { headers });
    assert.equal((await ask('cafe1.elmenue.test')).status, 200);
    assert.equal((await ask('menu.cafe-one.com')).status, 200);
    assert.equal((await ask('elmenue.test')).status, 200);
    assert.equal((await ask('evil.com')).status, 404);
    assert.equal((await ask('ghost.elmenue.test')).status, 404);
    assert.equal((await ask('cafe1.elmenue.test', '&token=nope')).status, 404);
    assert.equal((await ask('cafe1.elmenue.test', '&token=tok', { 'X-Forwarded-For': '1.2.3.4' })).status, 404);

    // changing/removing a domain takes effect immediately
    assert.equal((await call(srv, 'PUT', '/api/super/tenants/cafe1', { token, body: { domain: '' } })).status, 200);
    assert.equal((await ask('menu.cafe-one.com')).status, 404);

    // rate limit: the 13th sign-in attempt inside a minute is refused before any password hashing
    let last; for (let i = 0; i < 14; i++) last = await call(srv, 'POST', '/api/r/cafe2/login', { body: { role: 'admin', email: 'x@y.z', password: 'wrongwrong' } });
    assert.equal(last.status, 429); assert.ok(last.headers['retry-after']);
  } finally { await srv.stop(); }
});

test('production refuses unsafe multi-restaurant configuration', async () => {
  await assert.rejects(() => startServer({ NODE_ENV: 'production', SUPER_EMAIL: '', SUPER_PASSWORD: '', SECRET: '' }), /Unsafe production configuration/);
});

test('single-restaurant mode still works and keeps its clean URLs', async () => {
  const srv = await startServer({ SINGLE_RESTAURANT: '1', OWNER_EMAIL: 'o@cafe.com', OWNER_PASSWORD: 'secret12', RESTAURANT_NAME: 'Solo' });
  try {
    const r = await call(srv, 'GET', '/admin'); assert.equal(r.status, 302); assert.equal(r.headers.location, '/r/main/admin');
    assert.equal((await call(srv, 'GET', '/r/main/t/1')).status, 200);
    assert.equal((await call(srv, 'GET', '/super')).status, 404);
  } finally { await srv.stop(); }
});
