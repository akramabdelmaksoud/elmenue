const test = require('node:test'), assert = require('node:assert/strict');
const { start } = require('./helper');
const E = require('../eta');
const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

const cfg = { rin: '123456789', tradeName: 'Maison Test', branchCode: '0', governate: 'Cairo', city: 'Nasr City', street: 'Main', building: '1', deviceSerial: 'POS-1', activityCode: '5610' };
test('F3 serialization + uuid (ETA document serialization approach)', () => {
  assert.equal(E.serialize({ Name: 'abc', Amount: 0.0, Items: [{ Qty: 2 }, { Qty: 3 }] }), '"NAME""abc""AMOUNT""0""ITEMS""ITEMS""QTY""2""ITEMS""QTY""3"');   // JS prints 0.0 as 0 (documented limitation: send numbers exactly as serialized)
  const h = { items: [{ itemId: 'a', name: 'Burger', qty: 2, price: 100 }, { itemId: 'b', name: 'Cola', qty: 1, price: 30 }], discount: 23, service: 20.7, tax: 31.7, tip: 10, total: 258.4 - 0 + 10, method: 'cash', closedAt: Date.UTC(2026, 0, 5, 12, 0, 0, 500), taxRate: 14 };
  const d = E.buildReceipt(h, cfg, { receiptNumber: 'R0000001', previousUUID: '' });
  assert.equal(d.documentType.receiptType, 'SC'); assert.equal(d.documentType.typeVersion, '1.2'); assert.equal(d.header.dateTimeIssued, '2026-01-05T12:00:00Z'); assert.equal(d.header.previousUUID, '');
  assert.match(d.header.uuid, /^[0-9a-f]{64}$/); assert.equal(d.header.uuid, E.uuidOf(d), 'uuid reproducible'); assert.equal(d.itemData.length, 3, 'two dishes + service line');
  assert.equal(d.totalSales, 250.7); assert.equal(d.totalCommercialDiscount, 23); assert.equal(d.netAmount, 227.7); assert.equal(d.itemData.reduce((n, l) => n + (l.commercialDiscountData ? l.commercialDiscountData[0].amount : 0), 0), 23, 'discount fully allocated');
  assert.equal(r2(d.itemData.reduce((n, l) => n + l.total, 0)), r2(d.totalAmount)); assert.equal(d.totalAmount, 259.578);
  const d2 = E.buildReceipt(h, cfg, { receiptNumber: 'R0000002', previousUUID: d.header.uuid }); assert.notEqual(d2.header.uuid, d.header.uuid); assert.equal(d2.header.previousUUID, d.header.uuid, 'chain');
  const t = JSON.parse(JSON.stringify(d)); t.totalAmount = 1; assert.notEqual(E.uuidOf(t), d.header.uuid, 'any change alters the uuid');
  assert.ok(E.envOk('mock') && E.envOk('preprod') && !E.envOk('production'), 'production is refused');
});
test('F3 client against a fake gateway: login headers, batch, accepted / rejected / transient', async () => {
  const seen = []; const d = E.buildReceipt({ items: [{ itemId: 'a', name: 'X', qty: 1, price: 10 }], discount: 0, service: 0, tax: 1.4, tip: 0, total: 11.4, method: 'cash', closedAt: Date.now(), taxRate: 14 }, cfg, { receiptNumber: 'R1' });
  const f = async (url, o) => { seen.push([url, o]); if (url.endsWith('/connect/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'T' }) }; return { ok: true, status: 202, headers: { get: () => null }, json: async () => ({ submissionUUID: 'S', acceptedDocuments: [{ uuid: d.header.uuid, longId: 'L', receiptNumber: 'R1' }], rejectedDocuments: [] }) }; };
  const out = await E.submit({ ...cfg, clientId: 'c', clientSecret: 's', presharedKey: 'p' }, 'preprod', [d], f);
  assert.equal(out.accepted[0].longId, 'L'); assert.ok(seen[0][0].startsWith('https://id.preprod.eta.gov.eg/connect/token')); assert.equal(seen[0][1].headers.posserial, 'POS-1'); assert.ok(seen[0][1].body.includes('grant_type=client_credentials'));
  assert.equal(seen[1][0], 'https://api.preprod.invoicing.eta.gov.eg/api/v1/receiptsubmissions'); assert.equal(seen[1][1].headers.Authorization, 'Bearer T'); const sent = JSON.parse(seen[1][1].body); assert.equal(sent.receipts.length, 1); assert.equal(sent.signatures[0].signatureType, 'I');
  const down = async (url) => (url.endsWith('/connect/token') ? { ok: true, status: 200, json: async () => ({ access_token: 'T' }) } : { ok: false, status: 503, headers: { get: () => '7' }, json: async () => ({}) });
  await assert.rejects(E.submit(cfg, 'preprod', [d], down), (e) => e.retryable === true && e.retryAfter === 7);
  await assert.rejects(E.submit(cfg, 'preprod', [d], async () => { throw new Error('ECONNRESET'); }), (e) => e.retryable !== false);
});

for (const mode of ['ws', 'rpc']) test(`F3 e-receipt pipeline [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('operations', { demo: true }), B = await S.tenant('basic');
  const C = await T.staff('cashier', 'Mona', '7788'), T0 = Date.now();
  const st0 = (await T.rpc('cashier', C, null)).j.state, it = st0.config.items.find((x) => !x.soldOut);
  // ETA-01 off by default: sales create no queue; basic tier gated
  assert.equal(st0.config.settings.eta.enabled, false); assert.equal((await B.api('POST', '/settings', { eta: { enabled: true, env: 'mock' } })).s, 402); assert.equal((await B.api('GET', '/eta/queue')).s, 402);
  const sell = async (n, qty = 2) => { const g = T.guest(n, 'G' + n); await g.join(); await g.call({ t: 'cart_add', itemId: it.id }); if (qty > 1) await g.call({ t: 'cart_add', itemId: it.id }); await g.call({ t: 'send_order', scope: 'all' }); const s = Object.values((await T.rpc('cashier', C, null)).j.state.sessions).find((x) => x.tableNumber === n); await T.rpc('cashier', C, { t: 'close_table', tableId: s.tableId, method: 'cash', pay: { tip: 5, tendered: 9999 } }); return s.bill; };
  await sell(15); assert.equal((await T.api('GET', '/eta/queue')).j.items.length, 0, 'flag off -> nothing queued');
  // ETA-02 production refused; enabling needs registration details
  assert.equal((await T.api('POST', '/settings', { eta: { enabled: true, env: 'production' } })).s, 400); assert.equal((await T.api('POST', '/settings', { eta: { enabled: true, env: 'mock' } })).s, 400, 'no tax details yet');
  assert.equal((await T.api('POST', '/eta/config', { rin: '123456789', tradeName: 'Maison Test', clientSecret: 'TOP-SECRET', activityCode: '5610' })).s, 200);
  assert.ok(!JSON.stringify((await T.api('GET', '/eta/config')).j).includes('TOP-SECRET'), 'secret never returned'); assert.equal((await T.api('POST', '/settings', { eta: { enabled: true, env: 'mock' } })).s, 200);
  // ETA-03 sales now produce numbered, chained receipts matching the venue's bill
  const b1 = await sell(16), b2 = await sell(17, 1);
  let q = (await T.api('GET', '/eta/queue')).j; assert.equal(q.items.length, 2); const [n2, n1] = q.items; assert.deepEqual([n1.number, n2.number], ['R0000001', 'R0000002']); assert.ok(n1.recon && n2.recon, 'receipt totals reconcile with the bill');
  const exp = (await T.api('GET', '/eta/export.json')).j; assert.equal(exp.receipts.length, 2); assert.equal(exp.receipts[1].header.previousUUID, exp.receipts[0].header.uuid); assert.equal(exp.receipts[0].header.previousUUID, '');
  assert.ok(exp.receipts.every((d) => d.header.uuid === E.uuidOf(d)), 'every uuid verifies');
  assert.ok(Math.abs(exp.receipts[0].totalAmount - r2(b1.total)) <= 0.05, 'amount matches the bill (' + exp.receipts[0].totalAmount + ' vs ' + b1.total + ')');
  // ETA-04 mock down: retained with backoff, nothing lost; recovers; accepted once
  await T.api('POST', '/eta/config', { mockMode: 'down' }); let run = (await T.api('POST', '/eta/run')).j; assert.equal(run.stats.queued, 2); q = (await T.api('GET', '/eta/queue')).j; assert.ok(q.items.every((x) => x.tries === 1 && x.next > Date.now() && x.status === 'queued'));
  await T.api('POST', '/eta/config', { mockMode: 'ok' }); run = (await T.api('POST', '/eta/run')).j; assert.equal(run.sent, 0, 'not due yet (backoff respected)');
  // ETA-05 'send now' overrides the wait; once the service is back both receipts are accepted exactly once, in order
  run = (await T.api('POST', '/eta/run', { force: true })).j; assert.equal(run.stats.accepted, 2); assert.equal(run.stats.queued, 0); run = (await T.api('POST', '/eta/run', { force: true })).j; assert.equal(run.sent, 0, 'nothing is sent twice');
  // ETA-06 rejected receipt is kept and can be re-issued as a correction referencing the old one
  const T2 = await S.tenant('operations', { demo: true }); await T2.api('POST', '/eta/config', { rin: '1', tradeName: 'X', mockMode: 'reject' }); await T2.api('POST', '/settings', { eta: { enabled: true, env: 'mock' } });
  const C2 = await T2.staff('cashier', 'Z', '1357'), it2 = (await T2.rpc('cashier', C2, null)).j.state.config.items.find((x) => !x.soldOut); const g2 = T2.guest(14, 'R'); await g2.join(); await g2.call({ t: 'cart_add', itemId: it2.id }); await g2.call({ t: 'send_order', scope: 'all' });
  const s2 = Object.values((await T2.rpc('cashier', C2, null)).j.state.sessions).find((x) => x.tableNumber === 14); await T2.rpc('cashier', C2, { t: 'close_table', tableId: s2.tableId, method: 'card', pay: { tip: 0 } });
  await T2.api('GET', '/eta/queue'); let r2_ = (await T2.api('POST', '/eta/run')).j; assert.equal(r2_.stats.rejected, 1); let it_ = (await T2.api('GET', '/eta/queue')).j.items[0]; assert.equal(it_.status, 'rejected'); assert.ok(it_.error);
  await T2.api('POST', '/eta/config', { mockMode: 'ok' }); assert.equal((await T2.api('POST', `/eta/retry/${it_.id}`)).s, 200); r2_ = (await T2.api('POST', '/eta/run')).j; assert.equal(r2_.stats.accepted, 1); assert.equal(r2_.stats.superseded, 1);
  const fixed = (await T2.api('GET', '/eta/export.json')).j; assert.equal(fixed.receipts.length, 0, 'accepted receipts leave the manual-upload export');
  // ETA-07 accepted -> the till can print the QR / link; unknown sale -> not ready
  const hist = (await T2.api('GET', '/orders')).j.orders.filter((h) => h.closedAt >= T0); const rc = await S.J('GET', T2.u('/eta/receipt/' + hist[0].id), undefined, C2); assert.equal(rc.j.ready, true); assert.match(rc.j.url, /^https:\/\/invoicing\.eta\.gov\.eg\/receipts\/search\/[0-9a-f]{64}\/share\//); assert.ok(rc.j.qr.startsWith('data:image/png'));
  assert.equal((await S.J('GET', T2.u('/eta/receipt/nope'), undefined, C2)).j.ready, false);
  // ETA-08 isolation + authorisation: another venue / a guest cannot read the queue or the receipts
  assert.equal((await S.J('GET', B.u('/eta/queue'), undefined, T.admin)).s === 200, false); assert.equal((await S.J('GET', T.u('/eta/queue'))).s, 401); assert.equal((await S.J('GET', T.u('/eta/receipt/x'), undefined, '')).s, 401);
  // ETA-09 production stays blocked even if a client tries to force the env on an existing venue
  assert.equal((await T.api('POST', '/settings', { eta: { enabled: true, env: 'production' } })).s, 400); assert.equal((await T.api('GET', '/config')).j.settings.eta.env, 'mock');
});
