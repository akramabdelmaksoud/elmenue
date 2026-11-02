const test = require('node:test'), assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifySvix } = require('../inbound');
const { start } = require('./helper');
const secret = 'whsec_' + crypto.randomBytes(24).toString('base64');
const sign = (id, ts, raw, sec = secret) => 'v1,' + crypto.createHmac('sha256', Buffer.from(sec.replace('whsec_', ''), 'base64')).update(`${id}.${ts}.${raw}`).digest('base64');
test('F40 webhook signatures are checked', () => {
  const raw = '{"type":"email.received"}', ts = String(Math.floor(Date.now() / 1000)), h = { 'svix-id': 'msg_1', 'svix-timestamp': ts, 'svix-signature': sign('msg_1', ts, raw) };
  assert.equal(verifySvix(secret, h, raw), true);
  assert.equal(verifySvix(secret, { ...h, 'svix-signature': 'v1,AAAA ' + h['svix-signature'] }, raw), true, 'several signatures are allowed');
  assert.equal(verifySvix(secret, h, raw + ' '), false, 'body changed');
  assert.equal(verifySvix(secret, { ...h, 'svix-signature': sign('msg_1', ts, raw, 'whsec_' + Buffer.from('other-secret-other-secret').toString('base64')) }, raw), false, 'wrong secret');
  const old = String(Math.floor(Date.now() / 1000) - 3600); assert.equal(verifySvix(secret, { ...h, 'svix-timestamp': old, 'svix-signature': sign('msg_1', old, raw) }, raw), false, 'too old');
  assert.equal(verifySvix('', h, raw), false); assert.equal(verifySvix(secret, {}, raw), false);
});
test('F40 the inbound mail route refuses unsigned calls and ignores other events', async (t) => {
  const S = await start('rpc', { env: { RESEND_WEBHOOK_SECRET: secret } }); t.after(() => S.stop());
  const post = (raw, h) => fetch(S.base + '/api/mail/inbound', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: raw });
  assert.equal((await post('{"type":"email.received","data":{"email_id":"x"}}', {})).status, 401, 'no signature');
  const ts = String(Math.floor(Date.now() / 1000)), sg = (raw) => ({ 'svix-id': 'm1', 'svix-timestamp': ts, 'svix-signature': sign('m1', ts, raw) });
  const other = '{"type":"email.sent","data":{}}', r = await post(other, sg(other)); assert.equal(r.status, 200); assert.equal((await r.json()).ignored, true);
  const own = '{"type":"email.received","data":{"email_id":"e1","from":"TableTab <no-reply@tabletab-tt.com>"}}', r2 = await post(own, sg(own)); assert.equal((await r2.json()).ignored, 'own mail');
  const bill = '{"type":"email.received","data":{"email_id":"e2","from":"cust@x.com","to":["billing@tabletab-tt.com"]}}', r3 = await post(bill, sg(bill)); assert.equal((await r3.json()).ignored, 'not a receiving address', 'billing@ does not receive');
  const info = '{"type":"email.received","data":{"email_id":"e3","from":"cust@x.com","to":["Info <info@tabletab-tt.com>"]}}', r4 = await post(info, sg(info)); assert.equal((await r4.json()).ignored, 'not a receiving address', 'info@ does not receive');
});
