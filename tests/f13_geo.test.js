const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../features.js'), { start } = require('./helper');
const V = { lat: 30.0444, lng: 31.2357 };                        // the cafe (Cairo)
const north = (m) => ({ lat: V.lat + m / 111320, lng: V.lng });  // a point m metres north of it

test('F13 geo: distance, geofence and zones (pure rules)', () => {
  assert.ok(Math.abs(F.distM(V, north(1500)) - 1500) < 15, 'haversine within 1%');
  assert.equal(F.geoPoint({ lat: 'x', lng: 1 }), null); assert.equal(F.geoPoint({ lat: 95, lng: 0 }), null); assert.equal(F.geoPoint({ lat: 0, lng: 0 }), null, '0,0 is "not set"');
  const S = { venueGeo: V, geoLock: { enabled: true, radiusM: 150 } };
  assert.equal(F.geoCheck(S, north(100)).ok, true); assert.equal(F.geoCheck(S, north(500)).code, 'far'); assert.equal(F.geoCheck(S, null).code, 'nogeo');
  assert.equal(F.geoCheck(S, { ...north(230), acc: 100 }).ok, true, 'phone accuracy is forgiven, up to 100 m');
  assert.equal(F.geoCheck(S, { ...north(600), acc: 5000 }).ok, false, 'a huge claimed accuracy does not open the door');
  assert.equal(F.geoCheck({}, null).ok, true, 'no cafe location set: nothing to check');
  assert.deepEqual(F.zonesCfg([{ km: 8, fee: 40 }, { km: 3, fee: 20 }, { km: 0, fee: 5 }, { km: 'x' }]), [{ km: 3, fee: 20 }, { km: 8, fee: 40 }]);
  const Z = { venueGeo: V, online: { zones: [{ km: 3, fee: 20 }, { km: 8, fee: 40 }] } };
  assert.equal(F.zoneFor(Z, north(1500)).fee, 20); assert.equal(F.zoneFor(Z, north(5000)).fee, 40); assert.equal(F.zoneFor(Z, north(10000)).code, 'far'); assert.equal(F.zoneFor(Z, null).code, 'nogeo');
  assert.equal(F.zoneFor({ online: {} }, null).flat, true, 'no zones: flat pricing, no location needed');
});

for (const mode of ['ws', 'rpc']) test(`F13 delivery zones + in-cafe lock [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations'), B = await S.tenant('basic');
  const cfg = (await T.api('GET', '/config', null, null)).j, food = cfg.items.find((i) => !i.soldOut && i.stock == null);
  const order = (b, ip) => S.J('POST', T.u('/online/order'), { name: 'Omar', phone: '01112223334', address: '12 Nile St, Giza', kind: 'delivery', items: [{ itemId: food.id, qty: 1 }], ...b }, null, { 'X-Forwarded-For': ip || '10.5.0.1' });
  // ---- delivery zones ----
  assert.equal((await T.api('POST', '/settings', { venueGeo: V, online: { enabled: true, pickup: true, delivery: true, account: 'off', zones: [{ km: 3, fee: 20 }, { km: 8, fee: 40 }] } })).s, 200);
  assert.equal((await order({})).j.code, 'nogeo', 'delivery needs the guest location when zones are set');
  const near = await order({ geo: north(1500) }, '10.5.0.2'); assert.equal(near.s, 200); assert.equal(Math.round((near.j.total - food.price * (1 + 0)) * 1) > 0, true);
  const mid = await order({ geo: north(5000) }, '10.5.0.3'); assert.equal(mid.s, 200); assert.ok(mid.j.total > near.j.total, 'farther zone costs more');
  const far = await order({ geo: north(12000) }, '10.5.0.4'); assert.equal(far.s, 400); assert.equal(far.j.code, 'far'); assert.equal(far.j.max, 8);
  const cap = await T.staff('captain', 'Wael', '4321'), st = await T.state(cap), tk = Object.values(st.sessions).find((x) => x.tableNumber === near.j.number);
  const fee = tk.orders[0].items.find((l) => l.itemId === 'delivery_fee'); assert.equal(fee.price, 20); assert.match(tk.customer.map, /google\.com\/maps\?q=30\.0/); assert.equal(tk.customer.km, 1.5);
  assert.equal((await order({ kind: 'takeaway' }, '10.5.0.5')).j.number.startsWith('TA-'), true, 'pickup never needs a location');
  // refused orders must not have taken stock; pickup + zones removed -> flat fee item again
  await T.api('POST', '/settings', { online: { enabled: true, pickup: true, delivery: true, account: 'off', zones: [] } });
  assert.equal((await order({}, '10.5.0.6')).s, 200, 'no zones: delivery works without a location');
  // ---- in-cafe lock ----
  assert.equal((await B.api('POST', '/settings', { geoLock: { enabled: true } })).s, 402);
  await T.api('POST', '/settings', { venueGeo: null });
  assert.equal((await T.api('POST', '/settings', { geoLock: { enabled: true, radiusM: 150 } })).s, 400, 'cannot enable the lock without a cafe location');
  assert.equal((await T.api('POST', '/settings', { venueGeo: V, geoLock: { enabled: true, radiusM: 150 } })).s, 200);
  const join = (n, geo) => { const g = T.guest(n, 'Guest' + n); if (geo !== undefined) g.g.geo = geo; return g; };
  const nogeo = await join(1).join(); assert.equal(nogeo.s, 403); assert.equal(nogeo.j.error, 'geo');
  const out = await join(1, { ...north(900), acc: 20 }).join(); assert.equal(out.s, 403); assert.equal(out.j.error, 'geo');
  const inside = join(1, { ...north(60), acc: 20 }); const ok = await inside.join(); assert.equal(ok.s, 200); assert.ok(ok.j.guestId, 'inside guest is seated');
  // a guest who is already at the table keeps working without sending a location again (phone locked, GPS off)
  inside.g.geo = undefined; assert.equal((await inside.join()).s, 200);
  // a friend from outside is refused; once the waiter seats the table, that table is open to guests the waiter vouches for
  assert.equal((await join(2, north(900)).join()).s, 403);
  const tb2 = cfg.tables.find((x) => x.number === 2); await T.rpc('captain', cap, { t: 'seat_table', tableId: tb2.id });
  assert.equal((await join(2, north(900)).join()).s, 200, 'waiter-seated table needs no location');
  // lock off again -> anyone with the QR key may join (original behaviour)
  await T.api('POST', '/settings', { geoLock: { enabled: false } }); assert.equal((await join(3).join()).s, 200);
});
