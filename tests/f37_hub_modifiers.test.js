const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const F = require('../features'), I = require('../integrations');

// ---- counters / sliders and step-by-step flag on item options ----
test('F37 option counter: validated, priced per unit, shown in the line text', () => {
  const it = { price: 20, options: F.optClean([
    { id: 'sugar', name: 'Sugar', type: 'one', required: true, choices: [{ id: 'a', name: 'Sada' }, { id: 'b', name: 'Mazboot', def: 1 }], count: { max: 5, unit: 'spoon', unit_ar: 'معلقة', price: 1 } },
    { id: 'add', name: 'Add-ons', type: 'many', choices: [{ id: 'mint', name: 'Mint', price: 5 }] }] ) };
  assert.equal(it.options[0].count.max, 5);
  const ok = F.optResolve(it, { sugar: 'b', 'sugar~n': 3, add: ['mint'] });
  assert.equal(ok.ok, true); assert.equal(ok.add, 8); assert.match(ok.text, /3 spoon/); assert.match(ok.text_ar, /3 معلقة/);
  assert.equal(F.optResolve(it, { sugar: 'b', add: ['mint'] }).add, 5, 'Tea 20 + Mint 5 = 25');
  for (const bad of [{ 'sugar~n': 6 }, { 'sugar~n': -1 }, { 'sugar~n': 1.5 }, { 'sugar~n': 'x' }, { sugar: 'zzz' }]) assert.equal(F.optResolve(it, { sugar: 'a', ...bad }).ok, false, JSON.stringify(bad));
  const onlyCount = { price: 10, options: F.optClean([{ name: 'Spoons', type: 'one', required: true, choices: [], count: { max: 4, price: 0 } }]) };
  assert.equal(onlyCount.options.length, 1, 'a counter-only group is allowed'); assert.equal(F.optResolve(onlyCount, {}).ok, false, 'required counter-only group needs a count'); assert.equal(F.optResolve(onlyCount, { [onlyCount.options[0].id + '~n']: 2 }).ok, true);
});

for (const mode of ['ws', 'rpc']) test(`F37 shisha coal request and counter order [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true });
  const cfg = async () => (await T.api('GET', '/config', null, null)).j;
  const tbl = (await cfg()).tables[0].number, g = T.guest(tbl); await g.join();
  const reqs = async () => ((await g.join()).j.state.session.requests || []).filter((r) => !r.done);
  await g.call({ t: 'request', type: 'coal' }); assert.equal((await reqs()).filter((r) => r.type === 'coal').length, 0, 'coal is refused while the café has not switched it on');
  assert.equal((await T.api('POST', '/settings', { shisha: true })).s, 200);
  await g.call({ t: 'request', type: 'coal' }); assert.equal((await reqs()).filter((r) => r.type === 'coal').length, 1, 'coal request reaches the floor');
  await g.call({ t: 'request', type: 'coal' }); assert.equal((await reqs()).filter((r) => r.type === 'coal').length, 1, 'repeat taps do not stack (cooldown / one open request)');
  // counter option through the real order path: server prices it, tampering is refused
  const item = (await cfg()).items.find((i) => !i.soldOut && i.stock == null && i.price > 0);
  const options = [{ id: 'sg', name: 'Sugar', type: 'one', choices: [{ id: 'm', name: 'Mazboot', price: 0, def: true }], count: { max: 4, unit: 'spoon', price: 2 } }];
  assert.equal((await T.api('PUT', `/items/${item.id}`, { options, steps: true, name: item.name })).s, 200);
  const it2 = (await cfg()).items.find((i) => i.id === item.id); assert.equal(it2.steps, true); assert.equal(it2.options[0].count.price, 2);
  const cart = async () => (await g.join()).j.state.session.cart || [];
  await g.call({ t: 'cart_add', itemId: item.id, opts: { sg: 'm', 'sg~n': 3 } });
  let c = await cart(); assert.equal(c.length, 1); assert.equal(c[0].price, Math.round((item.price + 6) * 100) / 100); assert.match(c[0].opt, /3 spoon/);
  await g.call({ t: 'cart_add', itemId: item.id, opts: { sg: 'm', 'sg~n': 99 } }); assert.equal((await cart()).length, 1, 'a count over the maximum never reaches the cart');
});

// ---- Integration Hub: safe outbound calls, mapper, sealed secrets ----
test('F37 integration: private addresses blocked, secrets sealed, field mapping', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.1.1', '192.168.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.equal(I.isPublicIp(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34']) assert.equal(I.isPublicIp(ip), true, ip);
  for (const u of ['https://169.254.169.254/latest', 'https://127.0.0.1/', 'https://[::1]/', 'https://localhost/']) await assert.rejects(I.safeRequest(u), /not allowed/, u);
  await assert.rejects(I.safeRequest('http://example.com/'), /https/); await assert.rejects(I.safeRequest('ftp://example.com/'), /https/); await assert.rejects(I.safeRequest('https://user:pw@example.com/'), /login fields/);
  const cfg = I.cleanConfig({ enabled: true, menuUrl: 'https://pos.example.com/menu', orderUrl: 'https://pos.example.com/orders', auth: { type: 'bearer', secret: 'tok_SECRET_123' }, mapping: { listPath: 'data.items', priceDivisor: 100, fields: { name: 'item_title', price: 'unit_price', evil: 'x' } } });
  assert.ok(cfg.auth.secret && !JSON.stringify(cfg).includes('tok_SECRET_123'), 'stored sealed, never plain');
  assert.equal(I.authHeaders(cfg).Authorization, 'Bearer tok_SECRET_123', 'unsealed only when a request is made');
  assert.ok(!JSON.stringify(I.viewConfig(cfg)).includes('SECRET_123'), 'the view sent to the browser only has a mask');
  const again = I.cleanConfig({ ...I.viewConfig(cfg), auth: { ...I.viewConfig(cfg).auth } }, cfg); assert.equal(again.auth.secret, cfg.auth.secret, 'a masked secret sent back keeps the stored one');
  assert.deepEqual(Object.keys(cfg.mapping.fields).sort(), ['name', 'price'], 'unknown mapper fields dropped');
  const m = I.mapRows([{ x: { id: 'A1', t: 'Latte', p: 4500 }, g: 'Hot' }, { x: { id: 'A2', t: '', p: 1 } }, { x: { id: 'A1', t: 'Dup', p: 5 } }], { priceDivisor: 100, fields: { id: 'x.id', name: 'x.t', price: 'x.p', category: 'g' } });
  assert.equal(m.items.length, 1); assert.equal(m.items[0].price, 45); assert.equal(m.skipped, 2);
  assert.equal(I.getPath({ a: 1 }, '__proto__.polluted'), undefined);
  const db = { categories: [], items: [] }; let n = 0; const nid = (p) => p + ++n;
  assert.deepEqual(I.applySync(db, m.items, {}, nid), { created: 1, updated: 0, hidden: 0 });
  db.items[0].img = '/keep/photo.jpg'; db.items[0].options = [{ id: 'keep' }];
  m.items[0].price = 50; assert.equal(I.applySync(db, m.items, {}, nid).updated, 1); assert.equal(db.items[0].price, 50);
  assert.equal(db.items[0].img, '/keep/photo.jpg', 'sync never touches photos'); assert.equal(db.items[0].options.length, 1, 'or options');
  assert.equal(I.applySync(db, [], {}, nid).hidden, 1); assert.equal(db.items[0].soldOut, true, 'items missing from the POS are hidden, not deleted');
});

// ---- merge items into one card with a required Type choice ----
for (const mode of ['ws', 'rpc']) test(`F37 merge items into types [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true });
  const cfg = async () => (await T.api('GET', '/config', null, null)).j;
  const its = (await cfg()).items.filter((i) => i.price > 0 && !i.options?.length).slice(0, 3); assert.equal(its.length, 3);
  const [a, b, c] = its, min = Math.min(a.price, b.price, c.price);
  assert.equal((await T.api('POST', `/items/${a.id}/merge`, { ids: [] })).s, 400);
  const r = await T.api('POST', `/items/${a.id}/merge`, { ids: [b.id, c.id, 'nope'] }); assert.equal(r.s, 200); assert.equal(r.j.removed, 2);
  const m = (await cfg()).items; assert.ok(!m.find((i) => i.id === b.id) && !m.find((i) => i.id === c.id), 'merged items are gone');
  const card = m.find((i) => i.id === a.id); assert.equal(card.price, min); assert.equal(card.options[0].required, true); assert.equal(card.options[0].choices.length, 3);
  const g = T.guest((await cfg()).tables[0].number); await g.join(); const cart = async () => (await g.join()).j.state.session.cart || [];
  await g.call({ t: 'cart_add', itemId: a.id }); assert.equal((await cart()).length, 0, 'the type is required');
  const pick = card.options[0].choices.find((x) => x.name.startsWith(c.name)); await g.call({ t: 'cart_add', itemId: a.id, opts: { type: pick.id } });
  const l = await cart(); assert.equal(l.length, 1); assert.equal(l[0].price, c.price, 'guest pays the real price of the chosen type');
});

// ---- table game room: shared by the guests of one table, host runs the game ----
for (const mode of ['ws', 'rpc']) test(`F37 table game room [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true });
  const tbl = ((await T.api('GET', '/config', null, null)).j).tables[0].number, a = T.guest(tbl), b = T.guest(tbl), c = T.guest(tbl + 1);
  const ja = (await a.join()).j.state, jb = (await b.join()).j.state; await c.join();
  const room = async (g) => ((await g.join()).j.state.session.room || null);
  await a.call({ t: 'room_open', game: 'chess' }); assert.equal(await room(a), null, 'unknown game is refused');
  await a.call({ t: 'room_open', game: 'xo' }); let r = await room(b); assert.equal(r.game, 'xo'); assert.equal(r.seats.length, 1);
  await b.call({ t: 'room_join' }); r = await room(a); assert.equal(r.seats.length, 2);
  await b.call({ t: 'room_snap', snap: '{"x":1}' }); assert.equal((await room(a)).snap, null, 'only the host can publish the game state');
  await a.call({ t: 'room_snap', snap: '{"b":[]}' }); r = await room(b); assert.equal(r.snap, '{"b":[]}'); assert.equal(r.rev, 1);
  await a.call({ t: 'room_intent', a: 'm', p: 3 }); assert.equal((await room(a)).intents.length, 0, 'the host does not send intents');
  await b.call({ t: 'room_intent', a: 'm', p: 3 }); r = await room(a); assert.equal(r.intents.length, 1); assert.equal(r.intents[0].seat, 1);
  await a.call({ t: 'room_ack', n: r.intents[0].n }); assert.equal((await room(a)).intents.length, 0);
  await a.call({ t: 'room_snap', snap: 'x'.repeat(4000) }); assert.equal((await room(a)).rev, 1, 'oversized snapshots are refused');
  assert.equal(await room(c), null, 'another table never sees it');
  await b.call({ t: 'room_leave' }); assert.equal((await room(a)).seats.length, 1);
  await a.call({ t: 'room_leave' }); assert.equal(await room(a), null, 'the room closes when the host leaves');
});
