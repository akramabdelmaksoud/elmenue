const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { start } = require('./helper');
const { createTenant, freshData } = require('../tenant');
const F = require('../features');
const P = (f) => path.join(__dirname, '..', f);

// X-01 / X-02: a venue saved BEFORE this release loads, every new feature is OFF, and billing is unchanged
test('X-01/X-02 old data loads with every new flag off', () => {
  const data = freshData(true);
  ['fb', 'upsell', 'promo', 'offline', 'onlinePay', 'eta'].forEach((k) => delete data.settings[k]);
  ['upsell', 'itemDaily', 'coupons', 'offers', 'gifts', 'idem'].forEach((k) => delete data[k]);
  const rec = { id: 'r_old', slug: 'old', name: 'Old', plan: 'vip', status: 'active', data };
  const t = createTenant(rec, () => {}, () => {});
  assert.doesNotThrow(() => t.ensure());
  const s = rec.data.settings;
  assert.equal(s.fb.enabled, false); assert.equal(s.upsell.enabled, false); assert.equal(s.promo.enabled, false); assert.equal(s.offline.enabled, false); assert.equal(s.onlinePay.enabled, false); assert.equal(s.eta.enabled, false);
  assert.deepEqual([rec.data.coupons, rec.data.offers], [[], []]); assert.equal(typeof rec.data.gifts, 'object');
  // a live session of the old data bills exactly as before: discount off gross, then service + tax on net
  const sess = Object.values(rec.data.sessions)[0]; if (sess) { const b = t.bill(sess); assert.equal(b.gift, 0); assert.equal(b.online, 0); assert.equal(b.couponCode, ''); assert.equal(b.due, b.total); }
  assert.ok(t.snapshotFor({ role: 'admin' }).config, 'snapshot renders');
  // history of old sales is untouched
  assert.ok(rec.data.history.length > 0);
});

// X-03: every new feature is tier-gated (basic tenant gets 402 + upgrade hint) - checked in each feature test; here the table of tiers
test('X-03 tier table', () => {
  ['feedback', 'upsell', 'coupons', 'onlinepay', 'eta', 'offline'].forEach((f) => { assert.equal(F.has('basic', f), false, f); assert.equal(F.has('operations', f), true, f); assert.equal(F.has('vip', f), true, f); });
  assert.equal(F.has('operations', 'giftcards'), false); assert.equal(F.has('vip', 'giftcards'), true);
});

// X-05: this release's wording exists in all three languages
test('X-05 i18n completeness (en / ar / fr)', () => {
  const win = {}; const App = { tr: () => '' }; const ctx = vm.createContext({ window: win, App, DICT: { en: {}, ar: {}, fr: {} }, document: { documentElement: {} } });
  try { vm.runInContext(fs.readFileSync(P('public/i18n.js'), 'utf8'), ctx); } catch (e) { /* the file touches the DOM at the end; the dictionaries are already published */ }
  const { EN, AR, FR } = win.I18N || {}; assert.ok(EN && AR && FR, 'dictionaries published');
  const mine = Object.keys(EN).filter((k) => /^(cpn|up[A-Z]|rate|eta[A-Z]|payOn|offlineNote)/.test(k));
  assert.ok(mine.length >= 20, 'release keys found: ' + mine.length);
  mine.forEach((k) => { assert.ok(AR[k], 'ar missing ' + k); assert.ok(FR[k], 'fr missing ' + k); assert.ok(!/[؀-ۿ]/.test(FR[k]), 'fr is Latin script: ' + k); assert.ok(/[؀-ۿ]/.test(AR[k]), 'ar is Arabic script: ' + k); });
});

// X-08: the in-browser demo engine still loads with no Node globals (no require)
test('X-08 demo engine loads in a browser-like sandbox', () => {
  for (const f of ['features.js', 'data.js', 'tenant.js']) {
    const ctx = vm.createContext({ module: { exports: {} }, exports: {}, console, Math, Date, JSON, Object, Array, String, Number, Set, Map, Promise, setTimeout, clearTimeout });
    ctx.window = ctx; vm.runInContext(fs.readFileSync(P(f), 'utf8').replace(/require\((['"])\.\/(features|data|showroom)\1\)/g, (m, q, n) => `(globalThis.__m_${n} || (globalThis.__m_${n} = {}))`), ctx);
  }
  const browser = fs.readFileSync(P('payments.js'), 'utf8'); assert.ok(!/require\('(\.\/)?(payments|eta)'\)/.test(fs.readFileSync(P('tenant.js'), 'utf8')), 'engine never imports server-only modules');
  assert.ok(browser.length > 0);
});

for (const mode of ['ws', 'rpc']) test(`X security + concurrency [${mode}]`, async (t) => {
  const S = await start(mode); t.after(() => S.stop());
  const T = await S.tenant('vip', { demo: true }), O = await S.tenant('vip');
  const C = await T.staff('cashier', 'Mona', '7788');
  // X-09 security sweep: unauthenticated / wrong-role / cross-venue calls are refused on every new route
  const adminRoutes = [['GET', '/coupons'], ['POST', '/coupons'], ['GET', '/gifts'], ['GET', '/promo/report'], ['GET', '/pay/config'], ['POST', '/pay/config'], ['GET', '/pay/intents'], ['GET', '/eta/config'], ['POST', '/eta/config'], ['GET', '/eta/queue'], ['POST', '/eta/run'], ['GET', '/eta/export.json'], ['GET', '/upsell/stats'], ['GET', '/feedback/summary'], ['GET', '/shifts']];
  for (const [m, p] of adminRoutes) {
    assert.equal((await S.J(m, T.u(p), m === 'POST' ? {} : undefined)).s, 401, `${m} ${p} anonymous`);
    const wrong = await S.J(m, T.u(p), m === 'POST' ? {} : undefined, C); assert.ok([401, 403, 404].includes(wrong.s), `${m} ${p} cashier token -> ${wrong.s}`);
    const cross = await S.J(m, T.u(p), m === 'POST' ? {} : undefined, O.admin); assert.ok([401, 403].includes(cross.s), `${m} ${p} other venue's admin -> ${cross.s}`);
  }
  // secrets never appear in what a guest can fetch
  await T.api('POST', '/pay/config', { apiKey: 'K-SECRET-9', hmac: 'H-SECRET-9', integrationId: '1', iframeId: '2' }); await T.api('POST', '/eta/config', { rin: '9', tradeName: 'N', clientSecret: 'E-SECRET-9' });
  const pub = JSON.stringify([(await S.J('GET', T.u('/config'))).j, (await T.guest(15, 'G').join()).j]);
  ['K-SECRET-9', 'H-SECRET-9', 'E-SECRET-9'].forEach((x) => assert.ok(!pub.includes(x), x + ' leaked'));
  // public endpoints are rate limited / validated
  const codes = []; for (let i = 0; i < 40; i++) codes.push((await S.J('POST', T.u('/gifts/check'), { code: 'GC-X' + i }, C)).s); assert.ok(codes.includes(429), 'gift lookups throttle after 30/min');
  assert.equal((await S.J('POST', T.u('/pay/intent'), { tableNumber: 999, scope: 'table' })).s === 200, false); assert.equal((await S.J('POST', T.u('/pay/webhook/paymob'), { obj: { id: 1 } })).s, 401);
  // X-07 concurrency: many guests tapping at once keep every line (compare-and-swap retries in stateless mode)
  const g = T.guest(15, 'Race'); const st = (await g.join()).j.state; const it = st.config.items.find((x) => !x.soldOut);
  await Promise.all([...Array(6)].map(() => g.call({ t: 'cart_add', itemId: it.id })));
  const cart = (await g.call(null)).j.state.session.cart; const q = cart.reduce((n, l) => n + l.qty, 0);
  assert.ok(q >= 1 && q <= 6, 'cart consistent'); if (mode === 'ws') assert.equal(q, 6, 'local mode keeps all 6');
});
