const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const basic = (u, p) => ({ Authorization: 'Basic ' + Buffer.from(u + ':' + p).toString('base64') });
test('F38 the showroom asks for a user name and password; other cafés are untouched', async (t) => {
  const S = await start('rpc', { env: { SHOWROOM_USER: 'ShowUser1', SHOWROOM_PASS: 'ShowPass-test-1' } }); t.after(() => S.stop());
  const get = (p, h) => fetch(S.base + p, { headers: h || {} });
  for (const p of ['/demo', '/api/demo/info', '/r/showroom/captain', '/api/r/showroom/config', '/r/showroom/order?car=1']) {
    const r = await get(p); assert.equal(r.status, 401, p + ' needs the password'); assert.equal(r.headers.get('www-authenticate'), null, 'no plain browser box');
  }
  const post = await fetch(S.base + '/api/demo/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"role":"admin"}' }); assert.equal(post.status, 401, 'no token without the password');
  assert.equal((await get('/demo', basic('ShowUser1', 'wrong'))).status, 401); assert.equal((await get('/demo', basic('showuser1', 'ShowPass-test-1'))).status, 401, 'user name is exact');
  assert.equal((await get('/demo', basic('ShowUser1', 'ShowPass-test-1'))).status, 200);
  const info = await get('/api/demo/info', basic('ShowUser1', 'ShowPass-test-1')); assert.equal(info.status, 200); assert.equal((await info.json()).slug, 'showroom');
  assert.equal((await get('/health')).status, 200, 'health stays open');
  const T = await S.tenant('operations'); assert.equal((await get(`/r/${T.slug}/captain`)).status, 200, 'real cafés are not asked');
  // the sign-in page: a browser gets the styled page, scripts get a plain 401, and the right password sets a cookie that opens everything
  const pg = await get('/demo', { Accept: 'text/html' }); assert.equal(pg.status, 401); const html = await pg.text(); assert.match(html, /tt-fx\.js/); assert.match(html, /\/api\/demo\/gate/);
  assert.equal((await get('/tt-theme.css')).status, 200, 'the sign-in page can load its style');
  const J = (b) => fetch(S.base + '/api/demo/gate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.5.5.5' }, body: JSON.stringify(b) });
  assert.equal((await J({ user: 'ShowUser1', pass: 'nope' })).status, 401);
  const ok = await J({ user: 'ShowUser1', pass: 'ShowPass-test-1' }); assert.equal(ok.status, 200); const ck = ok.headers.get('set-cookie'); assert.match(ck, /ttgate=\d+\./); assert.match(ck, /HttpOnly/);
  const cookie = ck.split(';')[0];
  assert.equal((await get('/api/demo/info', { Cookie: cookie })).status, 200); assert.equal((await get('/r/showroom/captain', { Cookie: cookie, Accept: 'text/html' })).status, 200);
  assert.equal((await get('/api/demo/info', { Cookie: cookie.slice(0, -3) + 'abc' })).status, 401, 'a tampered cookie is refused');
  // guessing is stopped
  let r; for (let i = 0; i < 12; i++) r = await get('/demo', { ...basic('ShowUser1', 'g' + i), 'X-Forwarded-For': '10.4.4.4' });
  assert.equal(r.status, 429); assert.equal((await get('/demo', { ...basic('ShowUser1', 'ShowPass-test-1'), 'X-Forwarded-For': '10.4.4.4' })).status, 429, 'the right password waits too');
});
test('F38 without the secret set the showroom stays open (local and tests)', async (t) => {
  const S = await start('rpc'); t.after(() => S.stop());
  assert.equal((await fetch(S.base + '/api/demo/info')).status, 200);
});
