const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const QRCode = require('qrcode');
const { tableQrSvg } = require('../qrstyle');

test('designed table QR: SVG endpoint, admin only, captions escaped', async (t) => {
  const S = await start('rpc'); t.after(() => S.stop());
  const T = await S.tenant('basic');
  const n = (await T.api('GET', '/config', null, null)).j.tables[0].number;
  const H = { headers: { Authorization: 'Bearer ' + T.admin } };
  const r = await fetch(S.base + T.u(`/qr/${n}.svg?base=https://cafe.example.com&top=${encodeURIComponent('<b>Hi</b>')}&bottom=${encodeURIComponent('TABLE {n}')}`), H);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /image\/svg\+xml/);
  const svg = await r.text();
  assert.match(svg, /^<svg[^>]+viewBox/); assert.ok(svg.includes('&lt;b&gt;Hi&lt;/b&gt;')); assert.ok(!svg.includes('<b>'));
  assert.ok(svg.includes('>TABLE ' + n + '</text>'), '{n} becomes the table number');
  assert.equal((await fetch(S.base + T.u(`/qr/${n}.svg`))).status, 401);
  assert.equal((await fetch(S.base + T.u('/qr/9999.svg'), H)).status, 404);
});

test('designed QR layout: size, three glass corners, table badge', () => {
  const url = 'https://cafe.example.com/t/7?k=abcdef12', svg = tableQrSvg(url);
  const N = QRCode.create(url, { errorCorrectionLevel: 'H' }).modules.size;
  const [, w, h] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  assert.equal(w, N + 18); assert.equal(h, N + 16);
  assert.equal((svg.split('<circle')[0].match(/fill-rule="evenodd"/g) || []).length, 3, 'three glass corner squares');
  assert.ok(svg.includes('<circle'), 'table badge');
  assert.ok(svg.includes('translate(930 0) scale(-1 1)'), 'a chair on each side of the table');
});
