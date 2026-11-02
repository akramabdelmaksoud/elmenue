// Shared (server + browser demo) feature logic: subscription tiers, loyalty maths, OCR menu parsing, admin copilot.
// Pure functions only - no Node APIs - because demo mode runs this file inside the page.

const LUX_THEMES = ['onyx', 'ivory', 'noir', 'champagne', 'emerald', 'bordeaux', 'marble', 'royal'];
const PRO_THEMES = ['slate', 'nordic', 'bistro', 'zen', 'trattoria', 'roast', 'steakhouse', 'rooftop'];
const SIG_THEMES = ['aurum', 'ember', 'sunset', 'platinum', 'rosegold', 'sapphire', 'jade', 'amethyst'];
const PREMIUM_THEMES = ['neon', 'luxury', 'vibrant'].concat(LUX_THEMES, PRO_THEMES, SIG_THEMES);
// Every switch a bundle can contain. area: who sees it (guest / staff / admin). level: 1 = core, 2 = important, 3 = growth, 4 = premium.
const CATALOG = [
  { id: 'menu', area: 'guest', level: 1, en: 'Digital menu', ar: 'المنيو الرقمي' }, { id: 'qr', area: 'guest', level: 1, en: 'Table QR codes', ar: 'أكواد QR للطاولات' },
  { id: 'admin', area: 'admin', level: 1, en: 'Owner dashboard', ar: 'لوحة المالك' }, { id: 'micro', area: 'guest', level: 1, en: 'Call waiter / requests', ar: 'نداء الويتر' },
  { id: 'ordering', area: 'guest', level: 1, en: 'Ordering from the table', ar: 'الطلب من الطاولة' }, { id: 'options', area: 'guest', level: 1, en: 'Item options (size, extras, milk, sugar)', ar: 'خيارات الصنف' },
  { id: 'itemdetails', area: 'guest', level: 2, en: 'Allergens, calories, badges', ar: 'مسببات الحساسية والسعرات والشارات' },
  { id: 'staff', area: 'staff', level: 2, en: 'Named staff accounts', ar: 'حسابات موظفين بأسمائهم' }, { id: 'kds', area: 'staff', level: 2, en: 'Kitchen display', ar: 'شاشة المطبخ' },
  { id: 'cashier', area: 'staff', level: 2, en: 'Cashier screen and shifts', ar: 'شاشة الكاشير والورديات' },
  { id: 'lock', area: 'staff', level: 3, en: 'Order approval lock', ar: 'قفل اعتماد الطلب' }, { id: 'trilingual', area: 'guest', level: 3, en: 'Third language', ar: 'لغة ثالثة' },
  { id: 'online', area: 'guest', level: 2, en: 'Online ordering (pickup and delivery)', ar: 'الطلب أونلاين' }, { id: 'geo', area: 'guest', level: 2, en: 'In-cafe lock and delivery zones', ar: 'قفل الكافيه ومناطق التوصيل' },
  { id: 'feedback', area: 'guest', level: 2, en: 'Guest reviews', ar: 'تقييم الضيوف' }, { id: 'insights', area: 'admin', level: 2, en: 'Insights and staff performance', ar: 'التحليلات وأداء الموظفين' },
  { id: 'instapay', area: 'guest', level: 2, en: 'InstaPay and wallet payment at the table', ar: 'الدفع بإنستاباي والمحافظ' }, { id: 'acctexport', area: 'admin', level: 2, en: 'Accounting export (daily sales, VAT)', ar: 'تصدير محاسبي' },
  { id: 'invoicing', area: 'admin', level: 2, en: 'Branded invoices and purchase orders', ar: 'فواتير رسمية بهوية المكان وأوامر الشراء' }, { id: 'purchasing', area: 'admin', level: 3, en: 'Suppliers and purchase orders', ar: 'الموردون وأوامر الشراء' }, { id: 'ownerreport', area: 'admin', level: 3, en: 'Owner report pack (analysis, risks, decisions)', ar: 'تقرير المالك (تحليل ومخاطر وقرارات)' }, { id: 'attendance', area: 'staff', level: 2, en: 'Staff attendance, schedules and labour cost', ar: 'حضور الموظفين والجداول وتكلفة العمالة' }, { id: 'reservations', area: 'guest', level: 3, en: 'Reservations and waitlist', ar: 'الحجوزات وقائمة الانتظار' }, { id: 'recipes', area: 'admin', level: 3, en: 'Recipes, ingredient stock and food cost', ar: 'الوصفات والمخزون وتكلفة الأكل' },
  { id: 'carservice', area: 'guest', level: 3, en: 'Car service (guests order from their car)', ar: 'خدمة السيارات (الطلب من العربية)' },
  { id: 'upsell', area: 'guest', level: 3, en: 'Upsell suggestions', ar: 'اقتراحات إضافية' }, { id: 'coupons', area: 'guest', level: 3, en: 'Coupons and timed offers', ar: 'كوبونات وعروض' },
  { id: 'onlinepay', area: 'guest', level: 3, en: 'Card payment online (Paymob)', ar: 'الدفع بالكارت أونلاين' }, { id: 'eta', area: 'admin', level: 3, en: 'Egypt e-receipt (ETA)', ar: 'الإيصال الإلكتروني' },
  { id: 'offline', area: 'staff', level: 3, en: 'Offline mode', ar: 'العمل بدون إنترنت' },
  { id: 'loyalty', area: 'guest', level: 4, en: 'Loyalty points', ar: 'نقاط الولاء' }, { id: 'giftcards', area: 'guest', level: 4, en: 'Gift cards', ar: 'كروت الهدايا' },
  { id: 'themes', area: 'guest', level: 4, en: 'Premium and luxury themes', ar: 'ثيمات فاخرة' }, { id: 'ocr', area: 'admin', level: 4, en: 'Menu photo import (AI)', ar: 'استيراد المنيو من صورة' },
  { id: 'copilot', area: 'admin', level: 4, en: 'AI assistant', ar: 'مساعد الذكاء الاصطناعي' }, { id: 'branches', area: 'admin', level: 4, en: 'Multi-branch reports', ar: 'تقارير الفروع' },
];
const FEATURE_IDS = CATALOG.map((c) => c.id);
const PLANS = {
  basic: { id: 'basic', tier: 1, name: 'Starter QR Ordering', name_ar: 'منيو QR الأساسي', price: [600, 800], limits: { branches: 1, tables: 10, staff: 0 }, features: ['menu', 'qr', 'ordering', 'options', 'itemdetails', 'micro', 'admin'] },
  operations: { id: 'operations', tier: 2, name: 'Full Operations & Staff POS', name_ar: 'التشغيل الكامل ونقطة البيع', price: [1200, 1500], limits: { branches: 1, tables: 30, staff: 10 }, features: ['staff', 'attendance', 'invoicing', 'kds', 'cashier', 'lock', 'trilingual', 'feedback', 'upsell', 'coupons', 'onlinepay', 'eta', 'offline', 'online', 'insights', 'geo', 'instapay', 'acctexport', 'reservations'] },
  vip: { id: 'vip', tier: 3, name: 'Enterprise VIP & AI', name_ar: 'VIP والذكاء الاصطناعي', price: [2000, 2000], limits: { branches: 3, tables: null, staff: null }, features: ['purchasing', 'ownerreport', 'loyalty', 'ocr', 'copilot', 'themes', 'branches', 'giftcards', 'recipes'] },
};
// older plan names keep working: they map onto the new tiers
const LEGACY = { standard: 'operations', pro: 'vip', enterprise: 'vip', demo: 'vip' };
const ORDER = ['basic', 'operations', 'vip'];
const planOf = (p) => (PLANS[p] ? p : LEGACY[p] || 'operations');
// p = plan name OR a café record ({ plan, feat }): the super admin can lock/unlock single features per café (rec.feat = { id: true|false }).
function featuresOf(p) {
  const rec = p && typeof p === 'object' ? p : null, plan = planOf(rec ? rec.plan : p), out = {};
  FEATURE_IDS.forEach((k) => (out[k] = false));   // explicit false: the pages treat a missing key as allowed
  PLANS[plan].features.forEach((f) => (out[f] = true));
  if (rec && rec.feat) Object.keys(rec.feat).forEach((k) => { if (rec.feat[k] === true || rec.feat[k] === false) out[k] = rec.feat[k]; });
  return out;
}
const has = (p, f) => !!featuresOf(p)[f];
const minPlanFor = (f) => ORDER.find((id) => featuresOf(id)[f]) || 'vip';
// Platform-wide bundle editing (super admin). cfg = { plans: { basic: { features:[], price:[a,b], limits:{}, name, name_ar }, ... } }; null restores the built-in plans.
// Every bundle lists ALL of its features (the built-in tiers are flattened here: higher tiers include the lower ones), so editing one bundle never changes another.
ORDER.forEach((id, i) => { PLANS[id].features = [...new Set(ORDER.slice(0, i + 1).flatMap((k) => PLANS[k].features))]; });
const DEFAULT_PLANS = JSON.parse(JSON.stringify(PLANS));
function configure(cfg) {
  ORDER.forEach((id) => { PLANS[id] = JSON.parse(JSON.stringify(DEFAULT_PLANS[id])); });
  const pl = (cfg && cfg.plans) || {};
  ORDER.forEach((id) => {
    const o = pl[id], P = PLANS[id]; if (!o || typeof o !== 'object') return;
    if (Array.isArray(o.features)) { P.features = [...new Set(o.features.filter((x) => FEATURE_IDS.includes(x)))]; }
    if (Array.isArray(o.price) && o.price.length === 2 && o.price.every((n) => +n >= 0 && +n < 1e7)) P.price = o.price.map((n) => Math.round(+n));
    if (o.limits && typeof o.limits === 'object') Object.keys(P.limits).forEach((k) => { const v = o.limits[k]; if (v === null) P.limits[k] = null; else if (v !== undefined && v !== '' && +v >= 0 && +v < 1e6) P.limits[k] = Math.floor(+v); });
    if (typeof o.name === 'string' && o.name.trim()) P.name = o.name.trim().slice(0, 60);
    if (typeof o.name_ar === 'string' && o.name_ar.trim()) P.name_ar = o.name_ar.trim().slice(0, 60);
  });
}
// Plan limits (null = unlimited). Enforced only when CREATING something new; a venue already over a limit keeps everything it has.
// override: per-tenant numbers set by the super admin (null/undefined = use the plan's).
function limitsOf(p, override) {
  const base = PLANS[planOf(p)].limits, o = override || {}, out = {};
  Object.keys(base).forEach((k) => { out[k] = o[k] === undefined || o[k] === '' ? base[k] : (o[k] === null ? null : Math.max(0, Math.floor(+o[k]) || 0)); });
  return out;
}
const limitCheck = (kind, used, p, override) => { const limit = limitsOf(p, override)[kind]; return { kind, used, limit, ok: limit === null || used < limit, over: limit !== null && used > limit, upgrade: limit === null ? null : ORDER.find((id) => { const l = PLANS[id].limits[kind]; return l === null || l > limit; }) || null }; };
const monthly = (p) => PLANS[planOf(p)].price[0];

// ---------- Item options (size, extras, milk, sugar) and item details ----------
// item.options = [{ id, name, name_ar, type: 'one' | 'many', required, max, choices: [{ id, name, name_ar, price, def }] }]
const OPT_MAX = { groups: 8, choices: 16 };
const idSafe = (v, fb) => String(v == null ? '' : v).replace(/[^\w-]/g, '').slice(0, 24) || fb;
const money = (n) => Math.min(100000, Math.max(0, Math.round((+n || 0) * 100) / 100));
function optClean(list) {
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).slice(0, OPT_MAX.groups).forEach((g, gi) => {
    if (!g || typeof g !== 'object') return;
    const name = String(g.name || '').trim().slice(0, 40); if (!name) return;
    let gid = idSafe(g.id, 'g' + (gi + 1)); while (seen.has(gid)) gid += 'x'; seen.add(gid);
    const cs = new Set(), choices = [];
    (Array.isArray(g.choices) ? g.choices : []).slice(0, OPT_MAX.choices).forEach((c, ci) => {
      if (!c || typeof c !== 'object') return; const cn = String(c.name || '').trim().slice(0, 40); if (!cn) return;
      let cid = idSafe(c.id, 'c' + (ci + 1)); while (cs.has(cid)) cid += 'x'; cs.add(cid);
      choices.push({ id: cid, name: cn, name_ar: String(c.name_ar || '').trim().slice(0, 40), price: money(c.price), ...(c.def ? { def: 1 } : {}) });
    });
    if (!choices.length) return;
    const type = g.type === 'many' ? 'many' : 'one';
    if (type === 'one') { let d = false; choices.forEach((c) => { if (c.def && d) delete c.def; if (c.def) d = true; }); }
    out.push({ id: gid, name, name_ar: String(g.name_ar || '').trim().slice(0, 40), type, required: !!g.required, max: type === 'many' ? Math.min(choices.length, Math.max(1, Math.floor(+g.max) || choices.length)) : 1, choices });
  });
  return out;
}
// sel = { groupId: choiceId | [choiceIds] } -> { ok, add, text, text_ar, key } or { ok:false, group } when a required group is missing / a choice is invalid
function optResolve(it, sel) {
  const groups = (it && it.options) || []; if (!groups.length) return { ok: true, add: 0, text: '', text_ar: '', key: '' };
  sel = sel && typeof sel === 'object' ? sel : {};
  let add = 0; const en = [], ar = [], key = [];
  for (const g of groups) {
    let want = sel[g.id]; want = want === undefined || want === null ? [] : Array.isArray(want) ? want : [want];
    want = [...new Set(want.map(String))];
    if (!want.length) { const d = g.choices.filter((c) => c.def); if (g.type === 'one' && d.length) want = [d[0].id]; }
    const picked = want.map((cid) => g.choices.find((c) => c.id === cid));
    if (picked.some((c) => !c)) return { ok: false, group: g.id };
    if (picked.length > (g.type === 'many' ? g.max : 1)) return { ok: false, group: g.id };
    if (g.required && !picked.length) return { ok: false, group: g.id };
    picked.forEach((c) => { add += c.price; en.push(c.name); ar.push(c.name_ar || c.name); key.push(g.id + ':' + c.id); });
  }
  return { ok: true, add: Math.round(add * 100) / 100, text: en.join(' · '), text_ar: ar.join(' · '), key: key.sort().join('|') };
}
const ALLERGENS = ['gluten', 'dairy', 'nuts', 'peanuts', 'eggs', 'soy', 'fish', 'shellfish', 'sesame'], BADGES = ['new', 'spicy', 'vegan', 'veg', 'chef', 'popular'];
function detailsClean(b) {   // allergens (known codes only), calories, one badge
  const o = {};
  if ('allergens' in b) o.allergens = (Array.isArray(b.allergens) ? b.allergens : []).filter((a, i, arr) => ALLERGENS.includes(a) && arr.indexOf(a) === i);
  if ('cal' in b) { const c = Math.round(+b.cal); o.cal = c > 0 && c <= 5000 ? c : ''; }
  if ('badge' in b) o.badge = BADGES.includes(b.badge) ? b.badge : '';
  return o;
}

// ---------- InstaPay / wallet at the table ----------
// Guests send the bill to the cafe's InstaPay address or wallet number and tell the cashier; the cashier confirms and closes the table.
const DIGITAL = ['instapay', 'wallet'];
const ipClean = (v) => {
  v = v && typeof v === 'object' ? v : {}; const s = (x, n) => String(x == null ? '' : x).replace(/[<>]/g, '').trim().slice(0, n);
  return { enabled: !!v.enabled, handle: s(v.handle, 60), phone: s(v.phone, 20).replace(/[^\d+ ]/g, ''), wallet: s(v.wallet, 30) || 'Vodafone Cash', name: s(v.name, 60), note: s(v.note, 140), qr: /^\/api\/r\/[a-z0-9-]+\/img\/[\w-]+$/.test(String(v.qr || '')) ? String(v.qr) : '' };
};
const ipCfg = (settings) => { const c = ipClean(settings && settings.instapay); c.instapay = !!c.handle; c.walletOn = !!c.phone; return c; };

// ---------- Reservations and waitlist (guest facing) ----------
const hmOk = (x, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(x || '')) ? x : d);
function reserveClean(v) {
  v = v && typeof v === 'object' ? v : {}; const n = (x, lo, hi, d) => { x = Math.floor(+x); return x >= lo && x <= hi ? x : d; };
  return { enabled: !!v.enabled, waitlist: !!v.waitlist, maxParty: n(v.maxParty, 1, 50, 10), leadMin: n(v.leadMin, 0, 1440, 45), daysAhead: n(v.daysAhead, 1, 90, 14), from: hmOk(v.from, ''), to: hmOk(v.to, ''), capacity: n(v.capacity, 0, 5000, 0), note: String(v.note || '').replace(/[<>]/g, '').trim().slice(0, 160) };
}
const reserveCfg = (settings) => reserveClean(settings && settings.reserve);
// is the minute-of-day inside the opening window (empty window = always)
function reserveHoursOk(cfg, at) {
  if (!cfg.from || !cfg.to) return true;
  const d = new Date(at), m = d.getHours() * 60 + d.getMinutes(), hm = (x) => { const [h, mi] = x.split(':').map(Number); return h * 60 + mi; }, a = hm(cfg.from), b = hm(cfg.to);
  return a <= b ? m >= a && m <= b : m >= a || m <= b;
}

// ---------- Recipes and ingredient stock ----------
const UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];
const num2 = (x, hi) => Math.min(hi, Math.max(0, Math.round((+x || 0) * 1000) / 1000));
function ingClean(v) {
  v = v && typeof v === 'object' ? v : {};
  return { name: String(v.name || '').replace(/[<>]/g, '').trim().slice(0, 40), unit: UNITS.includes(v.unit) ? v.unit : 'g', stock: num2(v.stock, 1e7), cost: num2(v.cost, 1e5), low: num2(v.low, 1e7), par: num2(v.par, 1e7), supplier: String(v.supplier || '').replace(/[^\w-]/g, '').slice(0, 24), expiry: /^\d{4}-\d{2}-\d{2}$/.test(String(v.expiry || '')) ? String(v.expiry) : '' };
}
// keeps only known ingredients, positive quantities, no duplicates
function recipeClean(arr, ings) {
  const seen = new Set(), out = [];
  for (const r of Array.isArray(arr) ? arr : []) { if (!r || seen.has(r.ing) || !(ings || []).some((i) => i.id === r.ing)) continue; const q = num2(r.qty, 1e6); if (q > 0) { seen.add(r.ing); out.push({ ing: r.ing, qty: q }); } if (out.length >= 25) break; }
  return out;
}
const recipeCost = (recipe, ings) => Math.round((recipe || []).reduce((n, r) => { const i = (ings || []).find((x) => x.id === r.ing); return n + (i ? i.cost * r.qty : 0); }, 0) * 100) / 100;
// items that have a recipe get their cost from the ingredients
function recost(items, ings) { for (const it of items || []) if (it.recipe && it.recipe.length) it.cost = recipeCost(it.recipe, ings); }

// ---------- Loyalty card PIN: a phone number alone never opens a card ----------
const PIN_TRIES = 5, PIN_LOCK_MS = 15 * 60000;
// staff PINs that anyone would try first: repeated digits, runs like 1234 / 4321, and a short list of favourites
const weakPin = (p) => { p = String(p || ''); return /^(\d)\1+$/.test(p) || '0123456789'.includes(p) || '9876543210'.includes(p) || ['1212', '2121', '1122', '2580', '1004', '2000', '2020', '2024', '2025', '2026', '1010', '6969', '1313', '0852', '1590', '1357', '2468'].includes(p); };
const pinOk = (p) => /^\d{4,6}$/.test(String(p || ''));
// salted, stretched hash (pure JS so the browser demo can run it too); the real protection is the lock-out below
function pinHash(phone, pin) { let h = 2166136261; const s = 'tt|' + phone + '|' + pin; for (let r = 0; r < 2000; r++) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i) + r; h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
// -> { ok, set, code } ; mutates the member's attempt counters
function pinCheck(mem, pin, now) {
  if (mem.lockUntil && mem.lockUntil > now) return { ok: false, code: 'locked' };
  if (!pinOk(pin)) return { ok: false, code: 'bad' };
  if (!mem.pin) { mem.pin = pinHash(mem.phone, pin); mem.tries = 0; return { ok: true, set: true }; }
  if (mem.pin === pinHash(mem.phone, pin)) { mem.tries = 0; mem.lockUntil = 0; return { ok: true }; }
  mem.tries = (mem.tries || 0) + 1; if (mem.tries >= PIN_TRIES) { mem.lockUntil = now + PIN_LOCK_MS; mem.tries = 0; return { ok: false, code: 'locked' }; }
  return { ok: false, code: 'wrong', left: PIN_TRIES - mem.tries };
}

// ---------- Staff attendance: weekly shifts and wages ----------
// shifts: { 0..6 (Sunday = 0): { from: 'HH:MM', to: 'HH:MM' } }; a day without both times is a day off
function shiftsClean(v) {
  const out = {}; v = v && typeof v === 'object' ? v : {};
  for (let d = 0; d < 7; d++) { const x = v[d]; if (x && hmOk(x.from, '') && hmOk(x.to, '')) out[d] = { from: x.from, to: x.to }; }
  return out;
}
const wageClean = (n) => Math.min(100000, Math.max(0, Math.round((+n || 0) * 100) / 100));
const hmMin = (x) => { const [h, m] = String(x).split(':').map(Number); return h * 60 + m; };

// ---------- Branded invoices, suppliers and purchase orders ----------
const INV_STYLES = ['classic', 'modern', 'minimal'];
const clip = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
function invoiceBrandClean(v, cur) {
  v = v && typeof v === 'object' ? v : {}; cur = cur || {};
  const pre = (x, d) => { const s = String(x || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8); return s || d; };
  return { legalName: clip(v.legalName, 80), tradeName: clip(v.tradeName, 80), address: clip(v.address, 200), phone: clip(v.phone, 30), email: clip(v.email, 80), taxId: clip(v.taxId, 30), commercialReg: clip(v.commercialReg, 30),
    logo: cur.logo || '', accent: /^#[0-9a-fA-F]{6}$/.test(v.accent || '') ? v.accent : '#8a6d3b', style: INV_STYLES.includes(v.style) ? v.style : 'classic', lang: ['en', 'ar', 'both'].includes(v.lang) ? v.lang : 'en',
    footer: clip(v.footer, 300), terms: clip(v.terms, 500), bank: clip(v.bank, 200), prefix: pre(v.prefix, 'INV-'), poPrefix: pre(v.poPrefix, 'PO-'), paper: v.paper === 'A5' ? 'A5' : 'A4' };
}
const money2 = (n) => Math.round((+n || 0) * 100) / 100;
function docLines(arr) { return (Array.isArray(arr) ? arr : []).slice(0, 60).map((l) => ({ desc: clip(l && l.desc, 140), qty: Math.min(1e6, Math.max(0, +(l && l.qty) || 0)), unit: clip(l && l.unit, 10), price: Math.min(1e7, Math.max(0, money2(l && l.price))) })).filter((l) => l.desc && l.qty > 0); }
// totals for a document: lines - discount, service charge, then tax on the result
function docTotals(lines, discount, servicePct, taxPct) {
  const sub = money2(lines.reduce((n, l) => n + l.qty * l.price, 0)), disc = Math.min(sub, money2(discount)), net = money2(sub - disc), service = money2(net * Math.min(100, Math.max(0, +servicePct || 0)) / 100), base = money2(net + service), tax = money2(base * Math.min(100, Math.max(0, +taxPct || 0)) / 100);
  return { sub, discount: disc, service, tax, total: money2(base + tax) };
}
const partyClean = (v) => { v = v && typeof v === 'object' ? v : {}; return { name: clip(v.name, 80), taxId: clip(v.taxId, 30), address: clip(v.address, 200), phone: clip(v.phone, 30), email: clip(v.email, 80) }; };
const supplierClean = (v) => ({ ...partyClean(v), notes: clip(v && v.notes, 300), terms: clip(v && v.terms, 100) });

// ---------- Upsell suggestions ----------
// Which dishes to offer next to what is already in the cart. Pure: the guest page and the tests call the same function.
// cfg = { items, categories, best: [itemId...], settings }, cartIds = item ids in the cart, o.isOpen(item) = timed-category check, o.skip = ids the guest dismissed
const UP_DEFAULT = { enabled: false, max: 4 };
const upCfg = (settings) => { const u = { ...UP_DEFAULT, ...((settings && settings.upsell) || {}) }; u.max = Math.min(6, Math.max(1, Math.floor(+u.max) || 3)); u.enabled = !!u.enabled; return u; };
function catRole(c) {
  if (!c) return 'food'; if (['food', 'drink', 'dessert'].includes(c.role)) return c.role;
  const n = (c.name + ' ' + (c.name_ar || '')).toLowerCase();
  if (/dessert|sweet|cake|ice cream|حلو|حلويات/.test(n)) return 'dessert';
  if (/coffee|tea|drink|juice|mocktail|smoothie|beverage|shake|water|قهوة|شاي|عصير|مشروب|موكتيل|مياه/.test(n)) return 'drink';
  return 'food';
}
// item-level roles so a bottle of water or a side of fries is recognised even when it sits in a "Extras" or "Mains" category
const DRINK_RE = /pepsi|cola|coca|sprite|fanta|7 ?up|mirinda|soda|soft drink|water|juice|lemonade|iced tea|ice tea|energy drink|بيبسي|كولا|كوكا|سبرايت|فانتا|ميرندا|صودا|مياه|مية|عصير|ليمون/i;
const WATER_RE = /water|مياه|مية/i;
const SIDE_RE = /fries|salad|tahini|tahina|hummus|dip\b|coleslaw|pickle|bread|rice|garlic|sauce|onion rings|بطاطس|سلطة|طحينة|حمص|مخلل|عيش|أرز|رز|ثومية|تومية|صوص|كولسلو/i;
const HOT_RE = /flat white|cortado|americano|hot |coffee|espresso|cappuccino|latte|macchiato|mocha|turkish|tea|chocolate|قهوة|شاي|إسبرسو|كابتشينو|لاتيه|موكا/i, COLD_RE = /iced|cold|ice|frozen|smoothie|mojito|lemon|juice|orange|mango|water|soda|pepsi|cola|مثلج|بارد|عصير|ليمون|مياه|موهيتو/i;
const ADDON_CAT_RE = /extra|add-?on|إضاف/i;
function itemRole(i, cat) {
  const n = (i.name || '') + ' ' + (i.name_ar || '');
  if (DRINK_RE.test(n)) return 'drink';
  if (SIDE_RE.test(n)) return 'side';
  if (cat && ADDON_CAT_RE.test((cat.name || '') + ' ' + (cat.name_ar || ''))) return 'addon';
  return catRole(cat);
}
// o = { isOpen(item), skip: [ids dismissed or already ordered], ordered: [ids already ordered earlier at this table] }
function upsellFor(cfg, cartIds, o = {}) {
  const u = upCfg(cfg.settings); if (!u.enabled) return [];
  const byId = Object.fromEntries(cfg.items.map((i) => [i.id, i])), role = (i) => itemRole(i, cfg.categories.find((c) => c.id === i.cat));
  const inCart = new Set(cartIds), skip = new Set(o.skip || []), isOpen = o.isOpen || (() => true);
  const ok = (i) => i && !i.soldOut && !i.hidden && !inCart.has(i.id) && !skip.has(i.id) && isOpen(i);
  const out = [], push = (i) => { if (ok(i) && !out.includes(i.id)) out.push(i.id); };
  cartIds.forEach((id) => byId[id] && (byId[id].pairs || []).forEach((p) => push(byId[p])));   // 1) the owner's hand-picked pairings first
  const mine = cartIds.concat(o.ordered || []).map((id) => byId[id]).filter(Boolean), have = new Set(mine.map(role));
  if (!have.size) return out.slice(0, u.max);
  const hasMeal = have.has('food');
  // what usually completes this order: a meal wants a drink, a side and a dessert; a drink alone wants something to eat; a meal + drink wants a side and dessert
  const want = hasMeal ? ['drink', 'side', 'dessert'].filter((r) => !have.has(r)) : have.has('drink') ? ['dessert', 'food', 'addon'].filter((r) => !have.has(r)) : have.has('dessert') ? ['drink'] : ['drink', 'dessert'];
  if (hasMeal && !want.length) want.push('drink');
  const rank = (cfg.best || []).slice(), pos = (i) => { const k = rank.indexOf(i.id); return k < 0 ? 999 : k; };
  const pool = (r) => cfg.items.filter((i) => role(i) === r && ok(i)).sort((a, b) => pos(a) - pos(b));
  // 2) one from each missing kind first (so a lunch gets a drink AND a side), then a second helping; a drink suggestion always includes water when the menu has it
  const lists = want.map((r) => { let l = pool(r); if (r === 'drink') { const w = l.find((i) => WATER_RE.test(i.name + ' ' + (i.name_ar || ''))), hot = (i) => hasMeal && HOT_RE.test(i.name + ' ' + (i.name_ar || '')) && !COLD_RE.test(i.name + ' ' + (i.name_ar || '')), soft = l.filter((i) => i !== w).sort((x, y) => hot(x) - hot(y)); l = [soft[0], w, ...soft.slice(1)].filter(Boolean); } return l; });
  for (let k = 0; k < 3; k++) lists.forEach((l) => l[k] && push(l[k]));
  return out.slice(0, u.max);
}

// Staff actions that may wait in the offline queue. Payments / voids / discounts are deliberately NOT here: money needs a live connection.
const OFFLINE_OK = ['staff_order', 'open_ticket', 'seat_table', 'resolve_request', 'order_status'];
const offlineQueueable = (t) => OFFLINE_OK.includes(t);

// ---------- Coupons, timed offers, gift cards ----------
// Pure rules shared by the engine and the tests. All money 2 decimals. Codes are compared upper-case.
const PROMO_DEFAULT = { enabled: false, stack: false };
const promoCfg = (settings) => ({ ...PROMO_DEFAULT, ...((settings && settings.promo) || {}), enabled: !!(settings && settings.promo && settings.promo.enabled), stack: !!(settings && settings.promo && settings.promo.stack) });
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
const r2 = (x) => Math.round((+x + Number.EPSILON) * 100) / 100;
const cutAmount = (kind, value, base) => r2(kind === 'pct' ? base * Math.min(100, Math.max(0, +value || 0)) / 100 : Math.min(base, Math.max(0, +value || 0)));
// is a timed offer running at this moment (local time of the venue = server clock offset passed by caller)
function offerLive(o, now) {
  if (!o || !o.active) return false;
  const d = new Date(now), mins = d.getHours() * 60 + d.getMinutes(), hm = (x) => { const [h, m] = String(x || '0:0').split(':'); return (+h || 0) * 60 + (+m || 0); };
  if (o.from && now < o.from) return false; if (o.to && now > o.to) return false;
  if (Array.isArray(o.days) && o.days.length && !o.days.includes(d.getDay())) return false;
  const a = hm(o.start), b = hm(o.end); if (o.start === undefined && o.end === undefined) return true;
  return a <= b ? mins >= a && mins < b : mins >= a || mins < b;   // overnight windows allowed
}
// coupon check -> { ok, reason, amount }
function couponCheck(c, gross, now) {
  if (!c) return { ok: false, reason: 'unknown' };
  if (!c.active) return { ok: false, reason: 'inactive' };
  if (c.from && now < c.from) return { ok: false, reason: 'notyet' };
  if (c.to && now > c.to) return { ok: false, reason: 'expired' };
  if (c.maxUses > 0 && (c.uses || 0) >= c.maxUses) return { ok: false, reason: 'used' };
  if (c.minSpend > 0 && gross < c.minSpend) return { ok: false, reason: 'min', min: c.minSpend };
  return { ok: true, amount: cutAmount(c.kind, c.value, gross) };
}
// the promotional discount for a bill: coupon + best live offer. stack=false -> only the single biggest of (manual discount, coupon, offer)
function promoPick(o) {
  const { manual = 0, coupon = 0, offer = 0, stack, gross } = o;
  if (stack) { const t = Math.min(gross, manual + coupon + offer); return { manual, coupon, offer, total: r2(t) }; }
  const m = Math.max(manual, coupon, offer);
  return { manual: m === manual ? manual : 0, coupon: m === coupon && m !== manual ? coupon : 0, offer: m === offer && m !== manual && m !== coupon ? offer : 0, total: r2(m) };
}
const giftBalanceOk = (g) => !!g && g.balance > 0 && (!g.expires || g.expires > Date.now());

// ---------- Loyalty ----------
const LOYALTY_DEFAULT = { enabled: true, egpPerPoint: 10, pointsPerRedeem: 100, redeemValue: 50 };
const loyaltyCfg = (settings) => ({ ...LOYALTY_DEFAULT, ...(settings.loyalty || {}) });
const cleanPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 && d.length <= 14 ? d.replace(/^0020/, '0').replace(/^20(1\d{9})$/, '0$1') : ''; };
const earnPoints = (cfg, spend) => (cfg.egpPerPoint > 0 ? Math.floor(Math.max(0, spend) / cfg.egpPerPoint) : 0);
const pointsToEgp = (cfg, pts) => (cfg.pointsPerRedeem > 0 ? +(pts * cfg.redeemValue / cfg.pointsPerRedeem).toFixed(2) : 0);

// ---------- OCR menu digitizer ----------
// Turns raw OCR / vision text into menu items. Lines such as "Cappuccino ........ 70" or "Shakshuka 120 EGP - eggs in tomato sauce".
// Lines without a price that are short and mostly letters become category headings.
function parseMenuText(text) {
  const cats = [], items = [];
  let cur = null;
  String(text || '').split(/\r?\n/).map((l) => l.replace(/[‎‏]/g, '').trim()).filter(Boolean).forEach((line) => {
    const m = line.match(/^(.*?)[\s.\-–—:_]*?(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:EGP|LE|L\.E\.?|جنيه|ج\.م|ج)?\s*(?:[-–—:|]\s*(.*))?$/i);
    if (m && m[1] && /[\p{L}]/u.test(m[1])) {
      if (!cur) { cur = 'Menu'; cats.push(cur); }
      const name = m[1].replace(/[.\-–—_:\s]+$/, '').trim();
      if (name) items.push({ cat: cur, name, price: +m[2].replace(',', '.'), desc: (m[3] || '').trim() });
    } else if (line.length <= 32 && !/\d/.test(line)) { cur = line.replace(/[:\-–—*#]+$/g, '').trim(); if (cur && !cats.includes(cur)) cats.push(cur); }
  });
  return { categories: cats, items };
}
const OCR_SAMPLE = `HOT DRINKS
Espresso ........ 45
Cappuccino ........ 70 - espresso with silky milk foam
Turkish Coffee ........ 50
COLD DRINKS
Iced Latte ........ 80
Fresh Orange ........ 65
Lemon Mint ........ 55
FOOD
Shakshuka ........ 120 - eggs in spicy tomato sauce
Chicken Panini ........ 150
Cheesecake ........ 110`;

// ---------- Admin copilot ----------
// Answers owner questions from the live data; a few phrases also change settings. `ctx` = { db, analytics, loyaltyStats, setLang }.
const LANG_WORDS = [['ar', /ammiya|ameya|masri|egypt|عامية|مصري|عربي/i], ['fr', /franco|فرانكو|arabizi/i], ['en', /english|انجليزي|إنجليزي/i]];
const LANG_NAMES = { en: 'English', ar: 'Egyptian Ammiya (عامية مصرية)', fr: 'Franco-Arabic' };
const AI_DEFAULT = { name: '', style: '', memory: [] };
function aiCfg(settings) { const a = (settings && settings.ai) || {}; return { name: String(a.name || '').slice(0, 40), style: String(a.style || '').slice(0, 1200), memory: (Array.isArray(a.memory) ? a.memory : []).slice(0, 40).map((m) => ({ id: String(m.id || ''), text: String(m.text || '').slice(0, 300), at: +m.at || 0 })).filter((m) => m.text) }; }
const hasAr = (s) => /[؀-ۿ]/.test(String(s || ''));
// A long-lived assistant brief: who the owner is, how they like to be spoken to, and the facts they asked it to remember
function aiSystemPrompt(settings, extra) {
  const a = aiCfg(settings), cur = settings.currency || 'EGP';
  return [`You are ${a.name || 'the AI assistant'} of "${settings.name || 'this restaurant'}", a cafe/restaurant in Egypt, speaking privately with its owner or manager.`,
    'Reply in the language the user writes in (Egyptian Arabic in Arabic script, or English). If they write Arabic, answer in natural Egyptian Arabic (عامية مصرية), never in stiff formal Arabic unless asked. Keep replies short and practical.',
    'You can chat about anything the owner wants (business advice, ideas, writing, general questions), and you also see this restaurant\'s live numbers below. Never invent figures that are not in the data.',
    a.style ? 'How the owner wants you to talk (follow this):\n' + a.style : '',
    a.memory.length ? 'Things the owner asked you to remember about them and the business:\n' + a.memory.map((m) => '- ' + m.text).join('\n') : '',
    'Currency: ' + cur + '.', extra || ''].filter(Boolean).join('\n\n');
}
function copilot(q, ctx) {
  const raw = String(q || '').trim(), t = raw.toLowerCase(), { db } = ctx, cur = db.settings.currency || 'EGP', AR = hasAr(raw);
  const R = (en, ar) => (AR ? ar : en), curA = cur === 'EGP' ? 'جنيه' : cur;
  const money = (n) => Math.round(n).toLocaleString('en-US') + ' ' + (AR ? curA : cur);
  const ai = (db.settings.ai = aiCfg(db.settings));
  const day = ctx.analytics(1);
  // ---- memory: remember / forget / recall ----
  let m = raw.match(/^(?:please\s+)?(?:remember|note|save|keep in mind)\b[\s:,-]*(?:that\s+)?(.+)$/is) || raw.match(/^(?:تذكر|افتكر|فتكر|احفظ|سجل|خد بالك|خليك فاكر)[\s:،-]*(?:(?:ان|إن|أن)\s+)?(.+)$/s);
  if (m && m[1].trim().length > 2) {
    if (ai.memory.length >= 40) return { reply: R('My memory is full (40 notes). Delete a few in the AI settings first.', 'الذاكرة اتملت (40 ملاحظة). امسح شوية من إعدادات الذكاء الاصطناعي الأول.') };
    ai.memory.push({ id: Math.random().toString(36).slice(2, 9), text: m[1].trim().slice(0, 300), at: Date.now() });
    return { reply: R(`Got it - I'll remember: "${m[1].trim()}"`, `تمام، هفتكر: "${m[1].trim()}"`), action: 'memory' };
  }
  if (/^(?:forget|clear|erase|delete)\b.*\b(?:everything|all|memory)\b/i.test(raw) || /(انسى|امسح|احذف|فضي).*(كل|الكل|الذاكرة)/.test(raw)) { const n = ai.memory.length; ai.memory = []; return { reply: R(`Done - I forgot all ${n} notes.`, `تم، نسيت كل الملاحظات (${n}).`), action: 'memory' }; }
  m = raw.match(/^(?:forget|delete|erase)\b[\s:,-]*(?:that\s+)?(.+)$/is) || raw.match(/^(?:انسى|امسح|احذف)[\s:،-]*(.+)$/s);
  if (m) { const k = m[1].trim().toLowerCase(), hit = ai.memory.filter((x) => x.text.toLowerCase().includes(k)); if (hit.length) { ai.memory = ai.memory.filter((x) => !hit.includes(x)); return { reply: R(`Forgot ${hit.length} note(s) about "${m[1].trim()}".`, `نسيت ${hit.length} ملاحظة عن "${m[1].trim()}".`), action: 'memory' }; } return { reply: R(`I have nothing remembered about "${m[1].trim()}".`, `معنديش حاجة متسجلة عن "${m[1].trim()}".`) }; }
  if (/what (?:do you|did you) (?:remember|know)|your memory|show (?:my )?(?:notes|memory)|what.*(?:saved|remember)/i.test(raw) || /(فاكر|فاكرة|تعرف|الذاكرة|ملاحظاتي|حفظت|سجلت).*(ايه|إيه|اي|ايش|\?|؟)|ايه اللي (فاكر|حافظ)|اعرض.*(ذاكرة|ملاحظات)/.test(raw)) {
    return { reply: ai.memory.length ? R('Here is what I remember:\n', 'ده اللي فاكره:\n') + ai.memory.map((x, i) => `${i + 1}. ${x.text}`).join('\n') : R('I have no notes yet. Say "Remember that ..." and I will keep it.', 'لسه مفيش ملاحظات. قولي "تذكر إن ..." وهحفظها.') };
  }
  // ---- how to talk / who to be ----
  m = raw.match(/^(?:from now on|always|please)?[\s,]*(?:talk|speak|reply|answer|respond|call me|be)\b(.+)$/is);
  if (m && /(talk|speak|reply|answer|respond|call me|be )/i.test(raw) && /(like|formal|short|brief|friendly|polite|funny|detail|casual|boss|call me|more|less|style|tone|in egyptian|in arabic|in english)/i.test(raw) && raw.length < 300 && !/\?$/.test(raw)) {
    ai.style = (ai.style ? ai.style + '\n' : '') + raw.slice(0, 300); ai.style = ai.style.slice(-1200);
    return { reply: R('Understood - I will talk to you that way from now on.', 'تمام، هكلمك بالطريقة دي من دلوقتي.'), action: 'memory' };
  }
  m = raw.match(/^(?:كلمني|اتكلم معايا|رد عليا|ناديني|خليك)\s+(.+)$/s);
  if (m && raw.length < 300 && !/[?؟]$/.test(raw)) { ai.style = ((ai.style ? ai.style + '\n' : '') + raw.slice(0, 300)).slice(-1200); return { reply: 'تمام، هكلمك بالطريقة دي من دلوقتي.', action: 'memory' }; }
  m = raw.match(/^(?:your name is|call yourself|i(?:'ll| will) call you)\s+(.+)$/i) || raw.match(/^(?:اسمك|هسميك|اسمك يبقى)\s+(.+)$/);
  if (m) { ai.name = m[1].trim().slice(0, 40); return { reply: R(`Nice - call me ${ai.name}.`, `حلو، ناديني ${ai.name}.`), action: 'memory' }; }
  // ---- settings and live numbers ----
  if (/(switch|change|set|خلي|غير|بدل|حول).*(lang|لغة|language)|default.*lang/i.test(t) || /(lang|لغة).*(ammiya|franco|english|masri|عامية|فرانكو|انجليزي|إنجليزي)/i.test(t)) {
    const hit = LANG_WORDS.find(([, re]) => re.test(raw));
    if (hit) { ctx.setLang(hit[0]); return { reply: R(`Done - the default menu language is now ${LANG_NAMES[hit[0]]}.`, `تم، لغة المنيو الأساسية بقت ${LANG_NAMES[hit[0]]}.`), action: 'language' }; }
  }
  const rt = t.match(/(\d+)\s*(?:egp|le|جنيه)?\s*(?:=|per|for|each|every|مقابل|لكل|ب)\s*(?:1\s*|واحد\s*)?(?:point|نقطة|نقطه)/);
  if (rt && +rt[1] > 0) { db.settings.loyalty = { ...loyaltyCfg(db.settings), egpPerPoint: +rt[1] }; return { reply: R(`Customers now earn 1 point for every ${rt[1]} ${cur} spent.`, `العملاء دلوقتي بياخدوا نقطة على كل ${rt[1]} ${curA} بيصرفوها.`), action: 'loyalty' }; }
  const so = t.match(/(?:mark|set)\s+(.+?)\s+(?:as\s+)?(sold ?out|available)/);
  const soA = raw.match(/^(?:خلي|اعمل|علم على)\s+(.+?)\s+(خلصان|خلص|نفذ|نفذت|متاح|موجود)$/);
  if (so || soA) {
    const name = so ? so[1] : soA[1].trim().toLowerCase(), gone = so ? /sold/.test(so[2]) : /خلص|نفذ/.test(soA[2]);
    const it = db.items.find((i) => i.name.toLowerCase().includes(name) || (i.name_ar || '').includes(name));
    if (!it) return { reply: R(`I could not find "${name}" on the menu.`, `ملقيتش "${name}" في المنيو.`) };
    it.soldOut = gone; return { reply: R(`${it.name} is now ${gone ? 'sold out' : 'available'}.`, `${it.name_ar || it.name} بقى ${gone ? 'خلصان' : 'متاح'}.`), action: 'item' };
  }
  if (/redeem|redemption|استبدل|اتستبدل|استبدال/.test(t)) { const s = ctx.loyaltyStats(); return { reply: R(`${s.redeemedToday} points were redeemed today (${money(s.redeemedEgpToday)} in discounts). ${s.members} members hold ${s.outstanding} points in total.`, `النهاردة اتستبدل ${s.redeemedToday} نقطة (خصومات بـ ${money(s.redeemedEgpToday)}). عندك ${s.members} عضو معاهم ${s.outstanding} نقطة إجمالي.`) }; }
  if (/point|loyal|member|نقاط|نقطة|ولاء|اعضاء|أعضاء/.test(t)) { const s = ctx.loyaltyStats(); return { reply: R(`${s.members} loyalty members. ${s.earnedToday} points earned and ${s.redeemedToday} redeemed today. ${s.outstanding} points are outstanding.`, `عندك ${s.members} عضو في برنامج الولاء. النهاردة اتكسب ${s.earnedToday} نقطة واتستبدل ${s.redeemedToday}. إجمالي النقاط القائمة ${s.outstanding}.`) }; }
  if (/best.?sell|sell\w*\s+(the\s+)?(best|most)|(best|top|most).*(sell|item|dish|order)|الأكثر|اكتر|أكتر|الاكثر|أحسن صنف|احسن صنف/.test(t)) {
    const w = ctx.analytics(7).topItems.slice(0, 3);
    return { reply: w.length ? R('Best sellers this week: ' + w.map((x, i) => `${i + 1}. ${x.name} (${x.qty} sold)`).join(', ') + '.', 'الأكتر مبيعًا الأسبوع ده: ' + w.map((x, i) => `${i + 1}. ${x.name_ar || x.name} (${x.qty} مبيعات)`).join('، ') + '.') : R('No sales recorded yet.', 'لسه مفيش مبيعات متسجلة.') };
  }
  if (/(worst|least|slow)|الأقل|الاقل|أبطأ|ابطأ|راكد/.test(t)) {
    const a = ctx.analytics(30).topItems; return { reply: a.length ? R(`Slowest of the top sellers: ${a[a.length - 1].name} (${a[a.length - 1].qty} sold in 30 days).`, `أبطأ صنف: ${a[a.length - 1].name_ar || a[a.length - 1].name} (${a[a.length - 1].qty} مبيعات في 30 يوم).`) : R('No sales recorded yet.', 'لسه مفيش مبيعات متسجلة.') };
  }
  if (/revenue|sales|income|earn|مبيعات|ايراد|إيراد|دخل|كسبنا|فلوس/.test(t)) {
    const w = /week|اسبوع|أسبوع|الاسبوع/.test(t), a = w ? ctx.analytics(7) : day;
    return { reply: R(`${w ? 'Last 7 days' : 'Today'}: ${money(a.kpi.revenue)} from ${a.kpi.orders} paid tables, average ticket ${money(a.kpi.avg)}.`, `${w ? 'آخر 7 أيام' : 'النهاردة'}: ${money(a.kpi.revenue)} من ${a.kpi.orders} طاولة اتدفعت، ومتوسط الفاتورة ${money(a.kpi.avg)}.`) };
  }
  if (/order|ticket|tables? (open|busy)|طلبات|طاولات|طاولة|ترابيزات/.test(t)) {
    const live = Object.values(db.sessions), wait = live.filter((s) => s.orders.some((o) => o.status === 'received')).length;
    return { reply: R(`${live.length} tables are open right now, ${wait} with orders waiting for the kitchen. ${day.kpi.orders} tables paid today.`, `فيه ${live.length} طاولة مفتوحة دلوقتي، منهم ${wait} طلباتهم مستنية المطبخ. و${day.kpi.orders} طاولة اتدفعت النهاردة.`) };
  }
  if (/stock|low|inventory|مخزون|ناقص|قرب يخلص|قربت تخلص/.test(t)) { const l = day.lowStock; return { reply: l.length ? R('Running low: ' + l.map((x) => `${x.name} (${x.stock})`).join(', ') + '.', 'قرب يخلص: ' + l.map((x) => `${x.name_ar || x.name} (${x.stock})`).join('، ') + '.') : R('Nothing is running low.', 'مفيش حاجة قربت تخلص.') }; }
  return { reply: R('I can answer: "How many points were redeemed today?", "Which item sells best?", "What is today\'s revenue?", "What is low in stock?", or do: "Switch default language to Egyptian Ammiya", "Mark Cheesecake sold out", "Set 5 EGP per point", "Remember that ...". Connect the AI key to chat about anything else.', 'أقدر أجاوب: "النهاردة اتستبدل كام نقطة؟"، "إيه أكتر صنف مبيعًا؟"، "إيرادات النهاردة كام؟"، "إيه اللي قرب يخلص؟"، وأقدر أنفذ: "غير لغة المنيو لعامية"، "خلي الكيك خلصان"، "خلي كل 5 جنيه نقطة"، "تذكر إن ...". ولو الذكاء الاصطناعي متوصل أقدر أتكلم معاك في أي موضوع.'), unknown: true };
}

// ---------- Online ordering (guest storefront: pickup + delivery, pay on receipt) ----------
const ONLINE_DEFAULT = { enabled: false, pickup: true, delivery: false, minOrder: 0, feeItemId: '', prepMin: 20, note: '', zones: [], desk: false };
// Car service: guests park outside, order from the car (colour, type, name) and staff bring it out. Not part of any bundle by default - an add-on switched on per venue (or added to a bundle) by the super admin.
const CAR_COLORS = ['white', 'black', 'silver', 'grey', 'red', 'blue', 'green', 'yellow', 'orange', 'brown', 'beige', 'gold', 'other'];
const CAR_DEFAULT = { enabled: false, prepMin: 10, spots: 0, askPlate: true, desk: false, note: '' };
const carCfg = (settings) => { const o = { ...CAR_DEFAULT, ...((settings && settings.car) || {}) }; o.enabled = !!o.enabled; o.prepMin = Math.min(120, Math.max(2, Math.floor(+o.prepMin) || 10)); o.spots = Math.min(99, Math.max(0, Math.floor(+o.spots) || 0)); o.askPlate = o.askPlate !== false; o.desk = !!o.desk; o.note = String(o.note || '').replace(/[<>]/g, '').slice(0, 200); return o; };
const carClean = (v, cfg) => {
  v = v || {}; const c = cfg || CAR_DEFAULT, t = (x, n) => String(x == null ? '' : x).replace(/[<>]/g, '').trim().slice(0, n);
  const color = CAR_COLORS.includes(String(v.color)) ? String(v.color) : '', type = t(v.type, 30), plate = c.askPlate === false ? '' : t(v.plate, 12).toUpperCase(), spot = t(v.spot, 12);
  if (!color) return { error: 'Choose the colour of your car', code: 'color' };
  if (!type) return { error: 'Enter the type of your car (for example Toyota Corolla)', code: 'cartype' };
  if (c.spots > 0 && !(spot && /^\d+$/.test(spot) && +spot >= 1 && +spot <= c.spots)) return { error: 'Choose your parking spot number', code: 'spot' };
  return { color, type, plate, spot };
};
const onlineCfg = (settings) => { const o = { ...ONLINE_DEFAULT, ...((settings && settings.online) || {}) }; o.enabled = !!o.enabled; o.pickup = o.pickup !== false; o.delivery = !!o.delivery; o.minOrder = Math.max(0, +o.minOrder || 0); o.prepMin = Math.min(180, Math.max(5, Math.floor(+o.prepMin) || 20)); o.feeItemId = String(o.feeItemId || '').slice(0, 40); o.note = String(o.note || '').slice(0, 200); o.zones = zonesCfg(o.zones); o.desk = !!o.desk; return o; };

// ---------- Location: delivery zones + "order only from inside the cafe" ----------
const geoPoint = (g) => { if (!g || g.lat === '' || g.lng === '' || g.lat == null || g.lng == null) return null; const lat = +g.lat, lng = +g.lng; return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null; };
const distM = (a, b) => { const R = 6371000, rad = (x) => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng), h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
const GEOLOCK_DEFAULT = { enabled: false, radiusM: 150 };
const geoLockCfg = (settings) => { const g = { ...GEOLOCK_DEFAULT, ...((settings && settings.geoLock) || {}) }; g.enabled = !!g.enabled; g.radiusM = Math.min(1000, Math.max(30, Math.floor(+g.radiusM) || 150)); return g; };
// Is this guest's phone at the cafe? Indoor GPS is rough, so the phone's reported accuracy (capped at 100 m) is forgiven.
function geoCheck(settings, g) {
  const v = geoPoint(settings && settings.venueGeo), here = geoPoint(g), cfg = geoLockCfg(settings);
  if (!v) return { ok: true, off: true };
  if (!here) return { ok: false, code: 'nogeo' };
  const d = distM(v, here), acc = Math.min(100, Math.max(0, +g.acc || 0));
  return d - acc <= cfg.radiusM ? { ok: true, dist: Math.round(d) } : { ok: false, code: 'far', dist: Math.round(d) };
}
// Delivery zones: [{ km, fee }] ascending, "up to km kilometres costs fee"; farther than the last zone is refused.
const zonesCfg = (z) => (Array.isArray(z) ? z : []).filter((x) => x && +x.km > 0).map((x) => ({ km: Math.round(Math.min(100, Math.max(0.1, +x.km)) * 10) / 10, fee: Math.round(Math.max(0, +x.fee || 0) * 100) / 100 })).sort((a, b) => a.km - b.km).slice(0, 8);
function zoneFor(settings, g) {
  const o = onlineCfg(settings), v = geoPoint(settings && settings.venueGeo);
  if (!o.zones.length) return { ok: true, flat: true, fee: 0 };
  if (!v) return { ok: true, flat: true, fee: 0, unset: true };   // zones are configured but the cafe location is not: do not block orders on a setup mistake
  const here = geoPoint(g); if (!here) return { ok: false, code: 'nogeo' };
  const km = Math.round(distM(v, here) / 100) / 10, z = o.zones.find((x) => km <= x.km);
  return z ? { ok: true, km, fee: z.fee, zone: z.km } : { ok: false, code: 'far', km, max: o.zones[o.zones.length - 1].km };
}



const STAFF_LOG_KEYS = ['taken', 'handled', 'started', 'served', 'closed', 'respMs'];   // column order of rec.staffLog[id].b[hour]
const WASTE_CAUSES = ['expired', 'spoiled', 'spilled', 'overprep', 'staffmeal', 'returned', 'other'];
const api = { weakPin, itemRole, CAR_COLORS, CAR_DEFAULT, carCfg, carClean, WASTE_CAUSES, invoiceBrandClean, docLines, docTotals, partyClean, supplierClean, INV_STYLES, shiftsClean, wageClean, hmMin, pinOk, pinHash, pinCheck, UNITS, ingClean, recipeClean, recipeCost, recost, reserveClean, reserveCfg, reserveHoursOk, DIGITAL, ipClean, ipCfg, OPT_MAX, optClean, optResolve, ALLERGENS, BADGES, detailsClean, CATALOG, FEATURE_IDS, configure, geoPoint, distM, geoLockCfg, geoCheck, zonesCfg, zoneFor, STAFF_LOG_KEYS, onlineCfg, OFFLINE_OK, offlineQueueable, promoCfg, normCode, cutAmount, offerLive, couponCheck, promoPick, giftBalanceOk, upCfg, upsellFor, catRole, limitsOf, limitCheck, aiCfg, aiSystemPrompt, hasAr, AI_DEFAULT, SIG_THEMES, PRO_THEMES, PREMIUM_THEMES, LUX_THEMES, PLANS, ORDER, planOf, featuresOf, has, minPlanFor, monthly, LOYALTY_DEFAULT, loyaltyCfg, cleanPhone, earnPoints, pointsToEgp, parseMenuText, OCR_SAMPLE, copilot, LANG_NAMES };
if (typeof module !== 'undefined') module.exports = api;
