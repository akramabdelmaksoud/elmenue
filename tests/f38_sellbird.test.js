const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('crypto');
const SB = require('../sellbirdhub');

const sign = (secret, raw, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex')}`;
const mem = () => { const m = {}; return { getAux: async (k) => m[k] && JSON.parse(JSON.stringify(m[k])), putAux: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); }, m }; };

test('F38 Sellbird signature: right secret passes, tampering / old / missing fail', () => {
  const raw = '{"id":"evt_1","type":"test.ping"}', S = 'a-long-secret-value';
  assert.equal(SB.verify(S, raw, sign(S, raw)), true);
  assert.equal(SB.verify('other', raw, sign(S, raw)), false);
  assert.equal(SB.verify(S, raw + ' ', sign(S, raw)), false, 'body changed');
  assert.equal(SB.verify(S, raw, sign(S, raw, Math.floor(Date.now() / 1000) - 400)), false, 'older than 5 minutes');
  assert.equal(SB.verify(S, raw, ''), false); assert.equal(SB.verify('', raw, sign(S, raw)), false, 'no secret configured never verifies');
  assert.equal(SB.verify(S, raw, 't=abc,v1=zz'), false);
});

test('F38 Sellbird webhook: stored once, replies and meetings email the owner, junk refused', async () => {
  const store = mem(), S = 'another-long-secret', sent = [], notify = async (s, t) => sent.push([s, t]);
  const post = (obj, secret = S, headers = {}) => { const raw = JSON.stringify(obj); return SB.receive({ store, secret: S, raw, headers: { 'sellbird-signature': sign(secret, raw), ...headers }, notify }); };
  const person = { name: 'Sam', email: 'sam@cafe.example', company: 'Cafe Nile', stage: 'talking', source: 'cold_email' };
  assert.equal((await post({ id: 'e1', type: 'lead.created', data: { person, found_via: 'osm' } })).code, 200);
  assert.equal((await post({ id: 'e1', type: 'lead.created', data: { person } })).body.duplicate, true, 'same delivery id is ignored');
  assert.equal((await post({ id: 'e2', type: 'reply.received', data: { person, text: 'Sounds good, send prices', intent: 'interested', needs_you: true } })).code, 200);
  assert.equal((await post({ id: 'e3', type: 'meeting.booked', data: { person, meeting: { starts_at: '2026-12-01T10:00' } } })).code, 200);
  assert.equal((await post({ id: 'e4', type: 'stage.changed', data: { person, from: 'new', to: 'talking' } })).code, 200);
  assert.equal(sent.length, 2, 'only the reply that needs you and the meeting send mail'); assert.match(sent[0][0], /reply from Sam/); assert.match(sent[1][1], /2026-12-01/);
  assert.equal((await post({ id: 'e5', type: 'something.else', data: {} })).body.ignored, true, 'unknown types are acknowledged, not retried');
  assert.equal((await post({ id: 'e6', type: 'test.ping' }, 'wrong-secret')).code, 401);
  assert.equal((await SB.receive({ store, secret: '', raw: '{}', headers: {}, notify })).code, 503);
  assert.equal((await SB.receive({ store, secret: S, raw: 'not json', headers: { 'sellbird-signature': sign(S, 'not json') }, notify })).code, 400);
  const d = store.m.sellbird; assert.equal(d.events.length, 4); assert.equal(d.counts['lead.created'], 1); assert.equal(d.events[0].type, 'stage.changed', 'newest first');
  assert.ok(!JSON.stringify(d).includes('Sounds good, send prices') === false, 'the reply text is kept for the super admin');
});

test('F38 Sellbird leads feed: only new leads, oldest first, only the fields Sellbird needs', () => {
  const rows = [{ id: 'm3', at: 300, name: 'C', email: 'c@x.co', place: 'Cafe C', message: 'hi there', secret: 'x' }, { id: 'm1', at: 100, name: 'A', email: 'a@x.co', message: 'one' }, { id: 'm2', at: 200, name: 'B', email: 'b@x.co', phone: '010', message: 'two' }];
  assert.deepEqual(SB.feed(rows, 0).map((x) => x.id), ['m1', 'm2', 'm3']); assert.deepEqual(SB.feed(rows, 150).map((x) => x.id), ['m2', 'm3']);
  assert.equal(SB.feed(rows, 0)[2].company, 'Cafe C'); assert.ok(!('secret' in SB.feed(rows, 0)[2])); assert.deepEqual(SB.feed(null, 0), []);
});
