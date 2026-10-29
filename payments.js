// Online payment adapters (server only). Card numbers never touch this server: the guest pays on the provider's hosted page,
// and we only ever receive a signed notification. Two adapters:
//   sandbox - a built-in fake gateway page for demos and tests (no money moves; refused on production venues)
//   paymob  - Paymob Accept (Egypt): auth token -> order -> payment key -> hosted iframe; callbacks verified with HMAC-SHA512
const crypto = require('crypto');

// Paymob "transaction processed" callback: the HMAC is SHA-512 over these fields' values, concatenated in this exact (alphabetical) order.
const PAYMOB_FIELDS = ['amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success'];
const dig = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const str = (v) => (v === undefined || v === null ? '' : String(v));
const paymobHmac = (obj, secret) => crypto.createHmac('sha512', String(secret)).update(PAYMOB_FIELDS.map((f) => str(dig(obj, f))).join('')).digest('hex');
const safeEq = (a, b) => { a = Buffer.from(String(a || '')); b = Buffer.from(String(b || '')); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); };
const verifyPaymob = (obj, hmac, secret) => !!secret && !!obj && safeEq(paymobHmac(obj, secret).toLowerCase(), String(hmac || '').toLowerCase());

// What the callback means for us (amounts in EGP). Only a clean, successful, non-refunded capture counts as paid.
function paymobOutcome(obj) {
  const ok = obj.success === true || obj.success === 'true', pending = obj.pending === true || obj.pending === 'true';
  const bad = [obj.is_refunded, obj.is_voided, obj.error_occured].some((x) => x === true || x === 'true');
  return { id: str(obj.id), intent: str(dig(obj, 'order.merchant_order_id')), amount: +(+obj.amount_cents / 100).toFixed(2), currency: str(obj.currency).toUpperCase(), paid: ok && !pending && !bad, failed: !pending && !ok };
}

// the sandbox signs its own notifications with a key only this server knows, so a guest cannot forge "paid"
function sandboxSecret(serverSecret, slug) { return crypto.createHmac('sha256', serverSecret).update('paysandbox:' + slug).digest('hex'); }
const sandboxSign = (secret, intent, amount, ok) => crypto.createHmac('sha256', secret).update([intent, (+amount).toFixed(2), ok ? 'paid' : 'failed'].join('|')).digest('hex');
const sandboxAllowed = (slug) => slug === 'showroom' || process.env.NODE_ENV !== 'production' || process.env.PAY_SANDBOX_OK === '1';

// Paymob order registration. fetchImpl is injectable so tests never call the network.
async function paymobCreate(cfg, { amount, intent }, fetchImpl = fetch) {
  const base = cfg.base || 'https://accept.paymob.com', post = async (p, b) => { const r = await fetchImpl(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Paymob ' + p + ' ' + r.status); return j; };
  const cents = Math.round(amount * 100);
  const { token } = await post('/api/auth/tokens', { api_key: cfg.apiKey });
  const order = await post('/api/ecommerce/orders', { auth_token: token, delivery_needed: 'false', amount_cents: String(cents), currency: 'EGP', merchant_order_id: intent, items: [] });
  const key = await post('/api/acceptance/payment_keys', {
    auth_token: token, amount_cents: String(cents), expiration: 3600, order_id: order.id, currency: 'EGP', integration_id: +cfg.integrationId,
    billing_data: { apartment: 'NA', email: 'guest@example.com', floor: 'NA', first_name: 'Guest', street: 'NA', building: 'NA', phone_number: '+201000000000', shipping_method: 'NA', postal_code: 'NA', city: 'Cairo', country: 'EG', last_name: 'Guest', state: 'NA' },
  });
  return { ref: String(order.id), url: `${base}/api/acceptance/iframes/${encodeURIComponent(cfg.iframeId)}?payment_token=${encodeURIComponent(key.token)}` };
}

module.exports = { PAYMOB_FIELDS, paymobHmac, verifyPaymob, paymobOutcome, sandboxSecret, sandboxSign, sandboxAllowed, paymobCreate, safeEq };
