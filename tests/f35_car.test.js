const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F35 car service [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('basic'), V = await S.tenant('vip');
  const order = (T2, b, ip) => S.J('POST', T2.u('/online/order'), b, null, { 'X-Forwarded-For': ip || '10.5.0.1' });
  const items = (await T.api('GET', '/config', null, null)).j.items, food = items.find((i) => !i.soldOut && i.stock == null);
  const base = { kind: 'car', name: 'Sara', phone: '01001234567', items: [{ itemId: food.id, qty: 2 }], car: { type: 'Toyota Corolla', color: 'white', plate: 'abc 123', spot: '3' } };
  // an add-on: in no bundle, so even the top bundle does not have it until the super admin adds it
  assert.equal((await V.api('GET', '/config', null, null)).j.features.carservice, false);
  assert.equal((await T.api('POST', '/settings', { car: { enabled: true } })).s, 402);
  assert.equal((await order(T, base)).s, 403, 'off without the add-on');
  // super admin switches it on for one cafe only (a cafe on the cheapest bundle)
  assert.equal((await S.J('PUT', `/api/super/tenants/${T.slug}`, { feat: { carservice: true } }, S.sup)).s, 200);
  assert.equal((await T.api('GET', '/config', null, null)).j.features.carservice, true);
  assert.equal((await order(T, base)).s, 403, 'still off until the owner enables it');
  assert.equal((await T.api('POST', '/settings', { car: { enabled: true, spots: 5, prepMin: 12, askPlate: true, note: 'Park in front' } })).s, 200);
  const cfg = (await T.api('GET', '/config', null, null)).j.settings.car; assert.equal(cfg.spots, 5); assert.equal(cfg.prepMin, 12);
  // validation: colour, type, spot inside the numbered range
  assert.equal((await order(T, { ...base, car: { ...base.car, color: 'pink' } })).j.code, 'color');
  assert.equal((await order(T, { ...base, car: { ...base.car, type: ' ' } })).j.code, 'cartype');
  assert.equal((await order(T, { ...base, car: { ...base.car, spot: '9' } })).j.code, 'spot');
  assert.equal((await order(T, { ...base, car: undefined })).j.code, 'color');
  assert.equal((await order(T, { ...base, name: '' })).j.code, 'name');
  const ok = await order(T, base, '10.5.0.2'); assert.equal(ok.s, 200); assert.match(ok.j.number, /^CR-\d+$/); assert.equal(ok.j.kind, 'car'); assert.equal(ok.j.prepMin, 12);
  // the captain sees the car; the plate is upper-cased and markup is stripped
  const cap = (await S.J('POST', T.u('/login'), { role: 'captain', pin: T.pin })).j.token;   // a Starter venue uses the shared PIN
  let ses = Object.values(await T.state(cap).then((x) => x.sessions)).find((x) => x.tableNumber === ok.j.number);
  assert.ok(ses); assert.equal(ses.kind, 'car'); assert.deepEqual({ ...ses.customer.car, arrived: undefined }, { color: 'white', type: 'Toyota Corolla', plate: 'ABC 123', spot: '3', arrived: undefined });
  const dirty = await order(T, { ...base, car: { ...base.car, type: '<b>Kia</b>' } }, '10.5.0.3'); const st2 = await T.state(cap); assert.equal(Object.values(st2.sessions).find((x) => x.tableNumber === dirty.j.number).customer.car.type, 'bKia/b');
  // guest tracking, "I'm here" with a corrected spot, and the alert limit
  const status = async () => (await S.J('GET', T.u('/online/status/' + ok.j.tid))).j;
  let s0 = await status(); assert.equal(s0.status, 'received'); assert.equal(s0.arrived, false);
  assert.equal((await S.J('POST', T.u('/car/arrive'), { tid: ok.j.tid, spot: '8' })).s, 400, 'spot outside the range');
  assert.equal((await S.J('POST', T.u('/car/arrive'), { tid: 'tk_nothere123' })).s, 404);
  const arr = await S.J('POST', T.u('/car/arrive'), { tid: ok.j.tid, spot: '4' }); assert.equal(arr.s, 200); assert.equal(arr.j.spot, '4');
  s0 = await status(); assert.equal(s0.arrived, true); assert.equal(s0.spot, '4');
  await S.J('POST', T.u('/car/arrive'), { tid: ok.j.tid }); await S.J('POST', T.u('/car/arrive'), { tid: ok.j.tid });
  assert.equal((await S.J('POST', T.u('/car/arrive'), { tid: ok.j.tid })).s, 429);
  const oid = ses.orders[0].id;
  await T.rpc('captain', cap, { t: 'order_status', orderId: oid, status: 'kitchen' }); assert.equal((await status()).status, 'preparing');
  await T.rpc('captain', cap, { t: 'order_status', orderId: oid, status: 'served' }); assert.equal((await status()).status, 'ready');
  // staff can also open a car ticket for a guest standing at a car
  await T.rpc('captain', cap, { t: 'open_ticket', kind: 'car', tid: 'tk_staffcar01', name: 'Omar', car: { type: 'Kia Rio', color: 'red', spot: '' } });
  let st3 = await T.state(cap); const mine = Object.values(st3.sessions).find((x) => x.tableId === 'tk_staffcar01'); assert.ok(mine); assert.match(mine.tableNumber, /^CR-/);
  await T.rpc('captain', cap, { t: 'open_ticket', kind: 'car', tid: 'tk_staffcar02', name: 'No car' });
  assert.ok(!Object.values((await T.state(cap)).sessions).find((x) => x.tableId === 'tk_staffcar02'), 'a car ticket needs the car details');
  // payment at the car closes the ticket and it lands in history as a car sale
  await T.rpc('captain', cap, { t: 'close_table', tableId: ok.j.tid, method: 'cash', pay: { tendered: 9999 } }); assert.equal((await status()).status, 'done');
  const hist = (await T.api('GET', '/orders?from=0&to=' + (Date.now() + 1000))).j, row = (hist.orders || hist).find((h) => h.tableNumber === ok.j.number);
  assert.ok(row); assert.equal(row.kind, 'car'); assert.equal(row.customer.car.type, 'Toyota Corolla'); assert.equal(row.source, 'car');
  // free-text spot when no numbered spots are set; the staff pages and the QR for the parking area
  await T.api('POST', '/settings', { car: { enabled: true, spots: 0, askPlate: false } });
  const free = await order(T, { ...base, car: { ...base.car, spot: 'by the palm', plate: 'X1' } }, '10.5.0.4'); assert.equal(free.s, 200);
  const sf = Object.values((await T.state(cap)).sessions).find((x) => x.tableNumber === free.j.number); assert.equal(sf.customer.car.spot, 'by the palm'); assert.equal(sf.customer.car.plate, '');
  const qr = await fetch(S.base + T.u('/carqr/3.png'), { headers: { Authorization: 'Bearer ' + T.admin } }); assert.equal(qr.status, 200); assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(S.base + V.u('/carqr/3.png'), { headers: { Authorization: 'Bearer ' + V.admin } })).status, 402);
  for (const p of ['/cars', '/order']) assert.equal((await fetch(S.base + `/r/${T.slug}${p}`)).status, 200);
  // turning the add-on off again stops new orders
  await S.J('PUT', `/api/super/tenants/${T.slug}`, { feat: { carservice: null } }, S.sup);
  assert.equal((await order(T, base, '10.5.0.9')).s, 403);
});
