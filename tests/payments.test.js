// Money safety: secrets are encrypted at rest, provider callbacks are verified, nobody can forge "paid".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const auth = require('../auth');
const PAY = require('../payments');
const { startServer } = require('./helpers');

test('seal/unseal: round trip, random per call, tamper-proof, legacy plain values still readable', () => {
  const a = auth.seal('sk_live_123'), b = auth.seal('sk_live_123');
  assert.ok(a.startsWith('enc1:') && !a.includes('sk_live_123')); assert.notEqual(a, b);
  assert.equal(auth.unseal(a), 'sk_live_123');
  assert.equal(auth.unseal('plain-old-value'), 'plain-old-value');
  assert.equal(auth.unseal(a.slice(0, -4) + 'AAAA'), '', 'tampered value is rejected, not decrypted to garbage');
  assert.equal(auth.unseal(undefined), undefined);
});

test('Paymob callback signature: accepts the genuine HMAC, rejects forgeries and missing secret', () => {
  const obj = { amount_cents: 12500, created_at: '2026-01-01T10:00:00', currency: 'EGP', error_occured: false, has_parent_transaction: false, id: 99, integration_id: 7, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: 5, merchant_order_id: 'pi_1' }, owner: 3, pending: false, 'source_data.pan': '2346', 'source_data.sub_type': 'MasterCard', 'source_data.type': 'card', success: true };
  const good = PAY.paymobHmac(obj, 'secret');
  assert.equal(PAY.verifyPaymob(obj, good, 'secret'), true);
  assert.equal(PAY.verifyPaymob({ ...obj, amount_cents: 100 }, good, 'secret'), false, 'changed amount');
  assert.equal(PAY.verifyPaymob(obj, good, 'other'), false);
  assert.equal(PAY.verifyPaymob(obj, '', 'secret'), false);
  assert.equal(PAY.verifyPaymob(obj, good, ''), false, 'no secret configured means nothing is trusted');
  assert.equal(PAY.paymobOutcome(obj).paid, true); assert.equal(PAY.paymobOutcome({ ...obj, is_refunded: true }).paid, false); assert.equal(PAY.paymobOutcome({ ...obj, success: false }).paid, false);
});

test('a restaurant\'s payment keys are encrypted in storage and masked in the API', async () => {
  const srv = await startServer({ SINGLE_RESTAURANT: '0', SAVE_DEBOUNCE_MS: '100' });
  const j = async (method, p, { token, body } = {}) => { const r = await fetch(srv.base + p, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
  try {
    const su = (await j('POST', '/api/super/login', { body: { email: 'root@test.dev', password: 'rootpass1' } })).json.token;
    assert.equal((await j('POST', '/api/super/tenants', { token: su, body: { name: 'Pay', slug: 'paycafe', email: 'o@p.com', plan: 'operations' } })).status, 200);
    const admin = (await j('POST', '/api/super/tenants/paycafe/impersonate', { token: su })).json.token;
    const set = await j('POST', '/api/r/paycafe/pay/config', { token: admin, body: { apiKey: 'PLAINTEXT_API_KEY_9876', hmac: 'PLAINTEXT_HMAC_SECRET_5432', integrationId: '123', iframeId: '456' } });
    assert.equal(set.status, 200, JSON.stringify(set.json));
    const got = (await j('GET', '/api/r/paycafe/pay/config', { token: admin })).json;
    assert.equal(got.paymob.apiKey, '••••876'); assert.equal(got.paymob.hmac, '••••432'); assert.equal(got.paymob.integrationId, '123');
    assert.ok(!JSON.stringify(got).includes('PLAINTEXT'));
    // re-saving the masked values must not overwrite the real keys
    await j('POST', '/api/r/paycafe/pay/config', { token: admin, body: { apiKey: got.paymob.apiKey, hmac: got.paymob.hmac, integrationId: '123', iframeId: '456' } });
    assert.equal((await j('GET', '/api/r/paycafe/pay/config', { token: admin })).json.paymob.apiKey, '••••876');
    // a callback with a bad signature is refused
    const bad = await j('POST', '/api/r/paycafe/pay/webhook/paymob?hmac=deadbeef', { body: { obj: { id: 1, success: true } } }); assert.equal(bad.status, 401);
    await new Promise((r) => setTimeout(r, 1500));
    const dir = path.join(srv.data, 'tenants'); const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    const all = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
    assert.ok(all.includes('enc1:'), 'sealed value is stored'); assert.ok(!all.includes('PLAINTEXT_API_KEY') && !all.includes('PLAINTEXT_HMAC'), 'no plain secret on disk / in the database');
  } finally { await srv.stop(); }
});
