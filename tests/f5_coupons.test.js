const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const F = require('../features');
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// pure rules (CPN-05, CPN-06, CPN-07 time windows)
test('F5 pure rules', () => {
  const c = { active: true, kind: 'pct', value: 10, minSpend: 100, maxUses: 2, uses: 0, from: 0, to: 0 };
  assert.equal(F.couponCheck(c, 99, Date.now()).reason, 'min'); assert.equal(F.couponCheck(c, 200, Date.now()).amount, 20);
  assert.equal(F.couponCheck({ ...c, uses: 2 }, 200, Date.now()).reason, 'used'); assert.equal(F.couponCheck({ ...c, to: Date.now() - 1 }, 200, Date.now()).reason, 'expired');
  assert.equal(F.couponCheck({ ...c, from: Date.now() + 99999 }, 200, Date.now()).reason, 'notyet'); assert.equal(F.couponCheck({ ...c, active: false }, 200, Date.now()).reason, 'inactive');
  assert.equal(F.couponCheck({ ...c, kind: 'amt', value: 500 }, 200, Date.now()).amount, 200, 'amount capped at gross');
  const at = (h, m, d = 3) => new Date(2026, 0, 4 + d, h, m).getTime();   // 2026-01-07 is a Wednesday (3)
  const hh = { active: true, start: '16:00', end: '18:00', days: [3] };
  assert.ok(F.offerLive(hh, at(16, 0))); assert.ok(F.offerLive(hh, at(17, 59))); assert.ok(!F.offerLive(hh, at(18, 0))); assert.ok(!F.offerLive(hh, at(15, 59))); assert.ok(!F.offerLive(hh, at(17, 0, 4)), 'wrong weekday');
  assert.ok(F.offerLive({ active: true, start: '22:00', end: '02:00' }, at(23, 30)) && F.offerLive({ active: true, start: '22:00', end: '02:00' }, at(1, 0)), 'overnight');
  assert.ok(!F.offerLive({ ...hh, active: false }, at(17, 0)));
  assert.deepEqual(F.promoPick({ manual: 10, coupon: 30, offer: 20, stack: false, gross: 100 }), { manual: 0, coupon: 30, offer: 0, total: 30 }, 'no stacking -> best only');
  assert.equal(F.promoPick({ manual: 10, coupon: 30, offer: 20, stack: true, gross: 100 }).total, 60); assert.equal(F.promoPick({ manual: 50, coupon: 50, offer: 20, stack: true, gross: 100 }).total, 100, 'stack capped at gross');
});

for (const mode of ['ws', 'rpc']) test(`F5 coupons/offers/gifts [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { demo: true }), O = await S.tenant('operations'), B = await S.tenant('basic');
  const C = await T.staff('cashier', 'Mona', '77887788');
  // CPN-01 off by default: a code does nothing, no discount
  const g = T.guest(15, 'Karim'); let st = (await g.join()).j.state; const cfg = st.config; const it = cfg.items.find((x) => x.name === 'Rack of Lamb');
  assert.equal(cfg.settings.promo.enabled, false);
  await T.api('POST', '/coupons', { code: 'WELCOME10', kind: 'pct', value: 10 });
  await g.call({ t: 'cart_add', itemId: it.id }); await g.call({ t: 'cart_add', itemId: it.id });
  let s = (await g.call({ t: 'send_order', scope: 'all' })).j.state.session; const gross = r2(2 * it.price);
  s = (await g.call({ t: 'coupon_apply', code: 'WELCOME10' })).j.state.session; assert.ok(!s.coupon && s.bill.discount === 0, 'flag off -> nothing applied');
  // CPN-02 tier gating: basic -> 402 on settings + CRUD
  assert.equal((await B.api('POST', '/settings', { promo: { enabled: true } })).s, 402); assert.equal((await B.api('POST', '/coupons', { code: 'ABC', kind: 'pct', value: 5 })).s, 402); assert.equal((await B.api('POST', '/gifts', { amount: 50 })).s, 402);
  assert.equal((await O.api('POST', '/coupons', { code: 'OPS5', kind: 'pct', value: 5 })).s, 200); assert.equal((await O.api('POST', '/gifts', { amount: 50 }, undefined)).s, 402, 'gift cards are VIP only');
  assert.equal((await T.api('POST', '/settings', { promo: { enabled: true, stack: false } })).s, 200);
  // CPN-03 validation + unique codes + guest-unusable bad codes
  assert.equal((await T.api('POST', '/coupons', { code: 'welcome10', kind: 'pct', value: 5 })).s, 409, 'duplicate (case-insensitive)'); assert.equal((await T.api('POST', '/coupons', { code: 'X', kind: 'pct', value: 5 })).s, 400); assert.equal((await T.api('POST', '/coupons', { code: 'ZERO', kind: 'pct', value: 0 })).s, 400);
  assert.equal((await g.call({ t: 'coupon_apply', code: 'NOPE' })).j.state.session.coupon || null, null);
  // CPN-04 applying: discount off gross first, then service + tax on net
  s = (await g.call({ t: 'coupon_apply', code: ' welcome10 ' })).j.state.session; const b = s.bill, st0 = (await g.join()).j.state.config.settings;
  const disc = r2(gross * 0.1), net = r2(gross - disc), sv = r2(net * st0.service / 100), tx = r2((net + sv) * st0.tax / 100);
  assert.equal(b.discount, disc); assert.equal(b.net, net); assert.equal(b.service, sv); assert.equal(b.tax, tx); assert.equal(b.total, r2(net + sv + tx)); assert.equal(b.couponCode, 'WELCOME10');
  // CPN-05 min spend / max uses / expiry enforced
  const mx = (await T.api('POST', '/coupons', { code: 'BIG', kind: 'amt', value: 50, minSpend: gross + 1000 })).j; s = (await g.call({ t: 'coupon_apply', code: 'BIG' })).j.state.session; assert.equal(s.coupon, 'WELCOME10', 'min spend not met -> previous coupon stays');
  await T.api('POST', '/coupons', { code: 'ONCE', kind: 'amt', value: 5, maxUses: 1 }); await T.api('POST', '/coupons', { code: 'OLD', kind: 'pct', value: 50, to: new Date(Date.now() - 86400000).toISOString() });
  s = (await g.call({ t: 'coupon_apply', code: 'OLD' })).j.state.session; assert.equal(s.coupon, 'WELCOME10', 'expired refused');
  // CPN-06 stacking off: coupon vs manual discount -> the bigger one only
  const tb = Object.values((await T.rpc('cashier', C, null)).j.state.sessions).find((x) => x.tableNumber === 15);
  await T.rpc('cashier', C, { t: 'discount', tableId: tb.tableId, type: 'pct', value: 15, reason: 'vip' });
  s = (await g.call(null)).j.state.session; assert.equal(s.bill.discount, r2(gross * 0.15), 'manual 15% beats coupon 10%'); assert.equal(s.bill.couponCode, '');
  assert.equal((await T.api('POST', '/settings', { promo: { enabled: true, stack: true } })).s, 200);
  s = (await g.call(null)).j.state.session; assert.equal(s.bill.discount, r2(gross * 0.25), 'stack on: 15% + 10%');
  assert.equal((await T.api('POST', '/settings', { promo: { enabled: true, stack: false } })).s, 200);
  await T.rpc('cashier', C, { t: 'discount', tableId: tb.tableId, type: 'pct', value: 0 });
  // CPN-07 timed offers: live now vs not; guests can read live ones; applied automatically
  const d = new Date(), hm = (x) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
  const live = (await T.api('POST', '/offers', { name: 'Happy hour', kind: 'pct', value: 30, start: '00:00', end: '23:59' })).j; assert.ok(live.id);
  const dead = (await T.api('POST', '/offers', { name: 'Never', kind: 'pct', value: 90, days: [(d.getDay() + 3) % 7] })).j;
  const pub = (await S.J('GET', T.u('/offers'))).j.offers; assert.deepEqual(pub.map((o) => o.name), ['Happy hour'], 'only live offers, no codes');
  s = (await g.call(null)).j.state.session; assert.equal(s.bill.discount, r2(gross * 0.3), 'offer 30% beats coupon 10%'); assert.equal(s.bill.offerName, 'Happy hour');
  assert.equal((await T.api('PUT', `/offers/${live.id}`, { active: false })).s, 200); s = (await g.call(null)).j.state.session; assert.equal(s.bill.offerName, '', 'paused offer stops at once'); assert.equal(s.bill.discount, disc);
  // CPN-08 remove coupon
  s = (await g.call({ t: 'coupon_remove' })).j.state.session; assert.equal(s.bill.discount, 0);
  // CPN-09 gift card: only server-made, unguessable, staff-sold
  assert.equal((await S.J('POST', T.u('/gifts'), { amount: 100 })).s, 401, 'guests cannot mint cards');
  const gift = (await S.J('POST', T.u('/gifts'), { amount: 100, buyer: 'Sara' }, C)).j; assert.match(gift.code, /^GC-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.equal(gift.balance, 100);
  const other = (await S.J('POST', T.u('/gifts'), { amount: 10 }, C)).j; assert.notEqual(other.code, gift.code);
  assert.equal((await S.J('POST', T.u('/gifts/check'), { code: 'GC-AAAA-AAAA-AAAA' }, C)).j.valid, false); assert.equal((await S.J('POST', T.u('/gifts/check'), { code: gift.code.toLowerCase() }, C)).j.balance, 100);
  // CPN-10 gift reduces what is due; partial balance carries over
  s = (await g.call({ t: 'gift_apply', code: gift.code })).j.state.session; const b2 = s.bill; assert.equal(b2.gift, Math.min(100, b2.total)); assert.equal(b2.due, r2(b2.total - b2.gift));
  assert.equal((await T.rpc('cashier', C, { t: 'close_table', tableId: tb.tableId, method: 'cash', pay: { tip: 0, tendered: 9999 } })).s, 200);
  const after = (await S.J('POST', T.u('/gifts/check'), { code: gift.code }, C)).j; assert.equal(after.balance, r2(100 - b2.gift), 'balance debited exactly once');
  // CPN-11 usage recorded only for paid bills; report + liability
  const rep = (await T.api('GET', '/promo/report')).j; assert.equal(rep.giftRedeemed, b2.gift); assert.equal(rep.giftLiability, r2(after.balance + 10));
  // CPN-12 gift card reuse: an empty card cannot be applied; a coupon at maxUses stops working
  const g2 = T.guest(16, 'Nour'); await g2.join(); await g2.call({ t: 'cart_add', itemId: it.id }); await g2.call({ t: 'send_order', scope: 'all' });
  if (after.balance === 0) assert.equal((await g2.call({ t: 'gift_apply', code: gift.code })).j.state.session.gift || null, null);
  s = (await g2.call({ t: 'coupon_apply', code: 'ONCE' })).j.state.session; assert.equal(s.coupon, 'ONCE');
  const tb2 = Object.values((await T.rpc('cashier', C, null)).j.state.sessions).find((x) => x.tableNumber === 16);
  await T.rpc('cashier', C, { t: 'close_table', tableId: tb2.tableId, method: 'card', pay: { tip: 0 } });
  const cp = (await T.api('GET', '/coupons')).j.coupons.find((c) => c.code === 'ONCE'); assert.equal(cp.uses, 1);
  const g3 = T.guest(17, 'Omar'); await g3.join(); await g3.call({ t: 'cart_add', itemId: it.id }); await g3.call({ t: 'send_order', scope: 'all' });
  assert.equal((await g3.call({ t: 'coupon_apply', code: 'ONCE' })).j.state.session.coupon || null, null, 'single-use coupon refused the second time');
  // CPN-13 staff attach codes at the till; unpaid closes never burn a coupon / gift
  const tb3 = Object.values((await T.rpc('cashier', C, null)).j.state.sessions).find((x) => x.tableNumber === 17);
  await T.rpc('cashier', C, { t: 'promo_set', tableId: tb3.tableId, coupon: 'welcome10', gift: other.code });
  s = Object.values((await T.rpc('cashier', C, null)).j.state.sessions).find((x) => x.tableNumber === 17); assert.equal(s.bill.couponCode, 'WELCOME10'); assert.equal(s.bill.gift, Math.min(10, s.bill.total));
  await T.rpc('cashier', C, { t: 'close_table', tableId: tb3.tableId, unpaid: true });
  assert.equal((await S.J('POST', T.u('/gifts/check'), { code: other.code }, C)).j.balance, 10, 'unpaid does not spend the gift');
  assert.equal((await T.api('GET', '/coupons')).j.coupons.find((c) => c.code === 'WELCOME10').uses || 0, 0, 'removed on table 15 and unpaid on table 17 -> never counted');
  // CPN-14 isolation: another venue never sees these coupons / gifts
  assert.deepEqual((await O.api('GET', '/coupons')).j.coupons.map((c) => c.code), ['OPS5']); assert.equal((await S.J('POST', O.u('/gifts/check'), { code: gift.code }, O.admin)).s, 402);
});
