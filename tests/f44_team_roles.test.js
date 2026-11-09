const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const R = require('../roles');

test('F44 password, username and PIN rules', () => {
  for (const p of ['short1A', 'alllowercase123', 'ALLUPPERCASE123', 'NoNumbersHereAtAll', 'Password12345', 'Aaaa1111bbbb', 'Abcd1234Efgh']) assert.ok(R.passwordProblem(p), 'weak: ' + p);
  assert.ok(R.passwordProblem('Zebra-Lamp-Quartz-8841', { username: 'zebralamp' }), 'must not contain the username');
  for (const p of ['Coral-Maple-Tiger-4827', 'v8Kq2mTz4Lp9x']) assert.equal(R.passwordProblem(p), null, p);
  for (let i = 0; i < 20; i++) assert.equal(R.passwordProblem(R.generatePassword()), null);
  assert.ok(R.userProblem('ab')); assert.ok(R.userProblem('Admin')); assert.ok(R.userProblem('owner')); assert.equal(R.userProblem('sara.mansour'), null);
  for (const p of ['1234', '12345', '123456', '111111', '654321', '121212', '123123', '246810', '12345678901']) assert.ok(R.pinProblem(p), 'weak pin ' + p);
  for (const p of ['482915', '7302846', '951357']) assert.equal(R.pinProblem(p), null, p);
  assert.equal(R.pinProblem('123456', false) === null, true, 'length only when not strict');
  assert.ok(R.pinProblem('4829', false), 'four digits is never enough');
});

test('F44 authenticator codes (TOTP) match the RFC test vector and cannot be replayed', () => {
  // RFC 6238 appendix B, SHA-1, secret "12345678901234567890", time 59 s -> 94287082 (last 6 digits 287082)
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  assert.equal(R.hotp(secret, Math.floor(59 / 30)), '287082');
  const now = 1_700_000_000_000, step = Math.floor(now / 30000), code = R.hotp(secret, step);
  assert.equal(R.totpCheck(secret, code, 0, now), step);
  assert.equal(R.totpCheck(secret, code, step, now), null, 'the same code is refused the second time');
  assert.equal(R.totpCheck(secret, '000000', 0, now), null);
  assert.equal(R.totpCheck(secret, R.hotp(secret, step - 5), 0, now), null, 'old codes expire');
});

test('F44 route policy: closed by default', () => {
  const P = (m, p) => R.permFor(m, p);
  assert.equal(P('GET', '/ingredients'), 'inventory'); assert.equal(P('POST', '/ingredients/:id/adjust'), 'inventory'); assert.equal(P('GET', '/pos'), 'inventory');
  assert.equal(P('GET', '/invoices'), 'billing'); assert.equal(P('GET', '/orders'), 'billing'); assert.equal(P('PUT', '/invoice-brand'), 'billing_admin');
  assert.equal(P('GET', '/account'), 'owner'); assert.equal(P('POST', '/account'), 'owner'); assert.equal(P('GET', '/pay/config'), 'owner'); assert.equal(P('POST', '/pay/config'), 'owner');
  assert.equal(P('GET', '/export.json'), 'owner'); assert.equal(P('GET', '/branches'), 'owner'); assert.equal(P('POST', '/eta/config'), 'owner'); assert.equal(P('POST', '/legacy-pin'), 'owner');
  assert.equal(P('POST', '/something-new'), 'owner');
  assert.equal(P('POST', '/logo'), 'owner'); assert.equal(P('POST', '/pay-qr'), 'owner');
  assert.equal(P('POST', '/loyalty/adjust'), 'owner');
  assert.equal(R.can('opmanager', 'inventory'), true); assert.equal(R.can('opmanager', 'staff'), false); assert.equal(R.can('opmanager', 'menu'), false); assert.equal(R.can('opmanager', 'reports'), false);
  assert.equal(R.can('manager', 'staff'), true); assert.equal(R.can('manager', 'owner'), false); assert.equal(R.can('manager', 'billing_admin'), true); assert.equal(R.can('admin', 'owner'), true);
});

for (const mode of ['ws', 'rpc']) test(`F44 hierarchy, sign-in, lockout and isolation [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip'), B = await S.tenant('vip');
  const login = (X, username, password, extra = {}, ip = '10.1.0.1') => S.J('POST', X.u('/login'), { role: 'team', username, password, ...extra }, null, { 'X-Forwarded-For': ip });
  const asTok = (X, tok, m, p, b) => S.J(m, X.u(p), b, tok);

  // ---- the owner creates a branch manager; weak passwords and bad usernames are refused
  assert.equal((await T.api('POST', '/team', { name: 'Sara', username: 'sara.m', role: 'manager', password: 'weak' })).s, 400);
  assert.equal((await T.api('POST', '/team', { name: 'Sara', username: 'ab', role: 'manager' })).s, 400);
  assert.equal((await T.api('POST', '/team', { name: 'Sara', username: 'sara.m', role: 'cashier' })).s, 400, 'only team roles here');
  const mk = await T.api('POST', '/team', { name: 'Sara Mansour', username: 'sara.m', role: 'manager' }); assert.equal(mk.s, 200, JSON.stringify(mk.j));
  assert.ok(mk.j.password && !R.passwordProblem(mk.j.password), 'a strong password is generated and shown once');
  assert.equal((await T.api('POST', '/team', { name: 'Dup', username: 'sara.m', role: 'opmanager' })).s, 400, 'username must be unique');
  assert.equal((await T.api('GET', '/team')).j.team.some((x) => x.hash || x.password), false, 'hashes never leave the server');

  // ---- sign-in: wrong password, then the right one; the first login forces a new password
  assert.equal((await login(T, 'sara.m', 'Wrong-Pass-1234')).s, 401);
  const l1 = await login(T, 'sara.m', mk.j.password); assert.equal(l1.s, 200); let mgr = l1.j.token;
  const guarded = await asTok(T, mgr, 'GET', '/ingredients'); assert.equal(guarded.s, 403); assert.equal(guarded.j.code, 'change_password');
  assert.equal((await asTok(T, mgr, 'POST', '/me/password', { current: mk.j.password, password: 'weakweak' })).s, 400);
  assert.equal((await asTok(T, mgr, 'POST', '/me/password', { current: 'Nope-Nope-Nope-1234', password: 'Fresh-Garden-Moon-7391' })).s, 401);
  const ch = await asTok(T, mgr, 'POST', '/me/password', { current: mk.j.password, password: 'Fresh-Garden-Moon-7391' }); assert.equal(ch.s, 200);
  assert.equal((await asTok(T, mgr, 'GET', '/ingredients')).s, 401, 'the old token dies when the password changes'); mgr = ch.j.token;
  assert.equal((await asTok(T, mgr, 'GET', '/ingredients')).s, 200);
  assert.equal((await S.J('GET', T.u('/me?role=admin'), undefined, mgr)).j.role, 'manager');

  // ---- what a branch manager can and cannot touch
  for (const [m, p] of [['GET', '/staff'], ['GET', '/ingredients'], ['GET', '/orders?from=0&to=99999999999999'], ['GET', '/report?from=0&to=99999999999999'], ['GET', '/team'], ['GET', '/attendance'], ['GET', '/invoices']]) assert.equal((await asTok(T, mgr, m, p)).s, 200, 'manager ' + m + ' ' + p);
  for (const [m, p] of [['GET', '/account'], ['POST', '/account'], ['GET', '/pay/config'], ['POST', '/pay/config'], ['GET', '/export.json'], ['GET', '/branches'], ['POST', '/legacy-pin'], ['POST', '/logo'], ['POST', '/stats/clear'], ['GET', '/eta/config']]) assert.equal((await asTok(T, mgr, m, p, m === 'POST' ? {} : undefined)).s, 403, 'manager blocked ' + m + ' ' + p);
  assert.equal((await asTok(T, mgr, 'POST', '/settings', { tax: 0 })).s, 403, 'a manager cannot change tax or payment settings');
  assert.equal((await asTok(T, mgr, 'POST', '/settings', { instapay: { enabled: true } })).s, 403);
  assert.equal((await asTok(T, mgr, 'POST', '/settings', { refreshMin: 30 })).s, 200, 'only the dashboard refresh choice');
  assert.equal((await asTok(T, mgr, 'POST', '/team', { name: 'Boss', username: 'boss.two', role: 'manager' })).s, 403, 'a manager cannot create another manager');

  // ---- the manager creates an operations manager for his branch; that person gets inventory and billing only
  const op = await asTok(T, mgr, 'POST', '/team', { name: 'Omar Ops', username: 'omar.ops', role: 'opmanager' }); assert.equal(op.s, 200, JSON.stringify(op.j));
  let opTok = (await login(T, 'omar.ops', op.j.password)).j.token;
  opTok = (await asTok(T, opTok, 'POST', '/me/password', { current: op.j.password, password: 'Quiet-Harbor-Lamp-5520' })).j.token;
  for (const [m, p] of [['GET', '/ingredients'], ['GET', '/suppliers'], ['GET', '/invoices'], ['GET', '/orders?from=0&to=99999999999999'], ['GET', '/stocktakes']]) assert.equal((await asTok(T, opTok, m, p)).s, 200, 'ops ' + m + ' ' + p);
  for (const [m, p, b] of [['GET', '/staff'], ['GET', '/team'], ['GET', '/account'], ['GET', '/report?from=0&to=99999999999999'], ['POST', '/items', { name: 'x', price: 1 }], ['PUT', '/items/abc', { price: 1 }], ['POST', '/tables', {}], ['GET', '/pay/config'], ['POST', '/team', { name: 'x', username: 'x.xxx', role: 'opmanager' }], ['POST', '/settings', { refreshMin: 30 }]]) {
    const r = await asTok(T, opTok, m, p, b); assert.equal(r.s, m === 'POST' && p === '/settings' ? 200 : 403, 'ops blocked ' + m + ' ' + p + ' got ' + r.s);
  }
  // a manager sees the operations manager but not the other managers; the owner sees both
  assert.deepEqual((await asTok(T, mgr, 'GET', '/team')).j.team.map((x) => x.role).sort(), ['manager', 'opmanager']);
  assert.equal((await T.api('GET', '/team')).j.team.length, 2);
  assert.equal((await asTok(T, mgr, 'PUT', '/team/' + (await T.api('GET', '/team')).j.team.find((x) => x.role === 'manager').id, { active: false })).s, 403, 'a manager cannot reach upward, not even to himself');

  // ---- live connection: a manager gets the admin view without payment details
  await T.api('POST', '/settings', { instapay: { enabled: true, handle: 'owner@instapay' } });
  const own = await T.rpc('admin', T.admin, null); const mst = await T.rpc('admin', mgr, null);
  assert.equal(own.s, 200); assert.equal(mst.s, 200);
  assert.ok(own.j.state.config.settings.instapay, 'owner sees the payout details');
  assert.equal(mst.j.state.config.settings.instapay, undefined, 'a manager does not');
  assert.equal((await T.rpc('kitchen', opTok, null)).s, 401, 'a manager token is not a kitchen token');

  // ---- another venue: nothing opens
  for (const tok of [mgr, opTok]) for (const [m, p] of [['GET', '/ingredients'], ['GET', '/team'], ['GET', '/invoices']]) assert.ok([401, 403].includes((await asTok(B, tok, m, p)).s), 'other venue ' + m + ' ' + p);
  assert.equal((await B.rpc('admin', mgr, null)).s, 401);
  assert.equal((await login(B, 'sara.m', 'Fresh-Garden-Moon-7391')).s, 401, 'the account does not exist in the other venue');

  // ---- switching an account off kills its sessions at once; the owner can switch it back
  const opId = op.j.id;
  assert.equal((await asTok(T, mgr, 'PUT', '/team/' + opId, { active: false })).s, 200);
  assert.equal((await asTok(T, opTok, 'GET', '/ingredients')).s, 401);
  assert.equal((await login(T, 'omar.ops', 'Quiet-Harbor-Lamp-5520')).s, 401);
  assert.equal((await T.api('PUT', '/team/' + opId, { active: true })).s, 200);
  assert.equal((await login(T, 'omar.ops', 'Quiet-Harbor-Lamp-5520')).s, 200);
  // a password reset also ends old sessions and forces a change
  const rs = await T.api('POST', '/team/' + opId + '/reset', {}); assert.equal(rs.s, 200); assert.ok(rs.j.password);
  assert.equal((await asTok(T, opTok, 'GET', '/ingredients')).s, 401);

  // ---- five wrong passwords lock the username, even for the right password; unknown names are counted the same way
  for (let i = 0; i < 5; i++) assert.equal((await login(T, 'omar.ops', 'Wrong-Guess-' + i + 'Aa', {}, '10.2.' + i + '.1')).s, 401);
  assert.equal((await login(T, 'omar.ops', rs.j.password, {}, '10.2.50.1')).s, 429, 'locked');
  assert.equal((await T.api('GET', '/team')).j.team.find((x) => x.id === opId).locked, true);
  assert.equal((await T.api('PUT', '/team/' + opId, { unlock: true })).s, 200);
  assert.equal((await login(T, 'omar.ops', rs.j.password, {}, '10.2.60.1')).s, 200);
  for (let i = 0; i < 5; i++) await login(T, 'nobody.here', 'Wrong-Guess-' + i + 'Aa', {}, '10.3.' + i + '.1');
  assert.equal((await login(T, 'nobody.here', 'Wrong-Guess-9Aa', {}, '10.3.50.1')).s, 429, 'a made-up name is throttled too, so lockouts do not reveal which names exist');

  // ---- the log records sign-ins, failures, lockouts, creations and what the manager changed
  const log = (await T.api('GET', '/team/log')).j.log, acts = log.map((x) => x.act);
  for (const a of ['login', 'login-failed', 'created', 'disabled', 'password-reset', 'action', 'denied']) assert.ok(acts.includes(a), 'log has ' + a);
  assert.ok(log.some((x) => x.act === 'login' && x.newIp), 'a first sign-in from a new address is flagged');
  assert.ok(log.some((x) => x.act === 'login-failed' && x.locked));
  assert.equal(JSON.stringify(log).includes('Fresh-Garden'), false, 'passwords never reach the log');

  // ---- expiry: an account with an end date stops working after it
  const exp = await T.api('POST', '/team', { name: 'Temp', username: 'temp.ops', role: 'opmanager', expires: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10) }); assert.equal(exp.s, 200);
  assert.equal((await T.api('POST', '/team', { name: 'Old', username: 'old.ops', role: 'opmanager', expires: '2020-01-01' })).s, 400, 'a past date is refused');
  assert.equal((await login(T, 'temp.ops', exp.j.password)).s, 200);

  // ---- owner can remove an account; it can no longer sign in
  assert.equal((await T.api('DELETE', '/team/' + exp.j.id)).s, 200);
  assert.equal((await login(T, 'temp.ops', exp.j.password, {}, '10.4.0.1')).s, 401);
});

for (const mode of ['ws', 'rpc']) test(`F44 two-step sign-in for team accounts and the owner [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip');
  const mk = await T.api('POST', '/team', { name: 'Nour', username: 'nour.m', role: 'manager' });
  let tok = (await S.J('POST', T.u('/login'), { role: 'team', username: 'nour.m', password: mk.j.password })).j.token;
  tok = (await S.J('POST', T.u('/me/password'), { current: mk.j.password, password: 'Silver-Falcon-Door-6412' }, tok)).j.token;
  const setup = await S.J('POST', T.u('/me/2fa/setup'), {}, tok); assert.equal(setup.s, 200); assert.ok(setup.j.secret && setup.j.qr.startsWith('data:image/png'));
  assert.equal((await S.J('POST', T.u('/me/2fa/enable'), { code: '000000' }, tok)).s, 400);
  assert.equal((await S.J('POST', T.u('/me/2fa/enable'), { code: R.hotp(setup.j.secret, Math.floor(Date.now() / 30000)) }, tok)).s, 200);
  const need = await S.J('POST', T.u('/login'), { role: 'team', username: 'nour.m', password: 'Silver-Falcon-Door-6412' }); assert.equal(need.s, 401); assert.equal(need.j.need2fa, true);
  const bad = await S.J('POST', T.u('/login'), { role: 'team', username: 'nour.m', password: 'Silver-Falcon-Door-6412', code: '123456' }, null, { 'X-Forwarded-For': '10.7.0.2' }); assert.equal(bad.s, 401);
  // the code used to switch it on cannot be reused to sign in; the next time step works
  const nextCode = R.hotp(setup.j.secret, Math.floor(Date.now() / 30000) + 1);
  const ok = await S.J('POST', T.u('/login'), { role: 'team', username: 'nour.m', password: 'Silver-Falcon-Door-6412', code: nextCode }, null, { 'X-Forwarded-For': '10.7.0.3' }); assert.equal(ok.s, 200, JSON.stringify(ok.j));
  const replay = await S.J('POST', T.u('/login'), { role: 'team', username: 'nour.m', password: 'Silver-Falcon-Door-6412', code: nextCode }, null, { 'X-Forwarded-For': '10.7.0.4' }); assert.equal(replay.s, 401, 'a code works once');
  // the owner can clear a lost phone
  assert.equal((await T.api('PUT', '/team/' + mk.j.id, { resetTwoFactor: true })).s, 200);
  assert.equal((await S.J('POST', T.u('/login'), { role: 'team', username: 'nour.m', password: 'Silver-Falcon-Door-6412' }, null, { 'X-Forwarded-For': '10.7.0.5' })).s, 200);

  // owner: switch on, then email + password alone is not enough
  const os = await T.api('POST', '/me/2fa/setup', {}); assert.equal(os.s, 200);
  assert.equal((await T.api('POST', '/me/2fa/enable', { code: R.hotp(os.j.secret, Math.floor(Date.now() / 30000)) })).s, 200);
  const o1 = await S.J('POST', T.u('/login'), { role: 'admin', email: `${T.slug}@test.dev`, password: 'Owner123!' }, null, { 'X-Forwarded-For': '10.7.1.1' }); assert.equal(o1.s, 401); assert.equal(o1.j.need2fa, true);
  const o2 = await S.J('POST', T.u('/login'), { role: 'admin', email: `${T.slug}@test.dev`, password: 'Owner123!', code: R.hotp(os.j.secret, Math.floor(Date.now() / 30000) + 1) }, null, { 'X-Forwarded-For': '10.7.1.2' }); assert.equal(o2.s, 200);
});

for (const mode of ['ws', 'rpc']) test(`F44 floor staff PINs are 6 to 10 digits [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations');
  for (const pin of ['4829', '48291', '12345678901']) assert.equal((await T.api('POST', '/staff', { name: 'A' + pin.length, role: 'captain', pin })).s, 400, pin);
  const ok = await T.api('POST', '/staff', { name: 'Hana', role: 'captain', pin: '482915' }); assert.equal(ok.s, 200); assert.equal(ok.j.pl, 6);
  assert.equal((await T.api('PUT', '/staff/' + ok.j.id, { pin: '4829' })).s, 400);
  assert.equal((await T.api('PUT', '/staff/' + ok.j.id, { pin: '7302846' })).s, 200);
  assert.equal((await S.J('POST', T.u('/login'), { role: 'captain', pin: '7302846' })).s, 200);
  assert.ok(String(T.pin).length >= 6, 'a new venue gets a 6-digit owner PIN');
});
