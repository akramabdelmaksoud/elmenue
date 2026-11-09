const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F21 accounting export [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), B = await S.tenant('basic');
  const cfg = async () => (await T.api('GET', '/config', null, null)).j;
  const item = (await cfg()).items.find((i) => !i.soldOut && i.stock == null && i.price > 0 && !(i.options || []).some((o) => o.required));
  assert.equal((await B.api('GET', '/accounting')).s, 402); assert.equal((await B.api('GET', '/accounting.csv')).s, 402);

  const cap = await T.staff('captain', 'Wael', '43214321'), cash = await T.staff('cashier', 'Mona', '66666666');
  assert.equal((await S.J('POST', T.u('/shift/open'), { opening: 100 }, cash)).s, 200);
  const sell = async (n, method, body = {}) => {
    const tb = (await cfg()).tables[n], g = T.guest(tb.number); await g.join();
    await g.call({ t: 'cart_add', itemId: item.id }); await g.call({ t: 'cart_add', itemId: item.id }); await g.call({ t: 'send_order', scope: 'all' });
    await g.call({ t: 'check', method: method === 'cash' ? 'cash' : method, split: 'table', tipPct: 0 });
    assert.equal((await T.rpc('cashier', cash, { t: 'close_table', tableId: tb.id, method, pay: { tip: 0, ...body } })).s, 200);
  };
  const base0 = (await T.api('GET', '/accounting')).j.total; // the demo café comes with sales history
  await sell(0, 'cash'); await sell(1, 'card'); await sell(2, 'instapay');

  const a = (await T.api('GET', '/accounting')).j; assert.ok(a.rows.length >= 1);
  const tot = a.total; assert.equal(tot.orders - base0.orders, 3);
  assert.ok(tot.cash > base0.cash && tot.card > base0.card && tot.instapay > base0.instapay, 'each method is separated');
  assert.ok(Math.abs(tot.cash + tot.card + tot.instapay + tot.wallet + tot.online + tot.gift - tot.total) < 0.05, 'methods add up to the total collected');
  assert.ok(Math.abs(tot.net + tot.service + tot.vat + tot.tips - tot.total) < 0.05, 'net + service + VAT + tips = total');
  const csv = await fetch(S.base + T.u('/accounting.csv'), { headers: { Authorization: 'Bearer ' + T.admin } });
  assert.equal(csv.status, 200); assert.match(await csv.text(), /Date,Orders,Guests,Gross sales/); assert.ok(csv.headers.get('content-type').startsWith('text/csv'));
  const x = await fetch(S.base + T.u('/accounting.xlsx?token=' + T.admin)); assert.equal(x.status, 200); assert.equal(Buffer.from(await x.arrayBuffer()).slice(0, 2).toString(), 'PK', 'a real xlsx file');

  // plan lock
  await S.J('PUT', `/api/super/tenants/${T.slug}`, { feat: { acctexport: false } }, S.sup);
  assert.equal((await T.api('GET', '/accounting')).s, 402);
});
