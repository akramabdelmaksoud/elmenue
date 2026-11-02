const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
test('F39 the website contact form saves messages and the platform owner can read them', async (t) => {
  const S = await start('rpc'); t.after(() => S.stop());
  const sup = (await S.J('POST', '/api/super/login', { email: 'super@test.dev', password: 'SuperPass123!' })).j.token;
  const send = (b, ip) => S.J('POST', '/api/contact', b, null, { 'X-Forwarded-For': ip || '10.1.1.1' });
  assert.equal((await send({ name: 'A', email: 'bad', message: 'hi' })).s, 400, 'needs a real name, email and message');
  assert.equal((await send({ name: 'Mona Adel', email: 'mona@cafe.eg', message: 'x' })).s, 400);
  assert.equal((await send({ name: 'Bot', email: 'bot@x.com', message: 'buy now please', website: 'http://spam' })).s, 200, 'bots look successful');
  const ok = await send({ name: 'Mona Adel', email: 'mona@cafe.eg', phone: '01001112223', place: 'Cafe Nile', message: 'I want the Operations plan', lang: 'ar' }); assert.equal(ok.s, 200); assert.equal(ok.j.ok, true);
  assert.equal((await S.J('GET', '/api/super/contacts')).s, 401, 'only the platform owner reads them');
  const rows = (await S.J('GET', '/api/super/contacts', undefined, sup)).j; assert.equal(rows.length, 1, 'the bot message was dropped'); assert.equal(rows[0].place, 'Cafe Nile'); assert.equal(rows[0].lang, 'ar');
  assert.equal((await S.J('DELETE', '/api/super/contacts/' + rows[0].id, undefined, sup)).s, 200); assert.equal((await S.J('GET', '/api/super/contacts', undefined, sup)).j.length, 0);
  let r; for (let i = 0; i < 8; i++) r = await send({ name: 'Spam Er', email: 's@x.com', message: 'hello there ' + i }, '10.2.2.2'); assert.equal(r.s, 429, 'limited per address');
});
