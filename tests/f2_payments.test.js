const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const P = require('../payments');
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// PAY: the documented Paymob HMAC (SHA-512 over the listed fields, alphabetical order) - verification must be exact
test('F2 paymob hmac', () => {
  const obj = { amount_cents: 25000, created_at: '2026-01-01T10:00:00.000000', currency: 'EGP', error_occured: false, has_parent_transaction: false, id: 123456, integration_id: 4001, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 987, merchant_order_id: 'pi_x' }, owner: 55, pending: false, source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, success: true };
  const concat = '25000' + '2026-01-01T10:00:00.000000' + 'EGP' + 'false' + 'false' + '123456' + '4001' + 'true' + 'false' + 'false' + 'false' + 'true' + 'false' + '987' + '55' + 'false' + '2346' + 'MasterCard' + 'card' + 'true';
  const want = require('crypto').createHmac('sha512', 'secret').update(concat).digest('hex');
  assert.equal(P.paymobHmac(obj, 'secret'), want); assert.ok(P.verifyPaymob(obj, want, 'secret')); assert.ok(P.verifyPaymob(obj, want.toUpperCase(), 'secret'));
  assert.ok(!P.verifyPaymob(obj, want, 'other')); assert.ok(!P.verifyPaymob({ ...obj, amount_cents: 100 }, want, 'secret'), 'tampered amount'); assert.ok(!P.verifyPaymob(obj, '', 'secret')); assert.ok(!P.verifyPaymob(obj, want, ''));
  const o = P.paymobOutcome(obj); assert.deepEqual([o.paid, o.amount, o.intent], [true, 250, 'pi_x']); assert.equal(P.paymobOutcome({ ...obj, is_refunded: true }).paid, false); assert.equal(P.paymobOutcome({ ...obj, pending: true }).paid, false); assert.equal(P.paymobOutcome({ ...obj, success: false }).failed, true);
});
test('F2 paymob order registration (mocked network)', async () => {
  const calls = []; const fake = async (url, o) => { const b = JSON.parse(o.body); calls.push([url.replace('https://accept.paymob.com', ''), b]); return { ok: true, json: async () => (url.endsWith('/tokens') ? { token: 'AT' } : url.endsWith('/orders') ? { id: 77 } : { token: 'PK' }) }; };
  const out = await P.paymobCreate({ apiKey: 'K', integrationId: '4001', iframeId: '888' }, { amount: 125.5, intent: 'pi_1' }, fake);
  assert.deepEqual(calls.map((c) => c[0]), ['/api/auth/tokens', '/api/ecommerce/orders', '/api/acceptance/payment_keys']); assert.equal(calls[1][1].amount_cents, '12550'); assert.equal(calls[1][1].merchant_order_id, 'pi_1'); assert.equal(calls[2][1].integration_id, 4001);
  assert.equal(out.url, 'https://accept.paymob.com/api/acceptance/iframes/888?payment_token=PK'); assert.equal(out.ref, '77');
});

for (const mode of ['ws', 'rpc']) test(`F2 online payments [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), B = await S.tenant('basic'), O = await S.tenant('operations');
  const C = await T.staff('cashier', 'Mona', '7788'), T0 = Date.now();
  const g = T.guest(15, 'Karim'); const st = (await g.join()).j.state; const it = st.config.items.find((x) => x.name === 'Rack of Lamb');
  const intent = (b, base = T) => S.J('POST', base.u('/pay/intent'), { tableNumber: 15, guestId: g.g.guestId, ...b });
  await g.call({ t: 'cart_add', itemId: it.id }); await g.call({ t: 'cart_add', itemId: it.id }); await g.call({ t: 'send_order', scope: 'all' });
  // PAY-01 off by default
  assert.equal(st.config.settings.onlinePay.enabled, false); assert.equal((await intent({ scope: 'table' })).s, 402);
  // PAY-02 tier gating
  assert.equal((await B.api('POST', '/settings', { onlinePay: { enabled: true, provider: 'sandbox' } })).s, 402); assert.equal((await B.api('GET', '/pay/config')).s, 402);
  // PAY-03 paymob cannot be enabled without keys; keys are masked and never in the public config
  assert.equal((await T.api('POST', '/settings', { onlinePay: { enabled: true, provider: 'paymob' } })).s, 400);
  assert.equal((await T.api('POST', '/pay/config', { apiKey: 'API-SECRET-123', hmac: 'HMAC-SECRET-XYZ', integrationId: '4001', iframeId: '888' })).s, 200);
  const cj = (await T.api('GET', '/pay/config')).j; assert.ok(!JSON.stringify(cj).includes('API-SECRET-123') && !JSON.stringify(cj).includes('HMAC-SECRET-XYZ'), 'secrets never returned'); assert.equal((await T.api('POST', '/pay/config', { integrationId: 'abc' })).s, 400);
  assert.ok(!JSON.stringify((await g.join()).j.state.config).includes('HMAC-SECRET'), 'secrets not in guest config');
  // PAY-04 sandbox flow: amount comes from the server, ignores what the browser claims
  assert.equal((await T.api('POST', '/settings', { onlinePay: { enabled: true, provider: 'sandbox' } })).s, 200);
  let s = (await g.call(null)).j.state.session; const due0 = s.bill.due, gross = r2(2 * it.price);
  let r = await intent({ scope: 'table', tipPct: 10, amount: 1 }); assert.equal(r.s, 200); assert.equal(r.j.base, due0); assert.equal(r.j.amount, r2(due0 + r2(due0 * 0.1)), 'amount = server bill + tip, not client amount');
  assert.equal((await S.J('GET', T.u('/pay/intent/' + r.j.id))).j.status, 'pending');
  // PAY-05 unknown intent / wrong table key
  assert.equal((await S.J('POST', T.u('/pay/webhook/paymob'), { obj: {} })).s, 401, 'no signature -> refused'); assert.equal((await S.J('POST', T.u('/pay/sandbox/pi_nope/complete'), { ok: true })).s, 404);
  // PAY-06 decline leaves the bill unpaid; the guest can retry
  const bad = await S.J('POST', T.u('/pay/sandbox/' + r.j.id + '/complete'), { ok: false }); assert.equal(bad.j.status, 'failed'); s = (await g.call(null)).j.state.session; assert.equal(s.bill.due, due0, 'declined -> still owed');
  // PAY-07 successful payment closes the table, once; the webhook replay does nothing
  r = await intent({ scope: 'table', tipPct: 10 }); const ok = await S.J('POST', T.u('/pay/sandbox/' + r.j.id + '/complete'), { ok: true }); assert.equal(ok.j.status, 'paid');
  const again = await S.J('POST', T.u('/pay/sandbox/' + r.j.id + '/complete'), { ok: true }); assert.equal(again.j.dup, true);
  const rowsOf = async (n) => (await T.api('GET', '/orders')).j.orders.filter((h) => h.tableNumber === n && h.closedAt >= T0);
  let rows = await rowsOf(15); assert.equal(rows.length, 1, 'exactly one sale recorded'); const h = rows[0];
  assert.equal(h.method, 'online'); assert.equal(h.tip, r2(due0 * 0.1)); assert.equal(h.pay.cash, 0); assert.equal(h.pay.online, h.total, 'online covers the whole bill incl. tip'); assert.equal(h.total, r2(due0 + h.tip));
  assert.equal(Object.values((await T.rpc('cashier', C, null)).j.state.sessions).some((x) => x.tableNumber === 15), false, 'table cleared');
  // PAY-08 split bills: two guests pay their own shares online, the last share closes the table
  const a = T.guest(16, 'Ana'), b2 = T.guest(16, 'Bo'); await a.join(); await b2.join(); await a.call({ t: 'cart_add', itemId: it.id }); await b2.call({ t: 'cart_add', itemId: it.id }); await b2.call({ t: 'cart_add', itemId: it.id });
  await a.call({ t: 'send_order', scope: 'all' });
  const pay16 = (gu, body) => S.J('POST', T.u('/pay/intent'), { tableNumber: 16, guestId: gu.g.guestId, ...body });
  let s2 = (await a.call(null)).j.state.session; const mineA = s2.bill.byGuest[a.g.guestId].total;
  const ia = await pay16(a, { scope: 'mine' }); assert.equal(ia.j.amount, mineA); await S.J('POST', T.u('/pay/sandbox/' + ia.j.id + '/complete'), { ok: true });
  s2 = (await a.call(null)).j.state.session; assert.equal(s2.bill.due, r2(s2.bill.total - mineA), 'one share paid, table still open'); assert.equal((await rowsOf(16)).length, 0);
  assert.equal((await pay16(a, { scope: 'mine' })).s, 400, 'a guest who already paid has nothing left');
  const ib = await pay16(b2, { scope: 'mine' }); assert.equal(ib.j.amount, s2.bill.due, 'last share = remainder (no rounding drift)'); await S.J('POST', T.u('/pay/sandbox/' + ib.j.id + '/complete'), { ok: true });
  rows = await rowsOf(16); assert.equal(rows.length, 1); assert.equal(rows[0].pay.online, rows[0].total); assert.ok(Math.abs(mineA + ib.j.amount - rows[0].total) < 0.011);
  // PAY-09 partial online + cashier collects the rest in cash
  const c3 = T.guest(17, 'Cy'); await c3.join(); await c3.call({ t: 'cart_add', itemId: it.id }); await c3.call({ t: 'cart_add', itemId: it.id }); await c3.call({ t: 'send_order', scope: 'all' });
  const i3 = await S.J('POST', T.u('/pay/intent'), { tableNumber: 17, guestId: c3.g.guestId, scope: 'custom', amount: 100 }); assert.equal(i3.j.amount, 100); await S.J('POST', T.u('/pay/sandbox/' + i3.j.id + '/complete'), { ok: true });
  let sess = Object.values((await T.rpc('cashier', C, null)).j.state.sessions).find((x) => x.tableNumber === 17); assert.equal(sess.bill.due, r2(sess.bill.total - 100));
  await T.rpc('cashier', C, { t: 'close_table', tableId: sess.tableId, method: 'cash', pay: { tip: 0, tendered: 9999 } });
  rows = await rowsOf(17); assert.equal(rows[0].pay.online, 100); assert.equal(rows[0].pay.cash, r2(rows[0].total - 100)); assert.equal(rows[0].method, 'cash');
  // PAY-10 report totals include the online column
  const rep = (await T.api('GET', '/analytics?days=7')).j; assert.ok(rep.revenue.online >= 100, 'analytics online column');
  // PAY-11 paymob webhook: signed vs forged vs wrong amount vs replay vs money after the table was cleared
  assert.equal((await T.api('POST', '/settings', { onlinePay: { enabled: true, provider: 'paymob' } })).s, 200);
  const d4 = T.guest(18, 'Di'); await d4.join(); await d4.call({ t: 'cart_add', itemId: it.id }); await d4.call({ t: 'send_order', scope: 'all' });
  const mk = (id, amount, extra = {}) => ({ type: 'TRANSACTION', obj: { amount_cents: Math.round(amount * 100), created_at: '2026-01-01T10:00:00', currency: 'EGP', error_occured: false, has_parent_transaction: false, id: 5000 + Math.floor(Math.random() * 1000), integration_id: 4001, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 1, merchant_order_id: id }, owner: 1, pending: false, source_data: { pan: '2346', sub_type: 'Visa', type: 'card' }, success: true, ...extra } });
  const send = (body, key) => S.J('POST', T.u('/pay/webhook/paymob?hmac=' + P.paymobHmac(body.obj, key)), body);
  const net = await S.J('POST', T.u('/pay/intent'), { tableNumber: 18, guestId: d4.g.guestId, scope: 'table' }); assert.equal(net.s, 502, 'provider unreachable -> friendly error, nothing recorded as paid');
  // intents are created through the sandbox path here; the Paymob callback carries the intent id in merchant_order_id, exactly as in production
  assert.equal((await T.api('POST', '/settings', { onlinePay: { enabled: true, provider: 'sandbox' } })).s, 200);
  const i4 = await S.J('POST', T.u('/pay/intent'), { tableNumber: 18, guestId: d4.g.guestId, scope: 'table' }); assert.equal(i4.s, 200);
  const body = mk(i4.j.id, i4.j.amount);
  assert.equal((await S.J('POST', T.u('/pay/webhook/paymob?hmac=deadbeef'), body)).s, 401, 'forged signature refused'); assert.equal((await S.J('POST', T.u('/pay/webhook/paymob'), body)).s, 401, 'missing signature refused');
  const wrong = mk(i4.j.id, i4.j.amount - 10); assert.equal((await send(wrong, 'HMAC-SECRET-XYZ')).j.status, 'mismatch', 'amount differs from the intent -> not paid');
  assert.equal(Object.values((await T.rpc('cashier', C, null)).j.state.sessions).some((x) => x.tableNumber === 18), true, 'still open after mismatch');
  const i5 = await S.J('POST', T.u('/pay/intent'), { tableNumber: 18, guestId: d4.g.guestId, scope: 'table' }); const good = mk(i5.j.id, i5.j.amount);
  const [w1, w2] = await Promise.all([send(good, 'HMAC-SECRET-XYZ'), send(good, 'HMAC-SECRET-XYZ')]);
  assert.ok([w1.s, w2.s].every((x) => x === 200 || x === 409), 'busy retry allowed ' + w1.s + ' ' + w2.s + JSON.stringify([w1.j, w2.j])); if (w1.s !== 200 || w2.s !== 200) await send(good, 'HMAC-SECRET-XYZ');
  assert.equal((await rowsOf(18)).length, 1, 'two simultaneous webhooks -> one sale'); assert.equal((await rowsOf(18))[0].method, 'online');
  assert.equal((await send(good, 'HMAC-SECRET-XYZ')).j.dup, true, 'replay is a no-op');
  // late money: intent made, table cleared by the cashier, then the payment lands
  const e6 = T.guest(14, 'Eve'); await e6.join(); await e6.call({ t: 'cart_add', itemId: it.id }); await e6.call({ t: 'send_order', scope: 'all' });
  const i6 = await S.J('POST', T.u('/pay/intent'), { tableNumber: 14, guestId: e6.g.guestId, scope: 'table' }); const s6 = Object.values((await T.rpc('cashier', C, null)).j.state.sessions).find((x) => x.tableNumber === 14);
  await T.rpc('cashier', C, { t: 'close_table', tableId: s6.tableId, method: 'cash', pay: { tip: 0, tendered: 9999 } });
  assert.equal((await send(mk(i6.j.id, i6.j.amount), 'HMAC-SECRET-XYZ')).j.status, 'paid_unmatched'); assert.ok((await T.api('GET', '/pay/intents')).j.intents.some((x) => x.status === 'paid_unmatched'), 'owner can see it'); assert.equal((await rowsOf(14)).length, 1, 'no second sale');
  // PAY-12 isolation: another venue cannot confirm this venue's intent, and cannot see its intents
  assert.equal((await S.J('POST', O.u('/pay/webhook/paymob?hmac=' + P.paymobHmac(good.obj, 'x')), good)).s, 401); assert.equal((await O.api('GET', '/pay/intents')).j.intents.length, 0);
  assert.equal((await S.J('GET', O.u('/pay/intent/' + i6.j.id))).j.status, 'unknown');
});
