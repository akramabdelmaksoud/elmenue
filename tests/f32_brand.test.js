const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
for (const mode of ['ws', 'rpc']) test(`F32 logo and menu background [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop()); const T = await S.tenant('basic');
  const up = async (path) => { const fd = new FormData(); fd.append('image', new Blob([PNG], { type: 'image/png' }), 'x.png'); const r = await fetch(S.base + T.u(path), { method: 'POST', headers: { Authorization: 'Bearer ' + T.admin }, body: fd }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const l = await up('/logo'); assert.equal(l.s, 200); assert.match(l.j.logo, /^\/api\/r\/[\w-]+\/img\/[\w-]+$/);
  const b = await up('/bg-image'); assert.equal(b.s, 200);
  let cfg = (await S.J('GET', T.u('/config'))).j.settings; assert.equal(cfg.logo, l.j.logo); assert.equal(cfg.bgImg, b.j.bgImg); assert.equal(cfg.bgBlur, 14);
  assert.equal((await S.J('GET', S.base ? l.j.logo : l.j.logo)).s, 200, 'image is served');
  // typed urls are ignored, sliders are clamped
  assert.equal((await T.api('POST', '/settings', { logo: 'https://evil.example/x.png', bgImg: "x');}body{", heroImg: 'javascript:1', bgBlur: 999, bgDim: -5 })).s, 200);
  cfg = (await S.J('GET', T.u('/config'))).j.settings; assert.equal(cfg.logo, l.j.logo); assert.equal(cfg.bgImg, b.j.bgImg); assert.ok(!cfg.heroImg || cfg.heroImg.startsWith('/api/')); assert.equal(cfg.bgBlur, 30); assert.equal(cfg.bgDim, 0);
  assert.equal((await T.api('DELETE', '/logo')).s, 200); assert.equal((await T.api('DELETE', '/bg-image')).s, 200);
  cfg = (await S.J('GET', T.u('/config'))).j.settings; assert.equal(cfg.logo, ''); assert.equal(cfg.bgImg, '');
});
