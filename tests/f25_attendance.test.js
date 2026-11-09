const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F25 attendance, shifts and labour cost [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), B = await S.tenant('basic');
  const now = Date.now(), qs = `?from=${now - 86400000}&to=${now + 60000}`;
  assert.equal((await B.api('GET', '/attendance' + qs)).s, 402);

  // signing in with a PIN clocks the person in (once), the pill state follows
  await T.api('POST', '/staff', { name: 'Layla', role: 'captain', pin: '77777777' });
  const tok = (await S.J('POST', T.u('/login'), { role: 'captain', pin: '77777777' })).j.token; assert.ok(tok);
  await S.J('POST', T.u('/login'), { role: 'captain', pin: '77777777' });   // a second sign-in does not double-count
  let a = (await T.api('GET', '/attendance' + qs)).j; assert.equal(a.records.filter((r) => r.name === 'Layla').length, 1); assert.equal(a.here.length >= 1, true);
  assert.equal((await S.J('GET', T.u('/clock'), undefined, tok)).j.on, true);

  // wages and a weekly schedule are cleaned; arriving after the scheduled start is late
  const staff = (await T.api('GET', '/staff')).j.staff, lay = staff.find((x) => x.name === 'Layla');
  const sh = {}; for (let d = 0; d < 7; d++) sh[d] = { from: '00:01', to: '23:59' };
  assert.equal((await T.api('PUT', `/staff/${lay.id}`, { wage: 50, shifts: { ...sh, 9: { from: '25:00', to: 'x' } } })).s, 200);
  const lay2 = (await T.api('GET', '/staff')).j.staff.find((x) => x.id === lay.id); assert.equal(lay2.wage, 50); assert.equal(Object.keys(lay2.shifts).length, 7, 'bad days dropped');

  // a manual shift of exactly 4 hours costs 200; owner can fix and delete records
  const out = now - 3600000, inn = out - 4 * 3600000;
  assert.equal((await T.api('POST', '/attendance', { staffId: lay.id, in: inn, out })).s, 200);
  assert.equal((await T.api('POST', '/attendance', { staffId: lay.id, in: out, out: inn })).s, 400, 'out before in is refused');
  a = (await T.api('GET', '/attendance' + qs)).j; const me = a.staff.find((x) => x.id === lay.id);
  assert.ok(me.hours >= 4 && me.cost >= 200 && me.days >= 1); assert.ok(me.late >= 1, 'came after the 00:01 start'); assert.ok(a.laborCost >= 200);
  const man = a.records.find((r) => r.in === inn); assert.equal((await T.api('PUT', `/attendance/${man.id}`, { out: inn + 2 * 3600000 })).s, 200);
  assert.equal((await T.api('DELETE', `/attendance/${man.id}`)).s, 200);

  // clocking out
  assert.equal((await S.J('POST', T.u('/clock'), {}, tok)).s, 200); assert.equal((await S.J('GET', T.u('/clock'), undefined, tok)).j.on, false);
  assert.equal((await S.J('GET', T.u('/attendance' + qs))).s, 401, 'only the owner reads attendance');
  const csv = await fetch(S.base + T.u('/attendance.csv' + qs), { headers: { Authorization: 'Bearer ' + T.admin } }); assert.match(await csv.text(), /Total labour cost/);
});
