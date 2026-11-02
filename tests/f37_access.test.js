const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const F = require('../features');
test('F37 weak PINs are recognised', () => {
  for (const p of ['1234', '1111', '0000', '4321', '12345', '2580', '123456', '9999']) assert.equal(F.weakPin(p), true, p);
  for (const p of ['4829', '7302', '583916', '9071']) assert.equal(F.weakPin(p), false, p);
});
for (const mode of ['ws', 'rpc']) test(`F37 venues are separate, guessing is stopped, screen links work [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const A = await S.tenant('operations'), B = await S.tenant('operations');
  const login = (T, role, pin, ip) => S.J('POST', T.u('/login'), { role, pin }, null, { 'X-Forwarded-For': ip || '10.9.0.1' });
  const capA = (await S.J('POST', A.u('/login'), { role: 'captain', pin: A.pin })).j.token, capB = (await S.J('POST', B.u('/login'), { role: 'captain', pin: B.pin })).j.token;
  assert.ok(capA && capB);
  // ---- venue A's tokens open nothing in venue B (admin, captain, kitchen), on pages, data, exports, staff tools and the live connection
  const kitA = await A.staff('kitchen', 'Kim', '5555');
  const probes = [['GET', '/staff'], ['GET', '/screens'], ['POST', '/screens'], ['GET', '/report?from=0&to=9999999999999'], ['GET', '/orders?from=0&to=9999999999999'], ['GET', '/export.json'], ['GET', '/account'], ['POST', '/settings'], ['GET', '/ownerreport'], ['GET', '/clock'], ['GET', '/invoices'], ['GET', '/suppliers'], ['GET', '/food-cost'], ['POST', '/tables']];
  for (const [who, tok] of [['A admin', A.admin], ['A captain', capA], ['A kitchen', kitA]]) for (const [m, p] of probes) {
    const r = await S.J(m, B.u(p), m === 'POST' ? {} : undefined, tok); assert.ok([401, 403].includes(r.s), `${who} -> B ${m} ${p} = ${r.s}`);
  }
  for (const role of ['captain', 'kitchen', 'cashier']) assert.equal((await B.rpc(role, A.admin, null)).s, 401, 'A owner cannot join B live as ' + role);
  assert.equal((await B.rpc('captain', capA, null)).s, 401); assert.equal((await B.rpc('kitchen', kitA, null)).s, 401);
  assert.equal((await S.J('GET', B.u('/me?role=captain'), undefined, capA)).s, 401);
  assert.ok([401, 403].includes((await S.J('GET', B.u('/report?from=0&to=99999999999999') + '&token=' + A.admin)).s), 'token in the address bar is checked too');
  // a floor token cannot reach the owner's tools in its own venue either
  for (const [m, p] of [['GET', '/staff'], ['GET', '/screens'], ['POST', '/screens'], ['GET', '/export.json']]) assert.ok([401, 403].includes((await S.J(m, A.u(p), m === 'POST' ? {} : undefined, capA)).s), 'captain -> ' + p);
  // ---- guessing PINs from many addresses runs into the venue-wide limit; the other venue and the owner are not affected
  let last;
  for (let i = 0; i < 32; i++) last = await login(A, 'captain', String(1000 + i * 7), '10.8.' + i + '.1');
  assert.equal(last.s, 429, 'venue-wide limit after many wrong PINs from different addresses');
  assert.equal((await login(A, 'captain', A.pin, '10.8.99.1')).s, 429, 'even the right PIN waits while the venue is locked');
  assert.equal((await login(B, 'captain', B.pin, '10.8.98.1')).s, 200, 'another venue is untouched');
  assert.equal((await S.J('POST', A.u('/login'), { role: 'admin', email: `${A.slug}@test.dev`, password: 'Owner123!' })).s, 200, 'the owner can always sign in');
  // ---- screen links
  assert.equal((await S.J('POST', B.u('/screens'), { role: 'kitchen', name: 'x' }, capB)).s, 403, 'only the owner makes links');
  const stf = (await A.api('POST', '/staff', { name: 'Chef Hany', role: 'kitchen', pin: '8426' })).j;
  const k1 = (await A.api('POST', '/screens', { role: 'kitchen', name: 'Kitchen TV' })).j, k2 = (await A.api('POST', '/screens', { role: 'kitchen', staffId: stf.id })).j;
  assert.ok(k1.url.includes('/r/' + A.slug + '/s/') && /\/s\/[a-f0-9]{32}$/.test(k1.url)); assert.equal(k2.staffName, 'Chef Hany'); assert.equal(k2.name, 'Chef Hany');
  assert.equal((await A.api('POST', '/screens', { role: 'chef', name: 'x' })).s, 400); assert.equal((await A.api('POST', '/screens', { role: 'captain' })).s, 400, 'needs a name');
  assert.equal((await A.api('POST', '/screens', { role: 'cashier', staffId: stf.id })).s, 400, 'a kitchen account cannot be a cashier screen');
  assert.equal((await A.api('GET', '/screens')).j.screens.length, 2);
  const key = (u) => u.split('/s/')[1];
  assert.equal((await fetch(S.base + `/r/${A.slug}/s/${key(k1.url)}`)).status, 200, 'the link page loads');
  // wrong keys are refused and counted; a key of venue A does not work in venue B
  assert.equal((await S.J('POST', A.u('/screen-login'), { key: 'a'.repeat(32) })).s, 401); assert.equal((await S.J('POST', A.u('/screen-login'), { key: 'junk' })).s, 401);
  assert.equal((await S.J('POST', B.u('/screen-login'), { key: key(k1.url) })).s, 401, "A's key does not open B");
  const opened = await S.J('POST', A.u('/screen-login'), { key: key(k1.url) }); assert.equal(opened.s, 200); assert.equal(opened.j.role, 'kitchen'); const tok1 = opened.j.token;
  assert.equal((await A.rpc('kitchen', tok1, null)).s, 200, 'the screen joins the kitchen'); assert.equal((await A.rpc('captain', tok1, null)).s, 401, 'but not another role'); assert.equal((await A.rpc('admin', tok1, null)).s, 401);
  assert.equal((await S.J('GET', A.u('/me?role=kitchen'), undefined, tok1)).s, 200); assert.equal((await S.J('GET', B.u('/me?role=kitchen'), undefined, tok1)).s, 401, 'and not another venue');
  assert.equal((await S.J('GET', A.u('/screens'), undefined, tok1)).s, 403, 'a screen cannot manage screens');
  // a screen tied to a person signs in as that person (their name, their attendance)
  const o2 = await S.J('POST', A.u('/screen-login'), { key: key(k2.url) }); assert.equal(o2.s, 200); const tok2 = o2.j.token;
  assert.equal(JSON.parse(Buffer.from(tok2.split('.')[0], 'base64url').toString()).n, 'Chef Hany');
  assert.equal((await S.J('GET', A.u('/clock'), undefined, tok2)).j.on, true, 'clocked in under his own name');
  assert.ok((await A.api('GET', '/screens')).j.screens.find((x) => x.id === k1.id).lastSeen > 0);
  // deleting the link signs that screen out at once
  assert.equal((await A.api('DELETE', '/screens/' + k1.id)).s, 200);
  assert.equal((await A.rpc('kitchen', tok1, null)).s, 401); assert.equal((await S.J('GET', A.u('/me?role=kitchen'), undefined, tok1)).s, 401); assert.equal((await S.J('GET', A.u('/clock'), undefined, tok1)).s, 401);
  assert.equal((await S.J('POST', A.u('/screen-login'), { key: key(k1.url) })).s, 401, 'the deleted link is dead');
  assert.equal((await A.rpc('kitchen', tok2, null)).s, 200, 'the other screen keeps working');
  // guessing link keys is limited too
  let g; for (let i = 0; i < 12; i++) g = await S.J('POST', A.u('/screen-login'), { key: String(i).repeat(32).slice(0, 32).replace(/[^a-f0-9]/g, 'b') }, null, { 'X-Forwarded-For': '10.7.7.7' });
  assert.equal(g.s, 429);
});
