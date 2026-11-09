const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { start } = require('./helper');
const LATIN = /[A-Za-z]/;

// two showrooms for the UAE: a café (Dune) and a restaurant (Sufra), AED, English + Arabic only, Gulf wording
for (const mode of ['ws', 'rpc']) test(`F30 UAE showrooms [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  for (const [slug, nameAr, min] of [['dune', 'دون كوفي هاوس', 60], ['sufra', 'مطعم سفرة', 50]]) {
    const info = await S.J('GET', '/api/prospect/info?slug=' + slug); assert.equal(info.s, 200, slug); assert.equal(info.j.name_ar, nameAr); assert.equal(info.j.dialect, 'gulf'); assert.ok(info.j.brand && info.j.brand.g);
    const cfg = (await S.J('GET', `/api/r/${slug}/config`)).j, st = cfg.settings;
    assert.equal(st.currency, 'AED'); assert.deepEqual(st.langs, ['ar', 'en']); assert.equal(st.dialect, 'gulf'); assert.equal(st.tax, 5);
    assert.ok(cfg.items.length >= min, slug + ' items ' + cfg.items.length);
    for (const i of cfg.items) {
      assert.ok(i.name_ar && !LATIN.test(i.name_ar.replace(/\(.*?\)/g, '')), `${slug}: Arabic name of "${i.name}" has Latin letters: ${i.name_ar}`);
      assert.ok(i.price >= 5 && i.price <= 150, `${slug}: ${i.name} price ${i.price}`);
      for (const g of i.options || []) { assert.ok(g.name_ar && !LATIN.test(g.name_ar), `${slug}: option group "${g.name}"`); for (const c of g.choices) assert.ok(c.name_ar && !LATIN.test(c.name_ar), `${slug}: choice "${c.name}" of ${i.name}`); }
    }
    for (const c of cfg.categories) assert.ok(c.name_ar && !LATIN.test(c.name_ar), slug + ' category ' + c.name);
    assert.ok(cfg.items.some((i) => (i.options || []).length), 'real options');
    const adm = (await S.J('POST', '/api/prospect/login', { slug, role: 'admin' })).j.token;
    const hist = await S.J('GET', `/api/r/${slug}/orders?from=2000-01-01&to=2100-01-01`, undefined, adm); assert.equal(hist.s, 200);
    assert.ok((hist.j.orders || []).length > 20, 'demo sales history');
    assert.equal((await S.J('GET', '/p/' + slug)).s, 200);
  }
});

test('F30 every UAE item has a photo file', () => {
  for (const n of ['dune', 'sufra']) for (const i of require('../presets/' + n).items) {
    assert.ok(i.img, `${n}: ${i.name} has no photo rule`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', i.img)), `${n}: ${i.name} -> ${i.img} missing`);
  }
  for (const n of ['dune', 'sufra']) assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', 'demo', n, 'logo.svg')));
});
