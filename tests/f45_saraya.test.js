// السرايا: a real café made from its own preset, with per-person access, floor editing from the captain screen and the ولعة button
const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');

for (const mode of ['ws', 'rpc']) test(`F45 السرايا café: access, floor editing, ولعة [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const c = await S.J('POST', '/api/super/tenants', { name: 'السرايا', slug: 'saraya-real', email: 'owner@saraya.test', password: 'Owner123!', plan: 'vip', preset: 'saraya' }, S.sup);
  assert.equal(c.s, 200, JSON.stringify(c.j));
  const u = (p) => '/api/r/saraya-real' + p;
  const admin = (await S.J('POST', u('/login'), { role: 'admin', email: 'owner@saraya.test', password: 'Owner123!' })).j.token;
  const A = (m, p, b) => S.J(m, u(p), b, admin);

  // the preset: menu, look, floor and the three switches; a real café gets no sample sales and keeps its QR keys
  const cfg = (await S.J('GET', u('/config'))).j, st = cfg.settings;
  assert.equal(st.name_ar, 'السرايا'); assert.equal(st.nameFont.family, 'Aref Ruqaa'); assert.ok(st.staffAccess && st.fireBtn);
  assert.equal(st.palette.accent, '#f26b0f'); assert.equal(st.paletteDark.bg, '#0b0b0b'); assert.notEqual(st.requireKey, false);
  assert.equal(cfg.tables.length, 16); assert.ok(cfg.tables.some((x) => x.zone === 'الرصيف'));
  assert.ok(cfg.items.some((i) => i.name_ar === 'شيشة تفاحتين') && cfg.items.some((i) => i.name_ar === 'قهوة تركي' && i.options.some((o) => o.id === 'sugar')));
  assert.equal(((await A('GET', '/orders?from=2000-01-01&to=2100-01-01')).j.orders || []).length, 0, 'no fake history in a real café');
  await A('POST', '/settings', { requireKey: false });   // let the test guest join without the printed key

  // 1. access: a waiter, and a kitchen person the owner later trusts with the cashier screen
  const ahmed = (await A('POST', '/staff', { name: 'Ahmed', role: 'captain', pin: '735291' })).j;
  assert.deepEqual(ahmed.access, { captain: true, cashier: false, floor: false });
  const mona = (await A('POST', '/staff', { name: 'Mona', role: 'kitchen', pin: '648203' })).j;
  const cap = await S.J('POST', u('/login'), { role: 'captain', pin: '735291' }); assert.equal(cap.s, 200);
  const tok = cap.j.token;
  let r = await S.J('POST', u('/login'), { role: 'cashier', pin: '648203' }); assert.equal(r.s, 403); assert.equal(r.j.code, 'access');
  assert.equal((await A('PUT', '/staff/' + mona.id, { access: { cashier: true } })).s, 200);
  assert.equal((await S.J('POST', u('/login'), { role: 'cashier', pin: '648203' })).s, 200, 'cashier access given');

  // 2. floor editing from the captain screen: off until the owner turns it on
  assert.equal((await S.J('GET', u('/floor/can'), undefined, tok)).j.edit, false);
  const t1 = cfg.tables[0], moved = { tables: [{ id: t1.id, fx: 6, fy: 6, fw: 3, fh: 3, shape: 'square', seats: 6 }], decor: cfg.settings.floor.decor };
  assert.equal((await S.J('PUT', u('/floor/layout'), moved, tok)).s, 403);
  await A('PUT', '/staff/' + ahmed.id, { access: { floor: true } });
  assert.equal((await S.J('GET', u('/floor/can'), undefined, tok)).j.edit, true);
  assert.equal((await S.J('PUT', u('/floor/layout'), moved, tok)).s, 200);
  const t1b = (await S.J('GET', u('/config'))).j.tables.find((x) => x.id === t1.id);
  assert.equal(t1b.fx, 6); assert.equal(t1b.shape, 'square'); assert.equal(t1b.seats, 6);

  // 3. the ولعة: a guest asks for it, the captain sees it as a request
  const g = { role: 'customer', tableNumber: 2, name: 'Guest', avatar: '🙂', guestId: null, key: '' };
  const call = async (msg) => { const x = await S.J('POST', u('/rpc'), { join: g, msg }); if (x.j.guestId) g.guestId = x.j.guestId; return x; };
  await call(null); await call({ t: 'request', type: 'fire' });
  const state = (await S.J('POST', u('/rpc'), { join: { role: 'captain', token: tok }, msg: null, since: -1 }, tok)).j.state;
  const sess = Object.values(state.sessions).find((x) => x.tableNumber === 2);
  assert.ok(sess.requests.some((q) => q.type === 'fire' && !q.done), 'fire request reaches the captain');

  // 4. taking access away signs the person out at once (no waiting for the sign-in to expire)
  await A('PUT', '/staff/' + ahmed.id, { access: { captain: false } });
  assert.equal((await S.J('GET', u('/floor/can'), undefined, tok)).s, 401);
  assert.equal((await S.J('POST', u('/rpc'), { join: { role: 'captain', token: tok }, msg: null, since: -1 }, tok)).s, 401);
  r = await S.J('POST', u('/login'), { role: 'captain', pin: '735291' }); assert.equal(r.s, 403); assert.equal(r.j.code, 'access');
  // and switching someone off does the same
  const mtok = (await S.J('POST', u('/login'), { role: 'cashier', pin: '648203' })).j.token;
  await A('PUT', '/staff/' + mona.id, { active: false });
  assert.equal((await S.J('GET', u('/shift'), undefined, mtok)).s, 401);

  // 5. a shared link per person: it signs them in as themselves, and stops when their access is taken away
  const sara = (await A('POST', '/staff', { name: 'Sara', role: 'cashier', pin: '917354' })).j;
  assert.equal((await A('POST', '/screens', { role: 'captain', staffId: sara.id })).s, 400, 'no link for a screen she cannot open');
  const link = (await A('POST', '/screens', { role: 'cashier', staffId: sara.id })).j; assert.ok(link.url);
  const key = link.url.split('/s/')[1];
  const sl = await S.J('POST', u('/screen-login'), { key }); assert.equal(sl.s, 200); assert.equal(sl.j.name, 'Sara'); assert.equal(sl.j.role, 'cashier');
  assert.equal((await S.J('GET', u('/shift'), undefined, sl.j.token)).s, 200);
  await A('PUT', '/staff/' + sara.id, { access: { cashier: false } });
  assert.equal((await S.J('GET', u('/shift'), undefined, sl.j.token)).s, 401, 'the phone that used the link is signed out');
  const again = await S.J('POST', u('/screen-login'), { key }); assert.equal(again.s, 403); assert.equal(again.j.code, 'access');
});

// everything new is off for every other café
for (const mode of ['ws', 'rpc']) test(`F45 other cafés are unchanged [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip');
  const cap = await T.staff('captain', 'Sami', '470382');
  assert.equal((await T.api('GET', '/floor/can', undefined, cap)).j.edit, false);
  assert.equal((await T.api('PUT', '/floor/layout', { tables: [] }, cap)).s, 403);
  const k = await T.api('POST', '/staff', { name: 'Hany', role: 'kitchen', pin: '826491' }); assert.equal(k.j.access, undefined);
  assert.equal((await S.J('POST', T.u('/login'), { role: 'captain', pin: '826491' })).s, 401, 'a kitchen PIN still does not open the captain screen');
  const g = T.guest(1); await g.join(); await g.call({ t: 'request', type: 'fire' });
  const s = Object.values((await T.state(cap)).sessions).find((x) => x.tableNumber === 1);
  assert.ok(!s.requests.some((q) => q.type === 'fire'), 'no ولعة request without the switch');
  assert.equal((await S.J('GET', T.u('/config'))).j.settings.staffAccess, undefined);
});

// the passwordless demo at /p/saraya builds itself, and its captain can try the floor editor
for (const mode of ['ws', 'rpc']) test(`F45 السرايا demo link [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const info = await S.J('GET', '/api/prospect/info?slug=saraya'); assert.equal(info.s, 200); assert.equal(info.j.name_ar, 'السرايا'); assert.equal(info.j.tables.length, 16);
  const cap = (await S.J('POST', '/api/prospect/login', { slug: 'saraya', role: 'captain' })).j.token;
  assert.equal((await S.J('GET', '/api/r/saraya/floor/can', undefined, cap)).j.edit, true);
  assert.equal((await S.J('GET', '/demo/saraya/logo.svg')).s, 200);
  assert.equal((await S.J('GET', '/captain-floor.js')).s, 200);
});

// an existing plain café gets the السرايا setup in place: login, staff, history and QR keys are kept
for (const mode of ['ws', 'rpc']) test(`F45 apply the السرايا setup to an existing café [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { name: 'السرايا' });
  const cap = await T.staff('captain', 'Ali', '593017');
  const before = (await S.J('GET', T.u('/config'))).j, key1 = before.tables.find((x) => x.number === 1).key;
  const g = T.guest(3); await g.join();
  assert.equal((await S.J('POST', `/api/super/tenants/${T.slug}/preset`, { preset: 'saraya' }, S.sup)).s, 409, 'refused while a table is open');
  const sid = Object.values((await T.state(cap)).sessions)[0].tableId;
  await T.rpc('captain', cap, { t: 'close_table', tableId: sid, unpaid: true });
  assert.equal((await S.J('POST', `/api/super/tenants/${T.slug}/preset`, { preset: 'nope' }, S.sup)).s, 400);
  assert.equal((await S.J('POST', `/api/super/tenants/${T.slug}/preset`, { preset: 'saraya' })).s, 401, 'super admin only');
  const r = await S.J('POST', `/api/super/tenants/${T.slug}/preset`, { preset: 'saraya' }, S.sup); assert.equal(r.s, 200, JSON.stringify(r.j));
  const c = (await S.J('GET', T.u('/config'))).j;
  assert.ok(c.settings.staffAccess && c.settings.fireBtn && c.settings.nameFont); assert.equal(c.settings.name_ar, 'السرايا'); assert.equal(c.settings.name, 'السرايا');
  assert.equal(c.tables.length, 16); assert.equal(c.tables.find((x) => x.number === 1).key, key1, 'printed QR codes keep working');
  assert.ok(c.items.every((i) => i.id.startsWith('sy')) && c.items.some((i) => i.name_ar === 'شيشة تفاحتين'));
  assert.equal((await T.api('GET', '/floor/can', undefined, cap)).s, 200, 'the captain is still signed in (captain access by role)');
  const st = (await T.api('GET', '/staff')).j.staff.find((x) => x.name === 'Ali'); assert.deepEqual(st.access, { captain: true, cashier: false, floor: false });
  assert.equal((await S.J('POST', T.u('/login'), { role: 'admin', email: `${T.slug}@test.dev`, password: 'Owner123!' })).s, 200, 'owner login kept');
});
