// Polling mode (Vercel): the adaptive schedule and the "nothing changed" reply.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { startServer } = require('./helpers');

test('pollDelay: staff stay quick, idle guests back off, never faster than before', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared.js'), 'utf8');
  const m = /\/\*pollplan\*\/([\s\S]*?)\/\*endpollplan\*\//.exec(src); assert.ok(m, 'markers present');
  const ctx = {}; vm.createContext(ctx); vm.runInContext(m[1] + ';this.pollDelay = pollDelay;', ctx);
  const d = ctx.pollDelay;
  for (const role of ['customer', 'captain', 'cashier', 'kitchen']) {
    let prev = 0; for (const idle of [0, 5000, 20000, 60000, 600000]) { const v = d(role, idle); assert.ok(v >= prev, role + ' never speeds up while idle'); prev = v; }
  }
  assert.equal(d('captain', 0), 2000); assert.equal(d('cashier', 0), 2000); assert.equal(d('customer', 0), 2500); assert.equal(d('kitchen', 0), 2500);   // as fast as before right after activity
  assert.ok(d('captain', 600000) <= 4000, 'orders still reach the waiter within 4 s');
  assert.ok(d('kitchen', 600000) <= 5000 && d('customer', 600000) <= 6500);
  // average request rate over a quiet service vs the old fixed schedule
  assert.ok(2500 / d('customer', 600000) < 0.5, 'idle guests poll less than half as often');
});

test('rpc in stateless mode: unchanged state is answered with a tiny reply, a change gets the full state', async () => {
  const srv = await startServer({ STATELESS: '1', SAVE_DEBOUNCE_MS: '100' });
  const j = async (method, p, { token, body, raw } = {}) => { const r = await fetch(srv.base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); const text = await r.text(); return { status: r.status, text, json: raw ? null : (() => { try { return JSON.parse(text); } catch { return null; } })() }; };
  try {
    const su = (await j('POST', '/api/super/login', { body: { email: 'root@test.dev', password: 'rootpass1' } })).json.token;
    assert.equal((await j('POST', '/api/super/tenants', { token: su, body: { name: 'Poll', slug: 'poll1', email: 'o@p.com', plan: 'operations' } })).status, 200);
    const admin = (await j('POST', '/api/super/tenants/poll1/impersonate', { token: su })).json.token;
    const rpc = (etag, msg) => j('POST', '/api/r/poll1/rpc', { body: { join: { role: 'captain', token: admin }, msg: msg || null, since: 0, etag } });

    const first = await rpc(null); assert.equal(first.status, 200, first.text);
    assert.ok(first.json.state && first.json.etag, 'first reply carries the state and its fingerprint');
    const same = await rpc(first.json.etag); assert.equal(same.status, 200);
    assert.equal(same.json.same, 1); assert.equal(same.json.state, undefined);
    assert.ok(same.text.length < 200 && first.text.length > 2000, `tiny reply (${same.text.length} B) instead of the full state (${first.text.length} B)`);

    // a change in the restaurant changes the fingerprint, so the next poll returns the full state again
    const put = await j('POST', '/api/r/poll1/settings', { token: admin, body: { name: 'Poll Renamed' } }); assert.equal(put.status, 200, put.text);
    const changed = await rpc(first.json.etag); assert.equal(changed.json.same, undefined); assert.ok(changed.json.state); assert.notEqual(changed.json.etag, first.json.etag);

    // a request that carries an action is never answered with "same"
    const withMsg = await rpc(changed.json.etag, { t: 'sim', on: false }); assert.ok(withMsg.json.state || withMsg.status === 200);
    assert.equal(withMsg.json.same, undefined);
  } finally { await srv.stop(); }
});

test('host routing also works in stateless mode (restaurants come from storage)', async () => {
  const http = require('http');
  const srv = await startServer({ STATELESS: '1', BASE_DOMAIN: 'elmenue.test', SAVE_DEBOUNCE_MS: '100' });
  const get = (p, host) => new Promise((resolve, reject) => { http.get({ host: '127.0.0.1', port: srv.port, path: p, headers: { Host: host } }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, text: b })); }).on('error', reject); });
  try {
    const su = (await (await fetch(srv.base + '/api/super/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'root@test.dev', password: 'rootpass1' }) })).json()).token;
    const mk = await fetch(srv.base + '/api/super/tenants', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + su }, body: JSON.stringify({ name: 'S', slug: 'stl', email: 'o@s.com', domain: 'menu.stl-cafe.com' }) });
    assert.equal(mk.status, 200, await mk.text());
    for (const host of ['stl.elmenue.test', 'menu.stl-cafe.com']) { const r = await get('/t/3?k=x', host); assert.equal(r.status, 200, host); assert.ok(r.text.includes('<meta name="elm-slug" content="stl">'), host); }
    assert.equal((await get('/', 'nobody.elmenue.test')).status, 404);
    assert.equal((await get('/internal/tls-ask?domain=menu.stl-cafe.com', 'app:3000')).status, 200);
  } finally { await srv.stop(); }
});
