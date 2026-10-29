const test = require('node:test');
const assert = require('node:assert');
const { startPg } = require('./helpers');

test('Postgres store: tables, tenants, CAS, history, blobs, flush', async () => {
  const pg = await startPg();
  process.env.DATABASE_URL = pg.url; process.env.PGSSL = 'off'; process.env.SAVE_DEBOUNCE_MS = '50';
  const store = require('../store');
  try {
    await store.init(); await store.init();                                  // idempotent (migration safe to repeat)
    assert.equal(store.mode(), 'postgres'); await store.ping();
    assert.deepEqual(await store.loadAll(), []);

    // tenant records through the debounced save + flush
    store.save({ id: 'r1', slug: 'one', name: 'One' }); store.save({ id: 'r1', slug: 'one', name: 'One v2' });
    await store.flush();
    assert.deepEqual((await store.loadAll()).map((r) => r.name), ['One v2']);

    // blobs and history must live in the database and must NOT be loaded as tenants
    await store.putBlob('k1', 'data:image/png;base64,AAAA');
    assert.equal(await store.getBlob('k1'), 'data:image/png;base64,AAAA');
    assert.equal(await store.getBlob('nope'), null);
    await store.appendHist('r1', [{ total: 5 }]); await store.appendHist('r1', [{ total: 7 }]);
    assert.deepEqual((await store.getHist('r1')).map((h) => h.total), [5, 7]);
    assert.equal((await store.loadAll()).length, 1);

    // compare-and-swap (stateless mode)
    assert.equal(await store.putRec({ id: 'r_x', slug: 'x' }, null), true);
    assert.equal(await store.putRec({ id: 'r_x', slug: 'x' }, null), false);      // already exists
    const g = await store.getRec('r_x'); assert.equal(g.ver, 1);
    assert.equal(await store.putRec({ ...g.rec, name: 'n' }, 1), true);
    assert.equal(await store.putRec({ ...g.rec, name: 'stale' }, 1), false);      // stale version loses
    assert.equal((await store.getRec('r_x')).rec.name, 'n');
    assert.deepEqual((await store.listRecs()).map((r) => r.slug), ['x']);

    await store.remove('r1'); assert.equal((await store.loadAll()).length, 1);    // only r_x left
  } finally { await store.close(); await pg.stop(); }
});
