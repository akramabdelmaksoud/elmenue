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

test('F44 nothing on the page is lost: sizes keep every price, non-dish lines come back as extra', () => {
  const r = F.parseMenuText('CAFE NILE\nTel 01012345678\n12 Tahrir St, Cairo\nSince 1998\nHOT DRINKS\nS M L\nLatte 45 / 55 / 65\n7UP 25\nMocha\nفول وطعمية AO\nDESSERTS\nCheesecake 110');
  assert.deepEqual(r.categories, ['HOT DRINKS', 'DESSERTS']);
  const latte = r.items.find((x) => x.name === 'Latte'); assert.equal(latte.price, 45); assert.equal(latte.desc, 'Prices: 45 / 55 / 65');
  assert.ok(r.items.some((x) => x.name === '7UP' && x.price === 25), 'short names with a digit are dishes');
  for (const t of ['CAFE NILE', 'Tel 01012345678', '12 Tahrir St, Cairo', 'Since 1998', 'Mocha', 'فول وطعمية AO', 'S M L']) assert.ok(r.extra.includes(t), 'kept for the owner: ' + t);
  assert.ok(!r.items.some((x) => /Tel|Tahrir|Since/.test(x.name)), 'phone, address and year are not dishes');
});

test('F44 Arabic menu: size prices before the name, descriptions under dishes, misread prices kept for the owner', () => {
  const r = F.parseMenuText('الإفطار\nبيض بالبسطرمة ٩٠\nثلاث بيضات مع بسطرمة وعيش بلدي\nفول وطعمية AO\nالمشروبات\n٣٠ / ٢٠ عصير قصب\nسحلب ٥٠');
  const by = (n) => r.items.find((x) => x.name_ar === n);
  assert.deepEqual(r.categories, ['الإفطار', 'المشروبات']);
  assert.equal(by('بيض بالبسطرمة').desc, 'ثلاث بيضات مع بسطرمة وعيش بلدي', 'a sentence under a dish is its description');
  assert.equal(by('عصير قصب').price, 20); assert.equal(by('عصير قصب').desc, 'Prices: 20 / 30', 'sizes small to large, whichever way the photo read them');
  assert.equal(by('سحلب').price, 50);
  assert.ok(r.extra.includes('فول وطعمية AO'), 'a dish whose price was misread is not lost');
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
