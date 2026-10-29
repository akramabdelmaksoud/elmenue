// Egyptian Tax Authority (ETA) e-receipt support: receipt builder, document serialization / UUID, submission client.
// Written from the public ETA SDK pages (sdk.invoicing.eta.gov.eg): Coffee & Restaurant Receipt v1.2 (receiptType "SC"),
// "Document Serialization Approach", Authenticate POS, Submit Receipt Documents.
// SAFETY: only the built-in mock and the ETA PRE-PRODUCTION environment can be used. Production is refused in code (see envOk).
const crypto = require('crypto');

const r2 = (x) => Math.round((+x + Number.EPSILON) * 100) / 100;
const r5 = (x) => Math.round((+x + Number.EPSILON) * 1e5) / 1e5;
const ENVS = { mock: {}, preprod: { api: 'https://api.preprod.invoicing.eta.gov.eg', id: 'https://id.preprod.eta.gov.eg' } };
const envOk = (e) => e === 'mock' || e === 'preprod';   // 'production' is deliberately absent: it stays BLOCKED until the owner registers and signs off
const mockAllowed = (slug) => slug === 'showroom' || process.env.NODE_ENV !== 'production' || process.env.ETA_MOCK_OK === '1';

// ETA "Document Serialization Approach": uppercase names, every name and leaf value in double quotes, arrays: name once, then name before each element.
function serialize(node) {
  if (node === null || typeof node !== 'object') return '"' + String(node) + '"';
  let out = '';
  for (const [k, v] of Object.entries(node)) {
    const K = '"' + k.toUpperCase() + '"';
    if (Array.isArray(v)) { out += K; for (const it of v) out += K + serialize(it); }
    else out += K + serialize(v);
  }
  return out;
}
// UUID: serialize the receipt with header.uuid empty, SHA-256, 64 hex chars (lowercase)
function uuidOf(doc) { const c = JSON.parse(JSON.stringify(doc)); c.header.uuid = ''; return crypto.createHash('sha256').update(serialize(c), 'utf8').digest('hex'); }

// Build a Coffee & Restaurant Receipt v1.2 from a closed sale. VAT is charged on net food + service charge (as the venue's own bill does).
// feesAmount must be 0 in this document type, so the service charge is a separate line.
function buildReceipt(h, cfg, o) {
  const rate = +h.taxRate >= 0 ? +h.taxRate : 14, items = (h.items || []).filter((l) => l.qty > 0);
  const gross = r2(items.reduce((n, l) => n + l.qty * l.price, 0)), disc = Math.min(gross, r2(h.discount || 0));
  let left = disc;
  const lines = items.map((l, i) => {
    const totalSale = r2(l.qty * l.price), d = i === items.length - 1 ? left : Math.min(left, r2(gross ? disc * totalSale / gross : 0)); left = r2(left - d);
    return { name: l.name, itemId: l.itemId || l.name, qty: l.qty, unit: l.price, totalSale, d };
  });
  if (+h.service > 0) lines.push({ name: 'Service charge', itemId: 'SERVICE', qty: 1, unit: r2(h.service), totalSale: r2(h.service), d: 0 });
  const itemData = lines.map((l) => {
    const netSale = r2(l.totalSale - l.d), vat = r5(netSale * rate / 100), it = {
      internalCode: String(l.itemId).slice(0, 50), description: String(l.name).slice(0, 500), itemType: 'EGS', itemCode: cfg.itemCode || ('EG-' + cfg.rin + '-1'), unitType: 'EA',
      quantity: l.qty, unitPrice: l.unit, netSale, totalSale: l.totalSale, total: r5(netSale + vat),
    };
    if (l.d > 0) it.commercialDiscountData = [{ amount: l.d, description: 'Discount' }];
    it.taxableItems = [{ taxType: 'T1', amount: vat, subType: 'V009', rate }];
    return it;
  });
  const totalSales = r2(lines.reduce((n, l) => n + l.totalSale, 0)), netAmount = r2(itemData.reduce((n, l) => n + l.netSale, 0)), vatTotal = r5(itemData.reduce((n, l) => n + l.taxableItems[0].amount, 0));
  const doc = {
    header: { dateTimeIssued: new Date(h.closedAt).toISOString().replace(/\.\d+Z$/, 'Z'), receiptNumber: o.receiptNumber, uuid: '', previousUUID: o.previousUUID || '', currency: 'EGP', orderdeliveryMode: 'FC' },
    documentType: { receiptType: 'SC', typeVersion: '1.2' },
    seller: { rin: cfg.rin, companyTradeName: cfg.tradeName, branchCode: cfg.branchCode || '0', branchAddress: { country: 'EG', governate: cfg.governate || '', regionCity: cfg.city || '', street: cfg.street || '', buildingNumber: cfg.building || '' }, deviceSerialNumber: cfg.deviceSerial || '', activityCode: cfg.activityCode || '' },
    buyer: { type: 'P' },
    itemData, totalSales, ...(disc > 0 ? { totalCommercialDiscount: disc } : {}), netAmount, totalAmount: r5(netAmount + vatTotal),
    taxTotals: [{ taxType: 'T1', amount: vatTotal }], paymentMethod: h.method === 'card' || h.method === 'online' ? 'V' : 'C',
  };
  doc.header.uuid = uuidOf(doc);
  return doc;
}
// the venue's own bill total (without tip) vs what the receipt adds up to - flag anything beyond rounding
const reconcile = (h, doc) => Math.abs(r2((h.total || 0) - (h.tip || 0)) - r2(doc.totalAmount)) <= 0.05;

// receipt link / QR payload (ETA "Get Receipt Details Anonymously" share link)
const shareUrl = (uuid, issued) => `https://invoicing.eta.gov.eg/receipts/search/${uuid}/share/${issued}`;

// ---- client ----
async function login(cfg, env, fetchImpl) {
  const r = await fetchImpl(ENVS[env].id + '/connect/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', posserial: cfg.deviceSerial || '', pososversion: cfg.osVersion || 'web', posmodelframework: '1', presharedkey: cfg.presharedKey || '' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.clientId || '', client_secret: cfg.clientSecret || '', scope: 'InvoicingAPI' }).toString() });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.access_token) { const e = new Error('ETA login failed: ' + (j.error || r.status)); e.permanent = r.status >= 400 && r.status < 500 && r.status !== 429; throw e; }
  return j.access_token;
}
// submit a batch -> { accepted:[{uuid,longId,receiptNumber}], rejected:[{uuid,receiptNumber,error}], submissionUUID }. Throws {retryable, retryAfter} on transient failures.
async function submit(cfg, env, docs, fetchImpl = fetch, signer) {
  const token = await login(cfg, env, fetchImpl);
  const body = { receipts: docs, signatures: [{ signatureType: 'I', value: signer ? signer(docs) : '' }] };
  let r; try { r = await fetchImpl(ENVS[env].api + '/api/v1/receiptsubmissions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }); } catch (e) { const x = new Error('network: ' + e.message); x.retryable = true; throw x; }
  const j = await r.json().catch(() => ({}));
  if (r.status === 202 || r.status === 200) return { submissionUUID: j.submissionUUID, accepted: j.acceptedDocuments || [], rejected: j.rejectedDocuments || [] };
  const e = new Error('ETA ' + r.status + ' ' + (j.error && j.error.message || j.message || '')); e.status = r.status;
  e.retryable = r.status === 429 || r.status >= 500 || r.status === 422; e.retryAfter = +(r.headers && r.headers.get && r.headers.get('retry-after')) || 0; throw e;
}

// built-in mock "ETA" so the whole pipeline is testable without credentials. mode: ok | reject | down | flaky(first call fails)
function mockFetch(state) {
  return async (url, o) => {
    const json = (status, j, h = {}) => ({ ok: status < 300, status, headers: { get: (k) => h[k.toLowerCase()] }, json: async () => j });
    if (url.endsWith('/connect/token')) return json(200, { access_token: 'mock', token_type: 'Bearer', expires_in: 3600 });
    state.calls = (state.calls || 0) + 1;
    if (state.mode === 'down' || (state.mode === 'flaky' && state.calls === 1)) return json(503, { error: { message: 'unavailable' } });
    const b = JSON.parse(o.body), acc = [], rej = [];
    for (const d of b.receipts) {
      const bad = state.mode === 'reject' || !d.header.uuid || d.header.uuid !== uuidOf(d) || !d.seller.rin;
      (bad ? rej : acc).push(bad ? { receiptNumber: d.header.receiptNumber, uuid: d.header.uuid, error: { message: 'Mock rejection', target: d.header.uuid } } : { uuid: d.header.uuid, longId: 'LONG' + d.header.uuid.slice(0, 20), receiptNumber: d.header.receiptNumber });
    }
    return json(202, { submissionUUID: 'MOCKSUB' + state.calls, acceptedDocuments: acc, rejectedDocuments: rej });
  };
}
module.exports = { ENVS, envOk, mockAllowed, serialize, uuidOf, buildReceipt, reconcile, shareUrl, submit, login, mockFetch };
