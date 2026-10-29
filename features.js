// Shared (server + browser demo) feature logic: subscription tiers, loyalty maths, OCR menu parsing, admin copilot.
// Pure functions only - no Node APIs - because demo mode runs this file inside the page.

const LUX_THEMES = ['onyx', 'ivory', 'noir', 'champagne', 'emerald', 'bordeaux', 'marble', 'royal'];
const PRO_THEMES = ['slate', 'nordic', 'bistro', 'zen', 'trattoria', 'roast', 'steakhouse', 'rooftop'];
const SIG_THEMES = ['aurum', 'ember', 'sunset', 'platinum', 'rosegold', 'sapphire', 'jade', 'amethyst'];
const PREMIUM_THEMES = ['neon', 'luxury', 'vibrant'].concat(LUX_THEMES, PRO_THEMES, SIG_THEMES);
const PLANS = {
  basic: { id: 'basic', tier: 1, name: 'Basic QR Menu', name_ar: 'منيو QR الأساسي', price: [350, 500], features: ['menu', 'qr', 'micro', 'admin'] },
  operations: { id: 'operations', tier: 2, name: 'Full Operations & Staff POS', name_ar: 'التشغيل الكامل ونقطة البيع', price: [850, 1000], features: ['ordering', 'staff', 'kds', 'cashier', 'lock', 'party', 'trilingual'] },
  vip: { id: 'vip', tier: 3, name: 'Enterprise VIP & AI', name_ar: 'VIP والذكاء الاصطناعي', price: [1450, 1450], features: ['loyalty', 'ocr', 'copilot', 'themes', 'branches'] },
};
// older plan names keep working: they map onto the new tiers
const LEGACY = { standard: 'operations', pro: 'vip', enterprise: 'vip', demo: 'vip' };
const ORDER = ['basic', 'operations', 'vip'];
const planOf = (p) => (PLANS[p] ? p : LEGACY[p] || 'operations');
function featuresOf(p) {
  const out = {}, upto = ORDER.indexOf(planOf(p));
  ORDER.forEach((id, i) => PLANS[id].features.forEach((f) => (out[f] = i <= upto)));
  return out;
}
const has = (p, f) => !!featuresOf(p)[f];
const minPlanFor = (f) => ORDER.find((id) => PLANS[id].features.includes(f));
const monthly = (p) => PLANS[planOf(p)].price[0];

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

const api = { aiCfg, aiSystemPrompt, hasAr, AI_DEFAULT, SIG_THEMES, PRO_THEMES, PREMIUM_THEMES, LUX_THEMES, PLANS, ORDER, planOf, featuresOf, has, minPlanFor, monthly, LOYALTY_DEFAULT, loyaltyCfg, cleanPhone, earnPoints, pointsToEgp, parseMenuText, OCR_SAMPLE, copilot, LANG_NAMES };
if (typeof module !== 'undefined') module.exports = api;
