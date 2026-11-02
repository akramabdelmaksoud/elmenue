const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const basic = (u, p) => ({ Authorization: 'Basic ' + Buffer.from(u + ':' + p).toString('base64') });
test('F38 the showroom asks for a user name and password; other cafés are untouched', async (t) => {
  const S = await start('rpc', { env: { SHOWROOM_USER: 'ShowUser1', SHOWROOM_PASS: 'ShowPass-test-1' } }); t.after(() => S.stop());
  const get = (p, h) => fetch(S.base + p, { headers: h || {} });
  for (const p of ['/demo', '/api/demo/info', '/r/showroom/captain', '/api/r/showroom/config', '/r/showroom/order?car=1']) {
    const r = await get(p); assert.equal(r.status, 401, p + ' needs the password'); assert.match(r.headers.get('www-authenticate') || '', /Basic/);
  }
  const post = await fetch(S.base + '/api/demo/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"role":"admin"}' }); assert.equal(post.status, 401, 'no token without the password');
  assert.equal((await get('/demo', basic('ShowUser1', 'wrong'))).status, 401); assert.equal((await get('/demo', basic('showuser1', 'ShowPass-test-1'))).status, 401, 'user name is exact');
  assert.equal((await get('/demo', basic('ShowUser1', 'ShowPass-test-1'))).status, 200);
  const info = await get('/api/demo/info', basic('ShowUser1', 'ShowPass-test-1')); assert.equal(info.status, 200); assert.equal((await info.json()).slug, 'showroom');
  assert.equal((await get('/health')).status, 200, 'health stays open');
  const T = await S.tenant('operations'); assert.equal((await get(`/r/${T.slug}/captain`)).status, 200, 'real cafés are not asked');
  // guessing is stopped
  let r; for (let i = 0; i < 12; i++) r = await get('/demo', { ...basic('ShowUser1', 'g' + i), 'X-Forwarded-For': '10.4.4.4' });
  assert.equal(r.status, 429); assert.equal((await get('/demo', { ...basic('ShowUser1', 'ShowPass-test-1'), 'X-Forwarded-For': '10.4.4.4' })).status, 429, 'the right password waits too');
});
test('F38 without the secret set the showroom stays open (local and tests)', async (t) => {
  const S = await start('rpc'); t.after(() => S.stop());
  assert.equal((await fetch(S.base + '/api/demo/info')).status, 200);
});
