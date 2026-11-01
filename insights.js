// Venue + staff analytics: peaks and drops by hour / weekday / day, per-captain activity reports with flags, review themes,
// and rule-based suggestions (English + Egyptian Arabic). Pure functions: no I/O, no Node-only APIs, all numbers computed here.
// The AI layer (server.js) only rewrites this output in plain language; it never invents numbers.
const KEYS = ['taken', 'handled', 'started', 'served', 'closed', 'respMs'];   // keep in sync with features.STAFF_LOG_KEYS
const DAY = 86400000;
const r1 = (n) => Math.round(n * 10) / 10, r2 = (n) => Math.round(n * 100) / 100, sum = (a, f = (x) => x) => a.reduce((n, x) => n + f(x), 0);
const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const dayKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const hh = (h) => String(h % 24).padStart(2, '0') + ':00';
// consecutive hours -> [[from, toExclusive], ...]
const windows = (hrs) => { const out = []; hrs.slice().sort((a, b) => a - b).forEach((h) => { const l = out[out.length - 1]; if (l && l[1] === h) l[1] = h + 1; else out.push([h, h + 1]); }); return out; };
const winTxt = (w) => w.map(([a, b]) => hh(a) + '-' + hh(b)).join(', ');
const DOW_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], DOW_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// words guests use in comments, grouped by what the owner can act on
const THEMES = {
  slow: { re: /slow|wait|waiting|late|long time|delay|took (?:too )?long|بطيء|بطئ|تأخر|اتأخر|مستني|مستنيين|وقت طويل|استنينا/i, en: 'slow service / long waits', ar: 'بطء الخدمة وطول الانتظار' },
  cold: { re: /cold|not hot|lukewarm|barely warm|بارد|ساقع|سقع|فاتر/i, en: 'food or drinks served cold', ar: 'الأكل أو المشروبات واصلة باردة' },
  dirty: { re: /dirty|unclean|smell|toilet|bathroom|restroom|sticky|وسخ|متسخ|مش نظيف|ريحة|ريحه|حمام|لزق/i, en: 'cleanliness (tables, restrooms, smell)', ar: 'النظافة (الترابيزات، الحمامات، الريحة)' },
  price: { re: /expensive|overpriced|too much|pricey|rip.?off|غالي|غاليه|غلا|أسعار عالية|اسعار عالية|مبالغ/i, en: 'prices feel too high', ar: 'الأسعار عالية' },
  portion: { re: /small portion|tiny|portion|too little|not enough food|كمية قليلة|الكمية|صغير|قليل/i, en: 'portions too small', ar: 'الكميات صغيرة' },
  rude: { re: /rude|attitude|ignored|unfriendly|disrespect|مش محترم|قلة ذوق|تجاهل|وحش في التعامل|تعامل وحش|معاملة سيئة/i, en: 'staff attitude', ar: 'تعامل الموظفين' },
  taste: { re: /tasteless|bland|too salty|salty|raw|burnt|stale|مالح|بلا طعم|ملوش طعم|محروق|نيئ|مش مستوي|بايت/i, en: 'taste or cooking quality', ar: 'الطعم أو جودة الطهي' },
  noise: { re: /noisy|too loud|crowded|cramped|زحمة|زحمه|دوشة|دوشه|صوت عالي/i, en: 'noise or crowding', ar: 'الدوشة أو الزحمة' },
};
const CAT_ACT = {
  quality: { en: 'Food quality is the weakest point. Taste the top sellers yourself this week, check ingredient freshness and make sure every cook follows the same recipe card.', ar: 'جودة الأكل هي أضعف نقطة. جرّب أكثر الأصناف مبيعاً بنفسك الأسبوع ده، راجع طزاجة المكونات، وتأكد إن كل الطباخين ماشيين على نفس الوصفة.', label: ['Food quality', 'جودة الأكل'] },
  portions: { en: 'Guests feel portions are small. Re-weigh the main dishes against the price, or add a larger size / side so the value is clearer.', ar: 'الضيوف حاسين إن الكميات صغيرة. وزّن الأطباق الرئيسية بالنسبة للسعر، أو ضيف حجم أكبر / إضافة عشان القيمة تبان.', label: ['Portion size', 'حجم الأطباق'] },
  price: { en: 'Guests feel the price is high for what they get. Consider value combos or a small price correction on the most criticised items rather than a blanket cut.', ar: 'الضيوف شايفين إن السعر عالي مقابل اللي بياخدوه. جرّب كومبو بقيمة أحسن أو تعديل بسيط في الأصناف المنتقدة بدل تخفيض عام.', label: ['Price / value', 'السعر مقابل القيمة'] },
  service: { en: 'Service scores are low. Review response times per captain below, brief the team before the busy hours, and follow up on the low ratings with comments.', ar: 'تقييم الخدمة منخفض. راجع أوقات الاستجابة لكل كابتن تحت، وقوم بتوعية الفريق قبل ساعات الزحمة، وتابع التقييمات المنخفضة اللي فيها تعليقات.', label: ['Service', 'الخدمة'] },
  clean: { en: 'Cleanliness needs attention. Add a timed cleaning checklist (tables, restrooms, floor) and assign one person per shift to sign it off.', ar: 'النظافة محتاجة اهتمام. اعمل قائمة تنظيف بمواعيد (ترابيزات، حمامات، أرضية) وحدد شخص مسؤول عنها في كل وردية.', label: ['Cleanliness', 'نظافة المكان'] },
};

function analyze(o) {
  const now = o.now || Date.now(), days = Math.min(90, Math.max(1, Math.floor(+o.days) || 14)), from = now - days * DAY, pFrom = from - days * DAY;
  const paid = (o.history || []).filter((h) => !h.unpaid), H = paid.filter((h) => h.closedAt >= from && h.closedAt <= now), P = paid.filter((h) => h.closedAt >= pFrom && h.closedAt < from);
  const today = dayKey(now);

  // ---------- venue: demand by hour, weekday, day ----------
  const hours = Array.from({ length: 24 }, () => ({ orders: 0, revenue: 0 })), daily = {}, dows = Array.from({ length: 7 }, () => []);
  H.forEach((h) => { const hr = new Date(h.startedAt).getHours(); hours[hr].orders++; hours[hr].revenue += h.total; const k = dayKey(h.closedAt); daily[k] = (daily[k] || 0) + h.total; });
  const dayKeys = Object.keys(daily).sort(), fullDays = dayKeys.filter((k) => k !== today), series = fullDays.map((k) => ({ day: k, revenue: r2(daily[k]) }));
  fullDays.forEach((k) => dows[new Date(k + 'T12:00:00').getDay()].push(daily[k]));
  const dowAvg = dows.map((a) => (a.length ? r2(sum(a) / a.length) : 0)), dowN = dows.map((a) => a.length);
  const medDay = med(fullDays.map((k) => daily[k])), drops = medDay ? series.filter((x) => x.revenue < medDay * 0.6 && fullDays.length >= 7) : [], surges = medDay ? series.filter((x) => x.revenue > medDay * 1.5 && fullDays.length >= 7) : [];
  const maxO = Math.max(...hours.map((x) => x.orders), 0), act = hours.map((x, i) => (x.orders ? i : -1)).filter((i) => i >= 0), first = act[0], last = act[act.length - 1];
  const peakHrs = maxO >= 3 ? hours.map((x, i) => [i, x.orders]).filter(([, n]) => n >= Math.max(3, maxO * 0.7)).map(([i]) => i) : [];
  const quietHrs = maxO >= 3 && act.length ? hours.map((x, i) => [i, x.orders]).filter(([i, n]) => i >= first && i <= last && n <= maxO * 0.25).map(([i]) => i) : [];
  const revenue = sum(H, (h) => h.total), prevRev = sum(P, (h) => h.total), revDelta = prevRev > 0 ? r1((revenue - prevRev) / prevRev * 100) : null;
  const onl = H.filter((h) => h.source === 'online'), kinds = { table: 0, takeaway: 0, delivery: 0 }; H.forEach((h) => { kinds[h.kind || 'table'] = (kinds[h.kind || 'table'] || 0) + h.total; });
  const qty = (rows) => { const m = {}; rows.forEach((h) => (h.items || []).forEach((l) => { m[l.name] = (m[l.name] || 0) + l.qty; })); return m; }, cq = qty(H), pq = qty(P);
  const fading = Object.keys(pq).filter((n) => pq[n] >= 8 && (cq[n] || 0) <= pq[n] * 0.5).map((n) => ({ name: n, prev: pq[n], now: cq[n] || 0 })).sort((a, b) => b.prev - a.prev).slice(0, 5);
  const venue = { orders: H.length, revenue: r2(revenue), prevRevenue: r2(prevRev), revDelta, avgTicket: H.length ? r2(revenue / H.length) : 0, activeDays: dayKeys.length, hours: hours.map((x) => ({ orders: x.orders, revenue: r2(x.revenue) })), peakWindows: windows(peakHrs), quietWindows: windows(quietHrs), dowAvg, dowN, series, drops, surges, fading, kinds, online: { orders: onl.length, revenue: r2(sum(onl, (h) => h.total)) } };

  // ---------- reviews ----------
  const RV = (o.reviews || []).filter((x) => x.at >= from && x.at <= now), RP = (o.reviews || []).filter((x) => x.at >= pFrom && x.at < from);
  const catAgg = (rows) => { const out = {}; Object.keys(CAT_ACT).forEach((k) => { const a = rows.filter((x) => x.cats && x.cats[k]); out[k] = { avg: a.length ? r2(sum(a, (x) => x.cats[k]) / a.length) : 0, n: a.length }; }); return out; };
  const cats = catAgg(RV), pcats = catAgg(RP), lows = RV.filter((x) => x.comment && (x.stars <= 3 || Object.values(x.cats || {}).some((v) => v <= 2)));
  const themes = Object.keys(THEMES).map((k) => { const hit = lows.filter((x) => THEMES[k].re.test(x.comment)); return { key: k, count: hit.length, en: THEMES[k].en, ar: THEMES[k].ar, sample: hit[0] ? hit[0].comment.slice(0, 120) : '' }; }).filter((t) => t.count).sort((a, b) => b.count - a.count);
  const reviews = { count: RV.length, avg: RV.length ? r2(sum(RV, (x) => x.stars) / RV.length) : 0, prevAvg: RP.length ? r2(sum(RP, (x) => x.stars) / RP.length) : 0, cats, pcats, themes, lowCount: lows.length, unhandled: (o.reviews || []).filter((x) => x.stars <= 3 && x.handled === false).length };

  // ---------- staff (captain logs) ----------
  const L = o.staffLog || {}, stats = o.staffStats || {}, list = new Map();
  (o.staffList || []).forEach((s) => list.set(s.id, { id: s.id, name: s.name, role: s.role || '' })); Object.keys(L).forEach((id) => { if (!list.has(id)) list.set(id, { id, name: (stats[id] || {}).name || id, role: '' }); });
  const staff = [...list.values()].filter((s) => s.role !== 'kitchen' || L[s.id]).map((s) => {
    const b = L[s.id] ? L[s.id].b || {} : {}, cur = Array(KEYS.length).fill(0), prv = Array(KEYS.length).fill(0), prof = Array(24).fill(0), perDay = {};
    Object.keys(b).forEach((hr) => { const ts = +hr * 3600000, c = b[hr]; if (ts >= from && ts <= now) { c.forEach((v, i) => { cur[i] += v; }); const n = sum(c.slice(0, 5)); prof[new Date(ts).getHours()] += n; const dk = dayKey(ts); perDay[dk] = (perDay[dk] || 0) + n; } else if (ts >= pFrom && ts < from) c.forEach((v, i) => { prv[i] += v; }); });
    const total = sum(cur.slice(0, 5)), ptotal = sum(prv.slice(0, 5)), avgResp = cur[1] ? Math.round(cur[5] / cur[1] / 1000) : 0, pResp = prv[1] ? Math.round(prv[5] / prv[1] / 1000) : 0;
    const isMine = (h) => (h.servedById ? h.servedById === s.id : (h.servedBy || h.closedBy) === s.name), mine = H.filter(isMine), pm = P.filter(isMine), gross = sum(mine, (h) => h.sub || 0), disc = sum(mine, (h) => h.discount || 0), sales = sum(mine, (h) => h.total), pSales = sum(pm, (h) => h.total);
    const voidV = sum(mine, (h) => sum(h.voids || [], (v) => v.qty * v.price)), rv = RV.filter((x) => x.waiter === s.name), prv2 = RP.filter((x) => x.waiter === s.name);
    const mx = Math.max(...prof, 0), sAct = prof.map((n, i) => (n ? i : -1)).filter((i) => i >= 0), sFirst = sAct[0], sLast = sAct[sAct.length - 1];
    const peak = mx >= 3 ? prof.map((n, i) => [i, n]).filter(([, n]) => n >= mx * 0.7).map(([i]) => i) : [], quiet = mx >= 3 ? prof.map((n, i) => [i, n]).filter(([i, n]) => i >= sFirst && i <= sLast && n <= mx * 0.25).map(([i]) => i) : [];
    const flags = [], F = (level, en, ar) => flags.push({ level, en, ar });
    if (cur[1] >= 5 && avgResp > 120) F(avgResp > 300 ? 'alert' : 'warn', `Slow to respond: ${avgResp}s on average (target under 120s)`, `بطيء في الاستجابة: ${avgResp} ثانية في المتوسط (المطلوب أقل من 120)`);
    if (rv.length >= 3 && r2(sum(rv, (x) => x.stars) / rv.length) < 3.5) F('alert', `Guests rate their tables ${r2(sum(rv, (x) => x.stars) / rv.length)}★ on average (${rv.length} ratings)`, `الضيوف بيقيّموا ترابيزاته ${r2(sum(rv, (x) => x.stars) / rv.length)}★ في المتوسط (${rv.length} تقييم)`);
    if (mine.length >= 5 && gross > 0 && disc / gross > 0.1) F('warn', `Gives discounts on ${Math.round(disc / gross * 100)}% of sales (above 10%)`, `بيدّي خصومات بنسبة ${Math.round(disc / gross * 100)}% من المبيعات (أعلى من 10%)`);
    if (mine.length >= 5 && gross > 0 && voidV / gross > 0.05) F('warn', `Voided items are ${Math.round(voidV / gross * 100)}% of sales (above 5%)`, `الأصناف الملغية ${Math.round(voidV / gross * 100)}% من المبيعات (أعلى من 5%)`);
    if (ptotal >= 20 && total < ptotal * 0.7) F('warn', `Activity dropped ${Math.round((1 - total / ptotal) * 100)}% compared with the previous ${days} days`, `النشاط قلّ ${Math.round((1 - total / ptotal) * 100)}% مقارنة بآخر ${days} يوم قبلها`);
    if (pResp && avgResp && cur[1] >= 5 && prv[1] >= 5 && avgResp > pResp * 1.3 && avgResp > 60) F('warn', `Response time got worse: ${pResp}s → ${avgResp}s`, `وقت الاستجابة بقى أسوأ: ${pResp} ثانية ← ${avgResp} ثانية`);
    if (ptotal >= 20 && total === 0) F('warn', 'No activity in this period (was active before)', 'مفيش نشاط في الفترة دي (كان شغال قبل كده)');
    const ev = (L[s.id] ? L[s.id].ev || [] : []).slice(-60).reverse().map(([at, ix, n]) => ({ at, action: KEYS[ix], n }));
    return { id: s.id, name: s.name, role: s.role, total, prevTotal: ptotal, counts: Object.fromEntries(KEYS.slice(0, 5).map((k, i) => [k, cur[i]])), avgResponseSec: avgResp, prevResponseSec: pResp, tables: mine.length, sales: r2(sales), prevSales: r2(pSales), avgTicket: mine.length ? r2(sales / mine.length) : 0, discountPct: gross ? r1(disc / gross * 100) : 0, voidValue: r2(voidV), rating: rv.length ? { avg: r2(sum(rv, (x) => x.stars) / rv.length), n: rv.length, prev: prv2.length ? r2(sum(prv2, (x) => x.stars) / prv2.length) : 0 } : null, profile: prof, peak: windows(peak), quiet: windows(quiet), perDay: Object.keys(perDay).sort().map((d) => ({ day: d, actions: perDay[d] })), flags, events: ev };
  }).sort((a, b) => b.total - a.total);

  // ---------- suggestions ----------
  const out = [], add = (level, area, id, en, ar, ev) => out.push({ level, area, id, en, ar, ev: ev || null });
  const ready = H.length >= 15 && venue.activeDays >= 3;
  if (!ready) add('info', 'ops', 'few-data', { title: 'Not enough data yet', detail: `Only ${H.length} paid orders over ${venue.activeDays} day(s) so far. Suggestions about peaks, drops and staff become reliable after about a week of normal trading (15+ orders).` }, { title: 'لسه مفيش بيانات كفاية', detail: `لحد دلوقتي ${H.length} طلب مدفوع على مدار ${venue.activeDays} يوم. الاقتراحات عن الزحمة والهبوط والموظفين بتبقى دقيقة بعد حوالي أسبوع شغل عادي (15 طلب أو أكتر).` });
  if (ready && venue.peakWindows.length) { const w = venue.peakWindows, share = Math.round(sum(w, ([a, b]) => sum(hours.slice(a, b), (x) => x.orders)) / H.length * 100); add('info', 'ops', 'peak', { title: `Rush hours: ${winTxt(w)}`, detail: `${share}% of your orders arrive in this window. Have your strongest captains and a second pair of hands in the kitchen ready 30 minutes before, and prep the best sellers in advance.` }, { title: `ساعات الزحمة: ${winTxt(w)}`, detail: `${share}% من طلباتك بتيجي في الوقت ده. جهّز أقوى الكباتن ومساعد إضافي في المطبخ قبلها بنص ساعة، وحضّر الأصناف الأكثر مبيعاً مسبقاً.` }, { share }); }
  if (ready && venue.quietWindows.length) { const w = venue.quietWindows.filter(([a, b]) => b - a >= 2); if (w.length) add('info', 'sales', 'quiet', { title: `Slow hours: ${winTxt(w)}`, detail: 'Very few orders arrive in this window. Run a timed offer or coupon (Offers tab) for these hours, schedule staff breaks and cleaning here, and send fewer people on shift.' }, { title: `ساعات هادية: ${winTxt(w)}`, detail: 'طلبات قليلة جداً في الوقت ده. اعمل عرض بتوقيت أو كوبون (تبويب العروض) للساعات دي، وخلي استراحات الموظفين والتنظيف فيها، وقلل عدد الناس في الوردية.' }); }
  if (ready) { const tot = sum(dowAvg.filter((_, i) => dowN[i]) ), n = dowN.filter((x) => x).length, avg = n ? tot / n : 0; if (n >= 4 && avg) dowAvg.forEach((v, i) => { if (dowN[i] >= 2 && v < avg * 0.7) add('warn', 'sales', 'dow-' + i, { title: `${DOW_EN[i]}s are weak`, detail: `Average revenue on ${DOW_EN[i]}s is ${Math.round((1 - v / avg) * 100)}% below your usual day. A ${DOW_EN[i]}-only offer or event could lift it.` }, { title: `يوم ${DOW_AR[i]} ضعيف`, detail: `متوسط إيراد ${DOW_AR[i]} أقل بـ ${Math.round((1 - v / avg) * 100)}% من يومك المعتاد. عرض أو فعالية خاصة بيوم ${DOW_AR[i]} ممكن ترفعه.` }); }); }
  if (drops.length) add('warn', 'sales', 'drops', { title: `${drops.length} unusually slow day(s)`, detail: drops.slice(0, 4).map((d) => `${d.day} (${Math.round(d.revenue)})`).join(', ') + ` were below 60% of a normal day. Check what happened (weather, stock-outs, closed items, staffing) and note it.` }, { title: `${drops.length} يوم هادي بشكل غير معتاد`, detail: drops.slice(0, 4).map((d) => `${d.day} (${Math.round(d.revenue)})`).join('، ') + ' كانت أقل من 60% من اليوم العادي. افحص السبب (طقس، نفاد أصناف، تغيير في التشغيل).' });
  if (revDelta !== null && revDelta <= -15) add('alert', 'sales', 'rev-down', { title: `Revenue is down ${Math.abs(revDelta)}%`, detail: `Compared with the previous ${days} days. See the fading items, slow days and review scores below for the likely cause.` }, { title: `الإيراد قلّ ${Math.abs(revDelta)}%`, detail: `مقارنة بآخر ${days} يوم قبلها. شوف الأصناف اللي بتقل والأيام الضعيفة وتقييمات الضيوف تحت عشان تعرف السبب.` });
  if (revDelta !== null && revDelta >= 15) add('good', 'sales', 'rev-up', { title: `Revenue is up ${revDelta}%`, detail: `Compared with the previous ${days} days. Keep doing what worked and make sure stock and staffing can keep up.` }, { title: `الإيراد زاد ${revDelta}%`, detail: `مقارنة بآخر ${days} يوم قبلها. كمّل على اللي نجح وتأكد إن المخزون والعمالة تكفي.` });
  fading.forEach((f) => add('warn', 'menu', 'fade-' + f.name, { title: `“${f.name}” is selling much less`, detail: `${f.prev} sold before, ${f.now} now. Check it is not marked sold out, that the price/photo are right, and whether guests are being told about it.` }, { title: `“${f.name}” مبيعاته قلت جداً`, detail: `كان ${f.prev} وبقى ${f.now}. اتأكد إنه مش مقفول كـ "خلص"، وإن السعر والصورة تمام، وإن الضيوف عارفين بيه.` }));
  Object.keys(CAT_ACT).forEach((k) => { const c = cats[k], p = pcats[k]; if (c.n >= 3 && c.avg < 3.5) add(c.avg < 3 ? 'alert' : 'warn', 'reviews', 'cat-' + k, { title: `${CAT_ACT[k].label[0]}: ${c.avg}★ (${c.n} ratings)`, detail: CAT_ACT[k].en }, { title: `${CAT_ACT[k].label[1]}: ${c.avg}★ (${c.n} تقييم)`, detail: CAT_ACT[k].ar }, { avg: c.avg, n: c.n }); else if (c.n >= 3 && p.n >= 3 && p.avg - c.avg >= 0.5) add('warn', 'reviews', 'catdrop-' + k, { title: `${CAT_ACT[k].label[0]} dropped ${r1(p.avg - c.avg)}★`, detail: `From ${p.avg} to ${c.avg} compared with the previous ${days} days. Something changed recently: new staff, supplier, recipe or a busy shift pattern.` }, { title: `${CAT_ACT[k].label[1]} نزل ${r1(p.avg - c.avg)}★`, detail: `من ${p.avg} إلى ${c.avg} مقارنة بآخر ${days} يوم قبلها. فيه حاجة اتغيرت مؤخراً: موظف جديد، مورد، وصفة، أو نظام الورديات.` }); });
  themes.filter((t) => t.count >= 2).slice(0, 3).forEach((t) => add('alert', 'reviews', 'theme-' + t.key, { title: `Guests keep mentioning: ${t.en} (${t.count}×)`, detail: t.sample ? `Example: “${t.sample}”. Read the low-rated comments and contact those guests if they left a table number.` : 'Read the low-rated comments for details.' }, { title: `الضيوف بيتكلموا عن: ${t.ar} (${t.count} مرة)`, detail: t.sample ? `مثال: “${t.sample}”. اقرأ التعليقات منخفضة التقييم وتواصل مع الضيوف.` : 'اقرأ التعليقات منخفضة التقييم للتفاصيل.' }));
  if (reviews.unhandled) add('warn', 'reviews', 'unhandled', { title: `${reviews.unhandled} low rating(s) not handled yet`, detail: 'Open Reports → Guest feedback and mark each one handled after you followed up with the table.' }, { title: `${reviews.unhandled} تقييم منخفض لسه ماتعاملش معاه`, detail: 'افتح التقارير ← تقييمات الضيوف وعلّم كل واحد بعد ما تتابع مع الترابيزة.' });
  staff.filter((s) => s.flags.length).forEach((s) => add(s.flags.some((f) => f.level === 'alert') ? 'alert' : 'warn', 'staff', 'staff-' + s.id, { title: `${s.name}: ${s.flags.length} thing(s) to review`, detail: s.flags.map((f) => f.en).join('; ') + '. Talk to them privately and look at their activity log below.' }, { title: `${s.name}: ${s.flags.length} نقطة للمراجعة`, detail: s.flags.map((f) => f.ar).join('؛ ') + '. اتكلم معاه بشكل خاص وراجع سجل نشاطه تحت.' }, { id: s.id }));
  const best = staff.filter((s) => s.rating && s.rating.n >= 3 && s.rating.avg >= 4.5)[0]; if (best) add('good', 'staff', 'star', { title: `${best.name} is your top-rated captain`, detail: `${best.rating.avg}★ from ${best.rating.n} guest ratings. Consider a recognition or letting them train newer staff.` }, { title: `${best.name} أعلى كابتن تقييماً`, detail: `${best.rating.avg}★ من ${best.rating.n} تقييم. فكّر في مكافأة أو إنه يدرّب الموظفين الجدد.` });
  if (ready && onl.length === 0 && o.onlineEnabled) add('info', 'sales', 'online-none', { title: 'No online orders yet', detail: 'Online ordering is on but nobody used it. Put the order link / QR at the entrance, on your Instagram and Google profile.' }, { title: 'مفيش طلبات أونلاين لسه', detail: 'الطلب أونلاين شغال بس محدش استخدمه. حط اللينك / QR عند المدخل وعلى انستجرام وجوجل.' });
  const rank = { alert: 0, warn: 1, info: 2, good: 3 }; out.sort((a, b) => rank[a.level] - rank[b.level]);
  return { range: { from, to: now, days }, ready, venue, reviews, staff, suggestions: out };
}

const api = { analyze, THEMES, windows };
if (typeof module !== 'undefined') module.exports = api;
