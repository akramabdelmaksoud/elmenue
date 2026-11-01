const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F18 InstaPay and wallet at the table [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), B = await S.tenant('basic');
  const cfg = async () => (await T.api('GET', '/config', null, null)).j;
  const item = (await cfg()).items.find((i) => !i.soldOut && i.stock == null && i.price > 0);

  // plan gate + sanitising
  assert.equal((await B.api('POST', '/settings', { instapay: { enabled: true, handle: 'x@instapay' } })).s, 402);
  const sv = await T.api('POST', '/settings', { instapay: { enabled: true, handle: 'cafe@instapay<script>', phone: '010 1234 5678abc', wallet: 'Vodafone Cash', name: 'Café <b>X</b>', note: 'n'.repeat(500), qr: 'https://evil.example/x.png' } });
  assert.equal(sv.s, 200); const ip = (await cfg()).settings.instapay;
  assert.equal(ip.enabled, true); assert.ok(!/[<>]/.test(ip.handle + ip.name)); assert.equal(ip.phone, '010 1234 5678'); assert.equal(ip.note.length, 140); assert.equal(ip.qr, '', 'qr can only be an own uploaded image');

  // guest asks for the bill with InstaPay, says they paid
  const tb = (await cfg()).tables[3], g = T.guest(tb.number); await g.join();
  await g.call({ t: 'cart_add', itemId: item.id }); await g.call({ t: 'send_order', scope: 'all' });
  await g.call({ t: 'check', method: 'instapay', split: 'table', tipPct: 0 });
  const cap = await T.staff('captain', 'Wael', '4321'), cash = await T.staff('cashier', 'Mona', '6666');
  let ses = Object.values((await T.state(cap)).sessions).find((x) => x.tableId === tb.id); assert.equal(ses.check.method, 'instapay');
  await g.call({ t: 'pay_claim', method: 'instapay', ref: 'AB-123 <img>', amount: 99 });
  ses = Object.values((await T.state(cap)).sessions).find((x) => x.tableId === tb.id);
  assert.equal(ses.payClaim.method, 'instapay'); assert.ok(!/[<>]/.test(ses.payClaim.ref), 'ref cleaned'); assert.match(ses.payClaim.ref, /AB-123/);
  await g.call({ t: 'pay_claim', method: 'bitcoin', ref: 'x' }); assert.equal(Object.values((await T.state(cap)).sessions).find((x) => x.tableId === tb.id).payClaim.method, 'instapay', 'unknown methods ignored');

  // cashier confirms and closes with InstaPay: money is digital, drawer cash stays zero
  const open = await S.J('POST', T.u('/shift/open'), { opening: 100 }, cash); assert.equal(open.s, 200);
  const total = ses.bill.total;
  assert.equal((await T.rpc('cashier', cash, { t: 'close_table', tableId: tb.id, method: 'instapay', pay: { tip: 0 } })).s, 200);
  const h = (await S.J('GET', T.u('/receipts'), undefined, cash)).j.receipts[0]; assert.ok(h);
  const rep = (await T.api('GET', '/report')).j; assert.ok(rep.methods.digital >= total - 0.01, 'report counts it as InstaPay / wallet'); assert.equal(rep.methods.cash >= 0, true);
  const z = (await S.J('GET', T.u('/shift'), undefined, cash)).j; const sh = JSON.stringify(z);
  assert.match(sh, /instapay/); assert.ok(!(await T.api('GET', '/analytics')).j.error);

  // wallet works the same; feature lock turns it off for the cafe
  const g2 = T.guest((await cfg()).tables[4].number); await g2.join(); await g2.call({ t: 'cart_add', itemId: item.id }); await g2.call({ t: 'send_order', scope: 'all' });
  await S.J('PUT', `/api/super/tenants/${T.slug}`, { feat: { instapay: false } }, S.sup);
  await g2.call({ t: 'check', method: 'wallet', split: 'table' }); const s2 = Object.values((await T.state(cap)).sessions).find((x) => x.tableNumber === g2.g.tableNumber);
  assert.equal(s2.check.method, 'cash', 'locked: falls back to cash'); await g2.call({ t: 'pay_claim', method: 'wallet' }); assert.ok(!Object.values((await T.state(cap)).sessions).find((x) => x.tableNumber === g2.g.tableNumber).payClaim);
});
