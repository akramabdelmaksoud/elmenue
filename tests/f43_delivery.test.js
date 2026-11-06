const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const F = require('../features');
test('F43 areas config', () => {
  const a = F.areasCfg([{ name: 'Nasr City', fee: 30, etaMin: 40 }, { name: '' }, { name: 'Nasr City', fee: 'x' }, { name: 'Maadi', name_ar: 'المعادي', fee: 45, minOrder: 200 }]);
  assert.equal(a.length, 3); assert.equal(new Set(a.map((x) => x.id)).size, 3, 'ids stay unique'); assert.equal(a[2].fee, 45);
  assert.equal(F.areaFor({ online: {} }, 'x').none, true, 'no areas: nothing to choose');
  assert.equal(F.areaFor({ online: { areas: [{ name: 'A', fee: 10 }] } }, 'zz').code, 'area');
  assert.equal(F.onlineCfg({ online: { account: 'weird' } }).account, 'delivery');
});
for (const mode of ['ws', 'rpc']) test(`F43 delivery: accounts, areas, drivers, tracking [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations');
  const items = (await T.api('GET', '/config', null, null)).j.items, food = items.find((i) => !i.soldOut && i.stock == null && !i.opts);
  const ip = (n) => ({ 'X-Forwarded-For': '10.43.0.' + n });
  const order = (b, tok, n) => S.J('POST', T.u('/online/order'), b, tok || null, ip(n || 1));
  // owner: delivery on, two named areas with fixed fees, account required for delivery
  const set = await T.api('POST', '/settings', { online: { enabled: true, pickup: true, delivery: true, account: 'delivery', areas: [{ name: 'Nasr City', name_ar: 'مدينة نصر', fee: 30, etaMin: 15 }, { name: 'Maadi', fee: 45, minOrder: food.price * 4 }] } });
  assert.equal(set.s, 200);
  const cfg = (await T.api('GET', '/config', null, null)).j.settings.online; assert.equal(cfg.areas.length, 2); const [nasr, maadi] = cfg.areas;
  const base = { kind: 'delivery', name: 'Omar', phone: '01112223334', address: 'Nasr City, Abbas St, Bldg 3', areaId: nasr.id, geo: { lat: 30.05, lng: 31.33 }, items: [{ itemId: food.id, qty: 2 }] };
  // delivery needs an account; pickup does not
  const no = await order(base); assert.equal(no.s, 401); assert.equal(no.j.code, 'login');
  { const pk = await order({ ...base, kind: 'takeaway' }, null, 2); assert.equal(pk.s, 200, 'pickup stays open to guests ' + JSON.stringify(pk.j)); }
  // register + login + wrong password + duplicate
  const reg = async (b, n) => S.J('POST', T.u('/cust/register'), b, null, ip(n || 3));
  assert.equal((await reg({ name: 'Omar', phone: '12', password: 'secret1' })).j.code, 'phone');
  assert.equal((await reg({ name: 'Omar', phone: '01112223334', password: '123' })).j.code, 'password');
  const r1 = await reg({ name: 'Omar', phone: '01112223334', password: 'secret1' }); assert.equal(r1.s, 200); assert.ok(r1.j.token);
  assert.equal((await reg({ name: 'Omar 2', phone: '+20 111 222 3334', password: 'secret1' })).s, 409, 'same number, other format');
  assert.equal((await S.J('POST', T.u('/cust/login'), { phone: '01112223334', password: 'nope' }, null, ip(4))).s, 401);
  const lg = await S.J('POST', T.u('/cust/login'), { phone: '01112223334', password: 'secret1' }, null, ip(4)); assert.equal(lg.s, 200); const tok = lg.j.token;
  assert.equal((await S.J('GET', T.u('/cust/me'), undefined, 'garbage')).s, 401);
  // saved addresses
  const sv = await S.J('PUT', T.u('/cust/me'), { addrs: [{ label: 'Home', area: 'Nasr City', street: 'Abbas St', bldg: '3', areaId: nasr.id, geo: { lat: 30.05, lng: 31.33 } }, { label: 'x' }] }, tok); assert.equal(sv.j.addrs.length, 1);
  // area rules: must choose a known area; per-area minimum; the fee is fixed and added as a line
  assert.equal((await order({ ...base, areaId: '' }, tok, 5)).j.code, 'area');
  assert.equal((await order({ ...base, areaId: maadi.id }, tok, 5)).j.code, 'min');
  const ok = await order(base, tok, 6); assert.equal(ok.s, 200); assert.match(ok.j.number, /^DL-\d+$/); assert.equal(ok.j.fee, 30);
  assert.ok(Math.abs(ok.j.total - (food.price * 2 + 30)) < 0.6 || ok.j.total > food.price * 2 + 29, 'area fee is in the total');
  const me = (await S.J('GET', T.u('/cust/me'), undefined, tok)).j; assert.equal(me.orders[0].number, ok.j.number); assert.equal(me.orders[0].status, 'received');
  // staff: a driver with a phone; PIN never opens the kitchen
  const mk = await T.api('POST', '/staff', { name: 'Hassan', role: 'driver', pin: '7391', phone: '0100 555 6677' }); assert.equal(mk.s, 200);
  await T.api('POST', '/staff', { name: 'Sayed', role: 'driver', pin: '8264' });
  assert.equal((await S.J('POST', T.u('/login'), { role: 'kitchen', pin: '7391' }, null, ip(7))).s, 401, 'driver PIN is not a kitchen PIN');
  assert.equal((await S.J('POST', T.u('/login'), { role: 'driver', pin: '1111' }, null, ip(7))).s, 401);
  const dl = await S.J('POST', T.u('/login'), { role: 'driver', pin: '7391' }, null, ip(8)); assert.equal(dl.s, 200); const drv = dl.j.token;
  const dl2 = (await S.J('POST', T.u('/login'), { role: 'driver', pin: '8264' }, null, ip(8))).j.token;
  assert.equal((await S.J('GET', T.u('/me?role=driver'), undefined, drv)).s, 200);
  assert.equal((await S.J('GET', T.u('/me?role=kitchen'), undefined, drv)).s, 401);
  const act = (tk, b) => S.J('POST', T.u('/delivery/act'), b, tk, ip(9));
  const jobs = async (tk) => (await S.J('GET', T.u('/delivery/jobs'), undefined, tk)).j.jobs;
  // the driver sees the open delivery with address, phones, map and the items
  let j = (await jobs(drv)).find((x) => x.number === ok.j.number); assert.ok(j); assert.equal(j.stage, 'cooking'); assert.equal(j.phone, '01112223334'); assert.match(j.nav, /destination=30.05,31.33/); assert.equal(j.items[0].qty, 2); assert.equal(j.area, 'Nasr City');
  assert.equal((await act(drv, { tid: ok.j.tid, act: 'pickup' })).j.code, 'cooking', 'cannot leave before the food is ready');
  // kitchen path: captain sends to kitchen, kitchen marks ready
  const cap = await T.staff('captain', 'Wael', '4321'), st = await T.state(cap), ses = Object.values(st.sessions || {}).find((x) => x.tableNumber === ok.j.number), oid = ses.orders[0].id;
  assert.equal(ses.delivery.status, 'new');
  const stat = async () => (await S.J('GET', T.u('/online/status/' + ok.j.tid))).j;
  await T.rpc('captain', cap, { t: 'order_status', orderId: oid, status: 'kitchen' }); assert.equal((await stat()).status, 'preparing');
  await T.rpc('captain', cap, { t: 'order_status', orderId: oid, status: 'served' }); assert.equal((await stat()).status, 'ready');
  j = (await jobs(drv)).find((x) => x.number === ok.j.number); assert.equal(j.stage, 'ready');
  // claiming: a second driver cannot take or move it
  assert.equal((await act(drv, { tid: ok.j.tid, act: 'claim' })).s, 200);
  assert.equal((await act(dl2, { tid: ok.j.tid, act: 'pickup' })).s, 409);
  assert.equal((await jobs(dl2)).some((x) => x.number === ok.j.number), false, 'the other driver no longer sees it');
  assert.equal((await act(drv, { tid: ok.j.tid, act: 'delivered' })).j.code, 'notout');
  assert.equal((await act(drv, { tid: ok.j.tid, act: 'assign', driverId: 'x' })).s, 403, 'drivers cannot assign');
  const out = await act(drv, { tid: ok.j.tid, act: 'pickup' }); assert.equal(out.s, 200);
  let s2 = await stat(); assert.equal(s2.status, 'out'); assert.equal(s2.delivery.driver, 'Hassan'); assert.equal(s2.delivery.driverPhone, '01005556677');
  // live position
  assert.equal((await act(drv, { tid: ok.j.tid, act: 'ping', geo: { lat: 30.06, lng: 31.34 } })).s, 200);
  s2 = await stat(); assert.ok(s2.delivery.pos && s2.delivery.toKm >= 0 && s2.delivery.toKm < 3);
  assert.equal((await act(drv, { tid: ok.j.tid, act: 'release' })).j.code, 'out', 'cannot hand back an order that is out');
  // delivered: tracking says so, captain gets the cash alert, ticket stays for the cashier to settle
  assert.equal((await act(drv, { tid: ok.j.tid, act: 'delivered' })).s, 200);
  s2 = await stat(); assert.equal(s2.status, 'delivered'); assert.equal(s2.delivery.pos, null);
  assert.equal((await act(drv, { tid: ok.j.tid, act: 'pickup' })).s, 409, 'completed deliveries are final');
  assert.equal((await jobs(drv)).find((x) => x.number === ok.j.number).stage, 'delivered');
  await T.rpc('captain', cap, { t: 'close_table', tableId: ok.j.tid, method: 'cash', pay: { tendered: 9999 } });
  assert.equal((await stat()).status, 'done'); assert.equal((await S.J('GET', T.u('/cust/me'), undefined, tok)).j.orders[0].status, 'done');
  // staff dispatch: owner assigns the second driver, then removes them
  const o2 = await order({ ...base, items: [{ itemId: food.id, qty: 1 }] }, tok, 10); assert.equal(o2.s, 200);
  const dr = (await S.J('GET', T.u('/delivery/drivers'), undefined, T.admin)).j.drivers; assert.equal(dr.length, 2); const sayed = dr.find((x) => x.name === 'Sayed');
  assert.equal((await S.J('GET', T.u('/delivery/drivers'), undefined, drv)).s, 403, 'drivers cannot list staff');
  assert.equal((await act(T.admin, { tid: o2.j.tid, act: 'assign', driverId: sayed.id })).s, 200);
  assert.equal((await jobs(drv)).some((x) => x.number === o2.j.number), false); assert.equal((await jobs(dl2)).some((x) => x.number === o2.j.number), true);
  assert.equal((await S.J('GET', T.u('/online/status/' + o2.j.tid))).j.delivery.driver, 'Sayed');
  assert.equal((await act(T.admin, { tid: o2.j.tid, act: 'assign', driverId: '' })).s, 200);
  // failed delivery
  assert.equal((await act(dl2, { tid: o2.j.tid, act: 'claim' })).s, 200);
  assert.equal((await act(dl2, { tid: o2.j.tid, act: 'failed', note: 'Customer not answering' })).s, 200);
  assert.equal((await S.J('GET', T.u('/online/status/' + o2.j.tid))).j.status, 'failed');
  // password reset by staff, old password dies
  const rs = await S.J('POST', T.u('/cust/reset'), { phone: '01112223334' }, T.admin); assert.equal(rs.s, 200); assert.ok(rs.j.password);
  assert.equal((await S.J('GET', T.u('/cust/me'), undefined, tok)).s, 401, 'old session ends');
  assert.equal((await S.J('POST', T.u('/cust/login'), { phone: '01112223334', password: rs.j.password }, null, ip(11))).s, 200);
  // tenants are separate: this token means nothing at another venue
  const T2 = await S.tenant('operations'); assert.equal((await S.J('GET', T2.u('/cust/me'), undefined, tok)).s, 401);
  // account switched off: guests can order delivery
  await T.api('POST', '/settings', { online: { enabled: true, pickup: true, delivery: true, account: 'off', areas: [{ name: 'Nasr City', fee: 30 }] } });
  const a2 = (await T.api('GET', '/config', null, null)).j.settings.online.areas[0];
  assert.equal((await order({ ...base, areaId: a2.id }, null, 12)).s, 200);
});
