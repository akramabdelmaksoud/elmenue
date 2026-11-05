const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../features');
const { start } = require('./helper');

test('F44 menu text parser: Arabic digits, price first, price on the next line, two-language names', () => {
  const r = F.parseMenuText(`HOT DRINKS المشروبات الساخنة
Espresso اسبريسو ........ 45
Cappuccino ........ 70 - espresso with silky milk foam
Turkish Coffee
50 EGP
| . |
COLD DRINKS:
Iced Latte  80 LE
creamy cold milk with a double shot
مشروبات باردة
٥٥ ليمون نعناع
عصير برتقال ........ ٦٥ ج`);
  const by = (n) => r.items.find((x) => x.name === n || x.name_ar === n);
  assert.deepEqual(r.categories, ['HOT DRINKS', 'COLD DRINKS', 'مشروبات باردة']);
  assert.equal(by('Espresso').name_ar, 'اسبريسو'); assert.equal(by('Espresso').cat_ar, 'المشروبات الساخنة');
  assert.equal(by('Cappuccino').desc, 'espresso with silky milk foam');
  assert.equal(by('Turkish Coffee').price, 50, 'price on the line under the name');
  assert.equal(by('Iced Latte').desc, 'creamy cold milk with a double shot', 'a long line under an item is its description');
  assert.equal(by('ليمون نعناع').price, 55, 'Arabic digits, price first'); assert.equal(by('عصير برتقال').price, 65);
  assert.equal(r.items.length, 6, 'noise lines are skipped');
});

for (const mode of ['ws']) test(`F44 menu scan without an AI key: the page reads the photo, the server turns text into rows [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const V = await S.tenant('vip'), B = await S.tenant('basic');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
  const up = async (T) => { const fd = new FormData(); fd.append('image', new Blob([png], { type: 'image/png' }), 'menu.png'); const r = await fetch(S.base + T.u('/menu/ocr'), { method: 'POST', body: fd, headers: { Authorization: 'Bearer ' + T.admin } }); return { s: r.status, j: await r.json() }; };
  const r = await up(V); assert.equal(r.s, 200); assert.equal(r.j.local, true, 'no sample menu any more: the device reads it');
  const p = await V.api('POST', '/menu/ocr/text', { text: 'DRINKS\nTea 30\n٤٥ قهوة' });
  assert.equal(p.s, 200); assert.equal(p.j.items.length, 2); assert.equal(p.j.items[1].price, 45);
  assert.equal((await V.api('POST', '/menu/ocr/text', { text: '  ' })).s, 400);
  assert.notEqual((await B.api('POST', '/menu/ocr/text', { text: 'Tea 30' })).s, 200, 'only for cafés with the feature');
  for (const f of ['/vendor/ocr/tesseract.min.js', '/vendor/ocr/worker.min.js', '/vendor/ocr/lang/ara.traineddata.gz', '/vendor/ocr/lang/eng.traineddata.gz']) assert.equal((await fetch(S.base + f)).status, 200, f);
  assert.equal((await fetch(S.base + '/vendor/ocr/lang/..%2Fpackage.json')).status, 404);
});
