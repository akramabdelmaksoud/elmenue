const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
for (const mode of ['ws', 'rpc']) test(`F29 invoices and supplier purchase orders [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { demo: true }), B = await S.tenant('basic');
  assert.equal((await B.api('GET', '/invoices')).s, 402); assert.equal((await B.api('GET', '/suppliers')).s, 402);

  // letterhead is cleaned, and numbers are gapless and never reused
  const br = await T.api('PUT', '/invoice-brand', { tradeName: 'Cafe <b>Nile</b>', taxId: '123-456', style: 'modern', accent: '#112233', lang: 'both', paper: 'A5', prefix: 'NL-' });
  assert.equal(br.s, 200); assert.ok(!/[<>]/.test(br.j.tradeName)); assert.equal(br.j.style, 'modern'); assert.equal((await T.api('PUT', '/invoice-brand', { style: 'evil', accent: 'red;x' })).j.style, 'classic');
  await T.api('PUT', '/invoice-brand', { tradeName: 'Cafe Nile', prefix: 'NL-', style: 'modern', accent: '#112233' });
  assert.equal((await T.api('POST', '/invoices', { lines: [{ desc: 'x', qty: 1, price: 5 }] })).s, 400, 'needs a recipient');
  assert.equal((await T.api('POST', '/invoices', { to: { name: 'Acme' }, lines: [] })).s, 400);
  const i1 = (await T.api('POST', '/invoices', { to: { name: 'Acme Ltd', taxId: '99' }, lines: [{ desc: 'Catering', qty: 2, price: 50 }], taxPct: 14, discount: 10 })).j;
  assert.match(i1.no, /^NL-/); assert.equal(i1.sub, 100); assert.equal(i1.total > 100, true);
  const i2 = (await T.api('POST', '/invoices', { to: { name: 'Bob' }, lines: [{ desc: 'Lunch', qty: 1, price: 30 }], proforma: true })).j; assert.equal(i2.kind, 'proforma');
  assert.notEqual(i1.no, i2.no);
  assert.equal((await T.api('POST', `/invoices/${i1.id}/void`, { reason: 'wrong customer' })).s, 200);
  const list = (await T.api('GET', '/invoices')).j.invoices; assert.equal(list.find((x) => x.id === i1.id).status, 'void'); assert.equal(list.length, 2);
  assert.equal((await T.api('GET', '/invoices?q=bob')).j.invoices.length, 1);
  assert.equal((await T.api('GET', `/invoices/${i2.id}`)).j.doc.no, i2.no);
  const i3 = (await T.api('POST', '/invoices', { to: { name: 'C' }, lines: [{ desc: 'y', qty: 1, price: 1 }] })).j; assert.notEqual(i3.no, i1.no, 'a cancelled number is not reused');

  // an invoice from a paid order
  const src = (await T.api('GET', '/invoice-source')).j.orders; assert.ok(src.length > 0, 'demo has paid orders');
  const o = src.find((x) => !x.invoiced), fo = await T.api('POST', '/invoices', { fromOrder: o.id, to: { name: 'Contoso' } }); assert.equal(fo.s, 200); assert.equal(fo.j.ref, o.id);
  assert.equal((await T.api('POST', '/invoices', { fromOrder: o.id, to: { name: 'Contoso' } })).s, 400, 'one live invoice per order');

  // suppliers, ingredient link, reorder suggestion, PO, partial and full receipt
  const sp = (await T.api('POST', '/suppliers', { name: 'Fresh Farms', phone: '010' })).j; assert.ok(sp.id);
  const ing = (await T.api('POST', '/ingredients', { name: 'Milk', unit: 'ml', stock: 100, cost: 0.02, low: 500 })).j;
  assert.equal((await T.api('PUT', `/ingredients/${ing.id}`, { par: 5000, supplier: sp.id })).s, 200);
  const sug = (await T.api('GET', '/pos/suggest')).j.groups; const g = sug.find((x) => x.supplier === sp.id); assert.ok(g, 'low stock is suggested'); assert.equal(g.lines[0].qty, 4900);
  const po = (await T.api('POST', '/pos', { supplier: sp.id, lines: g.lines.map((l) => ({ ing: l.ing, desc: l.desc, unit: l.unit, qty: l.qty, price: 0.03 })) })).j; assert.equal(po.status, 'draft');
  assert.equal((await T.api('GET', '/pos/suggest')).j.groups.find((x) => x.supplier === sp.id), undefined, 'already on order');
  assert.equal((await T.api('PUT', `/pos/${po.id}`, { status: 'sent' })).j.status, 'sent');
  const r1 = await T.api('POST', `/pos/${po.id}/receive`, { got: [{ i: 0, qty: 1000 }] }); assert.equal(r1.j.status, 'partial');
  let cur = (await T.api('GET', '/ingredients')).j.ingredients.find((x) => x.id === ing.id); assert.equal(cur.stock, 1100); assert.equal(cur.cost, 0.03, 'cost follows the price paid');
  assert.equal((await T.api('POST', `/pos/${po.id}/receive`, {})).j.status, 'received');
  cur = (await T.api('GET', '/ingredients')).j.ingredients.find((x) => x.id === ing.id); assert.equal(cur.stock, 5000);
  assert.equal((await T.api('POST', `/pos/${po.id}/receive`, {})).s, 400);
  assert.equal((await T.api('PUT', `/pos/${po.id}`, { paid: true, billNo: 'B-7' })).j.paid, true);
  assert.equal((await T.api('GET', `/invoices/${po.id}`)).j.doc.kind, 'po');
});
