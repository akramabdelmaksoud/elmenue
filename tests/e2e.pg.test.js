// End to end with the REAL server on a REAL Postgres: create a restaurant, upload an image, restart, everything is still there;
// then 30 live guests on one restaurant (the load-test tool itself).
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { startPg, startServer } = require('./helpers');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const j = async (base, method, p, { token, body } = {}) => {
  const r = await fetch(base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null), res: r };
};

test('server on Postgres: tenants and images survive a restart; 30 guests load test', async () => {
  const pg = await startPg();
  const env = { DATABASE_URL: pg.url, PGSSL: 'off', SINGLE_RESTAURANT: '0' };
  let srv = await startServer(env);
  try {
    assert.equal((await j(srv.base, 'GET', '/health')).json.storage, 'postgres');
    const token = (await j(srv.base, 'POST', '/api/super/login', { body: { email: 'root@test.dev', password: 'rootpass1' } })).json.token;
    const made = await j(srv.base, 'POST', '/api/super/tenants', { token, body: { name: 'Pg Cafe', slug: 'pgcafe', email: 'o@pg.com', password: 'secret12', demo: true } });
    assert.equal(made.status, 200, JSON.stringify(made.json));
    const admin = (await j(srv.base, 'POST', '/api/super/tenants/pgcafe/impersonate', { token })).json.token;
    const cfg = (await j(srv.base, 'GET', '/api/r/pgcafe/config')).json;
    const item = cfg.items[0];

    const fd = new FormData(); fd.append('image', new Blob([PNG], { type: 'image/png' }), 'x.png');
    const up = await fetch(`${srv.base}/api/r/pgcafe/items/${item.id}/image`, { method: 'POST', headers: { Authorization: 'Bearer ' + admin }, body: fd });
    assert.equal(up.status, 200, await up.text());
    const imgUrl = (await j(srv.base, 'GET', '/api/r/pgcafe/config')).json.items.find((i) => i.id === item.id).img;
    assert.ok(imgUrl.includes('/img/'), imgUrl);
    const img1 = await fetch(srv.base + imgUrl); assert.equal(img1.status, 200); assert.equal(img1.headers.get('content-type'), 'image/png');

    // the images must be in the database, not on the container's disk
    const fs = require('fs'); assert.ok(!fs.existsSync(path.join(srv.data, 'aux')), 'image must not be written to local disk');

    // 30 live guests (demo restaurant has table keys switched off only in dev; this one is created with keys, so read them as admin is not needed: use a no-key tenant)
    await new Promise((r) => setTimeout(r, 2500));   // let the debounced save reach the database
    await srv.stop();

    srv = await startServer(env);                      // new process, same database
    const list = await j(srv.base, 'GET', '/api/super/overview', { token: (await j(srv.base, 'POST', '/api/super/login', { body: { email: 'root@test.dev', password: 'rootpass1' } })).json.token });
    assert.ok(JSON.stringify(list.json).includes('pgcafe'), 'restaurant is still there after restart');
    const img2 = await fetch(srv.base + imgUrl); assert.equal(img2.status, 200, 'image is still there after restart');

    // load test against the always-open dev demo restaurant (table keys off): 30 guests for 8 seconds
    const r = spawnSync(process.execPath, [path.join(__dirname, 'load', 'loadtest.js'), srv.base, '--slug', 'demo', '--guests', '30', '--tables', '6', '--seconds', '8'], { encoding: 'utf8', timeout: 60000 });
    console.log(r.stdout);
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { await srv.stop(); await pg.stop(); }
});
