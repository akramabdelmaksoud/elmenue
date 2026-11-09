const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F17 item options and details [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), B = await S.tenant('basic');
  const cfg = async () => (await T.api('GET', '/config', null, null)).j;
  const item = (await cfg()).items.find((i) => !i.soldOut && i.stock == null && i.price > 0);
  const options = [
    { id: 'size', name: 'Size', type: 'one', required: true, choices: [{ id: 'reg', name: 'Regular', price: 0, def: true }, { id: 'lrg', name: 'Large', name_ar: 'كبير', price: 10 }] },
    { id: 'milk', name: 'Milk', type: 'one', choices: [{ id: 'oat', name: 'Oat milk', price: 5 }, { id: 'soy', name: 'Soy', price: 4 }] },
    { id: 'extra', name: 'Extras', type: 'many', max: 2, choices: [{ id: 'shot', name: 'Extra shot', price: 8 }, { id: 'syr', name: 'Syrup', price: 3 }, { id: 'cream', name: 'Cream', price: 2 }] },
    { id: 'must', name: 'Pick one', type: 'one', required: true, choices: [{ id: 'a', name: 'A', price: 0 }, { id: 'b', name: 'B', price: 1 }] },
  ];
  // owner saves options; the server cleans them and clips junk
  const put = await T.api('PUT', `/items/${item.id}`, { options, allergens: ['gluten', 'bogus', 'dairy', 'dairy'], cal: 250, badge: 'chef', img: 'javascript:alert(1)', __proto__: { x: 1 }, name: 'N'.repeat(300) });
  assert.equal(put.s, 200); assert.deepEqual(put.j.allergens, ['gluten', 'dairy']); assert.equal(put.j.cal, 250); assert.equal(put.j.badge, 'chef');
  assert.ok(!put.j.img || !/javascript/.test(put.j.img), 'img cannot be set through the item form'); assert.equal(put.j.name.length, 80); assert.equal(({}).x, undefined);
  const messy = await T.api('PUT', `/items/${item.id}`, { options: [{ name: '', choices: [] }, { name: 'G', type: 'weird', choices: [{ name: 'c', price: -5 }, { name: 'c2', price: 'abc' }, null, 'x'] }, 5, null] });
  assert.equal(messy.j.options.length, 1); assert.equal(messy.j.options[0].type, 'one'); assert.deepEqual(messy.j.options[0].choices.map((c) => c.price), [0, 0]);
  await T.api('PUT', `/items/${item.id}`, { options, name: item.name });
  const base = item.price;

  const g = T.guest((await cfg()).tables[0].number); await g.join();
  const cart = async () => { const r = await g.join(); return (r.j.state.session.cart || []); };
  // required group without default -> refused, nothing added
  await g.call({ t: 'cart_add', itemId: item.id }); assert.equal((await cart()).length, 0, 'group "must" is required and has no default');
  await g.call({ t: 'cart_add', itemId: item.id, opts: { must: 'a' } });
  let c = await cart(); assert.equal(c.length, 1); assert.equal(c[0].price, base, 'default size Regular costs nothing extra'); assert.match(c[0].opt, /Regular/);
  // a priced selection
  await g.call({ t: 'cart_add', itemId: item.id, opts: { must: 'b', size: 'lrg', milk: 'oat', extra: ['shot', 'syr'] } });
  c = await cart(); assert.equal(c.length, 2); const l2 = c.find((x) => /Large/.test(x.opt));
  assert.equal(l2.price, Math.round((base + 1 + 10 + 5 + 8 + 3) * 100) / 100); assert.match(l2.opt, /Large · Oat milk · Extra shot · Syrup|Extra shot/); assert.equal(l2.opt_ar.includes('كبير'), true);
  // same selection merges, different one does not, invalid ones are refused
  await g.call({ t: 'cart_add', itemId: item.id, opts: { must: 'b', size: 'lrg', milk: 'oat', extra: ['syr', 'shot'] } });
  c = await cart(); assert.equal(c.length, 2); assert.equal(c.find((x) => /Large/.test(x.opt)).qty, 2);
  for (const bad of [{ must: 'zzz' }, { must: 'a', size: 'xl' }, { must: 'a', extra: ['shot', 'syr', 'cream'] }, { must: 'a', milk: ['oat', 'soy'] }, { must: { $ne: 1 } }, 'str', 5]) await g.call({ t: 'cart_add', itemId: item.id, opts: bad });
  assert.equal((await cart()).length, 2, 'invalid selections never reach the cart');
  // price cannot be tampered with from the client
  await g.call({ t: 'cart_add', itemId: item.id, opts: { must: 'a' }, price: 0.01, add: -50 }); assert.ok((await cart()).every((x) => x.price >= base));
  // order and bill carry the options and the right total
  await g.call({ t: 'send_order', scope: 'all' });
  const cap = await T.staff('captain', 'Wael', '43214321'), st = await T.state(cap), ses = Object.values(st.sessions).find((x) => x.orders.length);
  const lines = ses.orders[0].items; assert.ok(lines.some((x) => /Large/.test(x.opt)));
  const total = lines.reduce((n, x) => n + x.price * x.qty, 0); assert.ok(total > base * 4);

  // online order and staff order use the same rules
  await T.api('POST', '/settings', { online: { enabled: true, pickup: true } });
  const ol = (items, ip) => S.J('POST', T.u('/online/order'), { kind: 'takeaway', name: 'Mona', phone: '01001234567', items }, null, { 'X-Forwarded-For': ip });
  assert.equal((await ol([{ itemId: item.id, qty: 1 }], '10.5.0.1')).j.code, 'opt');
  const okO = await ol([{ itemId: item.id, qty: 2, opts: { must: 'b', size: 'lrg' } }], '10.5.0.2'); assert.equal(okO.s, 200);
  assert.equal(okO.j.total >= (base + 1 + 10) * 2, true);
  const st2 = await T.state(cap), tk = Object.values(st2.sessions).find((x) => x.tableNumber === okO.j.number); assert.ok(/Large/.test(tk.orders[0].items[0].opt));
  const tid1 = (await cfg()).tables[1].id;
  const cnt = async () => { const x = Object.values((await T.state(cap)).sessions).find((y) => y.tableId === tid1); return x ? x.orders.flatMap((o) => o.items).length : 0; }; const before = await cnt();
  const so = await T.rpc('captain', cap, { t: 'staff_order', tableId: tid1, items: [{ itemId: item.id, qty: 1, opts: { must: 'a', milk: 'soy' } }, { itemId: item.id, qty: 1, opts: { must: 'nope' } }] });
  assert.equal(so.s, 200); const s3 = Object.values((await T.state(cap)).sessions).find((x) => x.tableId === tid1);
  assert.ok(s3, 'valid staff line added'); assert.equal((await cnt()) - before, 1, 'invalid staff line dropped');

  // feature lock: options ignored for this café, the base price applies
  assert.equal((await S.J('PUT', `/api/super/tenants/${T.slug}`, { feat: { options: false } }, S.sup)).s, 200);
  const g2 = T.guest((await cfg()).tables[2].number); await g2.join(); await g2.call({ t: 'cart_add', itemId: item.id, opts: { size: 'lrg' } });
  const c2 = (await g2.join()).j.state.session.cart; assert.equal(c2.length, 1); assert.equal(c2[0].price, base); assert.ok(!c2[0].opt);
  // basic plan includes options by default
  assert.equal((await B.api('GET', '/config', null, null)).j.features.options, true);
});
