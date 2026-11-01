const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F19 guest reservations and waitlist [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), B = await S.tenant('basic');
  const cfg = async () => (await T.api('GET', '/config', null, null)).j;
  const pub = (m, p, b) => S.J(m, T.u(p), b);
  const at = Date.now() + 3 * 3600000;

  // plan gate + off by default
  assert.equal((await B.api('POST', '/settings', { reserve: { enabled: true } })).s, 402);
  assert.equal((await pub('GET', '/book/info')).j.on, false);
  assert.equal((await pub('POST', '/book', { name: 'A', phone: '01012345678', guests: 2, at })).s, 403);

  // owner switches it on; values are clamped
  assert.equal((await T.api('POST', '/settings', { reserve: { enabled: true, waitlist: true, maxParty: 6, leadMin: 30, daysAhead: 7, capacity: 8, note: '<b>Hi</b>', from: '99:99' } })).s, 200);
  const info = (await pub('GET', '/book/info')).j; assert.equal(info.on, true); assert.equal(info.cfg.maxParty, 6); assert.ok(!/[<>]/.test(info.cfg.note)); assert.equal(info.cfg.from, '');

  // validation
  const bad = async (b) => (await pub('POST', '/book', { name: 'Sara <i>', phone: '01012345678', guests: 2, at, ...b })).j.code;
  assert.equal(await bad({ name: '' }), 'name'); assert.equal(await bad({ phone: '12' }), 'phone'); assert.equal(await bad({ guests: 7 }), 'party'); assert.equal(await bad({ guests: 0 }), 'party');
  assert.equal(await bad({ at: Date.now() + 60000 }), 'lead'); assert.equal(await bad({ at: Date.now() + 30 * 86400000 }), 'far'); assert.equal(await bad({ at: 0 }), 'time');
  assert.equal(await bad({ guests: 5 }), undefined, 'a party of 5 fits');
  assert.equal(await bad({ phone: '01099999999', guests: 5 }), 'full', 'capacity 8 is used up around that time');

  // staff sees the pending request, confirms with a table
  const cap = await T.staff('captain', 'Wael', '4321'), st = await T.state(cap), c = await cfg();
  const rv = (st.config.reservations || st.reservations || []).find((r) => r.name.startsWith('Sara')); assert.ok(rv, 'staff receive the request'); assert.equal(rv.status, 'pending'); assert.ok(!/[<>]/.test(rv.name));
  const stat = async (id) => (await pub('GET', '/book/status/' + id)).j;
  assert.equal((await stat(rv.id)).status, 'pending'); assert.equal((await pub('GET', '/book/status/nope')).s, 404);
  const tb = c.tables[2];
  assert.equal((await T.rpc('captain', cap, { t: 'res_confirm', id: rv.id, tableId: tb.id })).s, 200);
  const s2 = await stat(rv.id); assert.equal(s2.status, 'confirmed'); assert.equal(String(s2.table), String(tb.number));

  // customer screens never receive reservations
  const g = T.guest(c.tables[0].number); await g.join(); assert.ok(!(g.config && g.config.reservations && g.config.reservations.length));

  // seating opens the table session
  assert.equal((await T.rpc('captain', cap, { t: 'res_seat', id: rv.id })).s, 200);
  assert.ok(Object.values((await T.state(cap)).sessions).some((x) => x.tableId === tb.id), 'table opened');

  // decline
  assert.equal((await pub('POST', '/book', { name: 'Omar', phone: '01155550000', guests: 1, at: at + 5 * 3600000 })).s, 200);
  const om = ((await T.state(cap)).config.reservations || []).find((r) => r.name === 'Omar'); await T.rpc('captain', cap, { t: 'res_decline', id: om.id });
  assert.equal((await stat(om.id)).status, 'declined');

  // waitlist
  const w1 = (await pub('POST', '/book', { kind: 'wait', name: 'Lina', phone: '01233334444', guests: 3 })).j; assert.equal(w1.n, 1);
  assert.equal((await pub('POST', '/book', { kind: 'wait', name: 'Lina2', phone: '0123 333 4444', guests: 3 })).j.code, 'dupe');
  const w2 = (await pub('POST', '/book', { kind: 'wait', name: 'Karim', phone: '01266667777', guests: 2 })).j; assert.equal(w2.n, 2);
  assert.equal((await stat(w2.id)).ahead, 1);
  await T.rpc('captain', cap, { t: 'wl_notify', id: w1.id }); assert.equal((await stat(w1.id)).status, 'notified');
  assert.equal((await T.rpc('captain', cap, { t: 'wl_seat', id: w1.id })).s, 200); // no table: ignored
  assert.equal((await stat(w1.id)).status, 'notified', 'needs a table to seat');
  await T.rpc('captain', cap, { t: 'wl_seat', id: w1.id, tableId: c.tables[4].id }); assert.equal((await stat(w1.id)).status, 'seated');
  await T.rpc('captain', cap, { t: 'wl_del', id: w2.id }); assert.equal((await pub('GET', '/book/status/' + w2.id)).s, 404);

  // per-connection rate limit
  let last; for (let i = 0; i < 7; i++) last = await pub('POST', '/book', { name: 'Spam', phone: '0100000' + (1000 + i), guests: 1, at: at + (i + 8) * 3600000 });
  assert.equal(last.s, 429);

  // plan lock turns it off
  await S.J('PUT', `/api/super/tenants/${T.slug}`, { feat: { reservations: false } }, S.sup);
  assert.equal((await pub('GET', '/book/info')).j.on, false);
  assert.equal((await pub('POST', '/book', { name: 'X', phone: '01012345678', guests: 1, at })).s, 403);
});
