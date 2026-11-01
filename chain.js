// Multi-branch analytics: compares the branches of one group on the same numbers, ranks them and says what to do.
// Pure functions (no I/O). Every sentence quotes numbers from the data, nothing is invented.
const r1 = (n) => Math.round((+n || 0) * 10) / 10, r2 = (n) => Math.round((+n || 0) * 100) / 100, sum = (a, f = (x) => x) => a.reduce((n, x) => n + f(x), 0);
const pct = (a, b) => (b > 0 ? r1(a / b * 100) : 0), delta = (a, b) => (b > 0 ? r1((a - b) / b * 100) : null);
const hr = (h) => String(h).padStart(2, '0') + ':00';

// metrics that can be ranked: key, label, whether a higher number is better
const METRICS = [
  { k: 'revenue', label: 'Revenue', up: true }, { k: 'growth', label: 'Growth vs previous period', up: true }, { k: 'avgTicket', label: 'Average bill', up: true },
  { k: 'spendPerGuest', label: 'Spend per guest', up: true }, { k: 'foodCostPct', label: 'Food cost %', up: false }, { k: 'discountPct', label: 'Discounts % of sales', up: false },
  { k: 'voidPct', label: 'Voids and waste % of sales', up: false }, { k: 'rating', label: 'Guest rating', up: true }, { k: 'labourPct', label: 'Labour cost %', up: false },
  { k: 'dwellMin', label: 'Minutes a table stays', up: false },
];

// o: { days, now, branches: [{ slug, name, hist, ins, att, currency }] }
function build(o) {
  const days = o.days || 30, now = o.now || Date.now(), from = now - days * 86400000, pfrom = from - days * 86400000, DAYMS = 86400000;
  const rows = (o.branches || []).map((b) => {
    const all = (b.hist || []).filter((h) => !h.unpaid), H = all.filter((h) => h.closedAt >= from && h.closedAt <= now), P = all.filter((h) => h.closedAt >= pfrom && h.closedAt < from);
    const revenue = sum(H, (h) => h.total), prev = sum(P, (h) => h.total), gross = sum(H, (h) => h.sub), disc = sum(H, (h) => h.discount || 0);
    const lines = H.flatMap((h) => h.items || []), costed = lines.filter((l) => l.cost > 0), cogs = sum(costed, (l) => l.qty * l.cost), costedRev = sum(costed, (l) => l.qty * l.price);
    const voidV = sum(H, (h) => sum(h.voids || [], (v) => v.qty * v.price)), guests = sum(H, (h) => h.guests || 1);
    const hours = Array.from({ length: 24 }, () => 0), dayRev = {}; H.forEach((h) => { const d = new Date(h.closedAt); hours[d.getHours()] += h.total; });
    const series = []; for (let i = days - 1; i >= 0; i--) { const a = now - (i + 1) * DAYMS, z = now - i * DAYMS; series.push(r2(sum(H.filter((h) => h.closedAt > a && h.closedAt <= z), (h) => h.total))); }
    const items = {}; lines.forEach((l) => { const a = (items[l.name] ||= { name: l.name, qty: 0, revenue: 0 }); a.qty += l.qty; a.revenue += l.qty * l.price; });
    const att = b.att && b.att.hours > 0 ? b.att : null, labour = att ? att.laborCost || 0 : null, rv = (b.ins && b.ins.reviews) || {};
    const online = H.filter((h) => h.kind === 'takeaway' || h.kind === 'delivery' || h.kind === 'car'), digital = sum(H, (h) => (h.pay && h.pay.digital) || 0) + sum(H, (h) => (h.pay && h.pay.card) || 0);
    const peak = hours.indexOf(Math.max(...hours));
    return {
      slug: b.slug, name: b.name, currency: b.currency || '', orders: H.length, guests, revenue: r2(revenue), prevRevenue: r2(prev), growth: delta(revenue, prev),
      avgTicket: H.length ? r2(revenue / H.length) : 0, spendPerGuest: guests ? r2(revenue / guests) : 0, itemsPerOrder: H.length ? r1(sum(lines, (l) => l.qty) / H.length) : 0,
      dwellMin: H.length ? Math.round(sum(H, (h) => (h.closedAt - h.startedAt) / 60000) / H.length) : 0,
      foodCostPct: costedRev > 0 ? pct(cogs, costedRev) : null, costKnown: lines.length ? pct(costed.length, lines.length) : 0, cogs: r2(cogs),
      discountPct: pct(disc, gross), voidPct: pct(voidV, gross + voidV), onlineShare: pct(sum(online, (h) => h.total), revenue), cardShare: pct(digital, revenue),
      rating: rv.count ? rv.avg : null, reviews: rv.count || 0, unhandled: rv.unhandled || 0,
      labourCost: labour === null ? null : r2(labour), labourPct: labour === null || revenue <= 0 ? null : pct(labour, revenue), revPerLabourHour: att && att.hours ? r2(revenue / att.hours) : null,
      peakHour: revenue > 0 ? peak : null, hours: hours.map(r2), series, items, live: b.live || { tables: 0, guests: 0 },
      topItems: Object.values(items).sort((a, b2) => b2.revenue - a.revenue).slice(0, 3).map((x) => x.name),
    };
  });
  const T = {
    revenue: r2(sum(rows, (b) => b.revenue)), prevRevenue: r2(sum(rows, (b) => b.prevRevenue)), orders: sum(rows, (b) => b.orders), guests: sum(rows, (b) => b.guests),
    cogs: r2(sum(rows, (b) => b.cogs)), labourCost: r2(sum(rows, (b) => b.labourCost || 0)),
  };
  T.growth = delta(T.revenue, T.prevRevenue); T.avgTicket = T.orders ? r2(T.revenue / T.orders) : 0; T.spendPerGuest = T.guests ? r2(T.revenue / T.guests) : 0;
  const withLab = rows.filter((b) => b.labourCost !== null); T.labourPct = withLab.length && sum(withLab, (b) => b.revenue) > 0 ? pct(sum(withLab, (b) => b.labourCost), sum(withLab, (b) => b.revenue)) : null;
  const rated = rows.filter((b) => b.rating !== null && b.reviews > 0); T.rating = rated.length ? r2(sum(rated, (b) => b.rating * b.reviews) / sum(rated, (b) => b.reviews)) : null;
  const wc = rows.filter((b) => b.foodCostPct !== null); T.foodCostPct = wc.length ? pct(sum(wc, (b) => b.cogs), sum(wc, (b) => b.revenue)) : null;
  T.series = Array.from({ length: days }, (_, i) => r2(sum(rows, (b) => b.series[i] || 0)));
  rows.forEach((b) => { b.share = pct(b.revenue, T.revenue); });

  // ranking: 1 is best; branches without a number for a metric are left out
  const rank = {}, avg = {};
  for (const m of METRICS) {
    const have = rows.filter((b) => b[m.k] !== null && b[m.k] !== undefined && (m.k === 'revenue' || m.k === 'growth' || b.orders > 0)); if (!have.length) continue;
    const sorted = have.slice().sort((a, b) => (m.up ? b[m.k] - a[m.k] : a[m.k] - b[m.k]));
    sorted.forEach((b, i) => { (b.rank ||= {})[m.k] = i + 1; });
    avg[m.k] = r2(sum(have, (b) => b[m.k]) / have.length);
    rank[m.k] = { label: m.label, up: m.up, best: sorted[0].slug, worst: sorted[sorted.length - 1].slug, bestVal: sorted[0][m.k], worstVal: sorted[sorted.length - 1][m.k], n: have.length };
  }
  rows.forEach((b) => { b.vsAvg = {}; for (const k of Object.keys(avg)) if (b[k] !== null && avg[k]) b.vsAvg[k] = r1((b[k] - avg[k]) / Math.abs(avg[k]) * 100); });

  // dishes across branches: the chain's best sellers and who under-sells them
  const chainItems = {}; rows.forEach((b) => Object.values(b.items).forEach((x) => { const a = (chainItems[x.name] ||= { name: x.name, qty: 0, revenue: 0, by: {} }); a.qty += x.qty; a.revenue += x.revenue; a.by[b.slug] = x.qty; }));
  const dishes = Object.values(chainItems).sort((a, b) => b.revenue - a.revenue).slice(0, 12).map((d) => ({ name: d.name, qty: d.qty, revenue: r2(d.revenue), by: d.by,
    gap: rows.length > 1 ? rows.map((b) => { const exp = d.qty * (b.orders / Math.max(1, T.orders)), got = d.by[b.slug] || 0; return { slug: b.slug, got, exp: r1(exp), low: exp >= 8 && got < exp * 0.5 }; }).filter((g) => g.low) : [] }));

  // ---- findings
  const out = []; const add = (type, title, detail, action, impact, slug) => out.push({ type, title, detail, action, impact: impact || 'medium', branch: slug || '' });
  const nm = (s) => (rows.find((b) => b.slug === s) || {}).name, cur = (rows[0] || {}).currency || '';
  const active = rows.filter((b) => b.orders >= 10);
  if (rows.length < 2) add('risk', 'Only one branch in this group', 'Comparisons need at least two branches.', 'Ask the platform owner to put your other branches in the same group.', 'low');
  else if (active.length < 2) add('risk', 'Not enough sales to compare yet', `Only ${active.length} branch${active.length === 1 ? ' has' : 'es have'} 10 or more paid orders in ${days} days.`, 'Make sure every branch closes every table through the system.', 'medium');
  if (active.length >= 2) {
    const r = rank.revenue, top = rows.find((b) => b.slug === r.best);
    if (top.share >= 60 && rows.length > 2) add('risk', `${top.name} carries ${top.share}% of the chain`, `Most of the revenue depends on one branch.`, 'Review what the weaker branches lack: opening hours, location visibility, menu mix.', 'medium', top.slug);
    const at = rank.avgTicket; if (at && at.bestVal > 0 && at.worstVal < at.bestVal * 0.85) add('opportunity', `${nm(at.worst)} bills ${r1((1 - at.worstVal / at.bestVal) * 100)}% less per table than ${nm(at.best)}`, `${at.worstVal} vs ${at.bestVal} ${cur} per paid table.`, `Copy ${nm(at.best)}'s upselling: same suggested add-ons, drinks first, and the same waiter script. A bill at ${nm(at.best)}'s level at ${nm(at.worst)} would add about ${Math.round((at.bestVal - at.worstVal) * rows.find((b) => b.slug === at.worst).orders)} ${cur} a period.`, 'high', at.worst);
    const fc = rank.foodCostPct; if (fc && fc.n >= 2 && fc.worstVal - fc.bestVal >= 4) { const w = rows.find((b) => b.slug === fc.worst); add('risk', `${w.name} spends ${fc.worstVal}% of sales on ingredients`, `${nm(fc.best)} spends ${fc.bestVal}%. The gap is ${r1(fc.worstVal - fc.bestVal)} points on ${Math.round(w.revenue)} ${cur} of sales.`, `Check portion sizes, waste and supplier prices at ${w.name}. Closing the gap is worth about ${Math.round(w.revenue * (fc.worstVal - fc.bestVal) / 100)} ${cur} a period.`, 'high', w.slug); }
    const dc = rank.discountPct; if (dc && dc.worstVal >= 5 && dc.worstVal > dc.bestVal * 2) add('risk', `${nm(dc.worst)} gives away ${dc.worstVal}% of sales in discounts`, `${nm(dc.best)} gives ${dc.bestVal}%.`, 'Check who approves discounts and whether reasons are recorded.', 'medium', dc.worst);
    const vd = rank.voidPct; if (vd && vd.worstVal >= 2 && vd.worstVal > vd.bestVal * 2) add('risk', `${nm(vd.worst)} voids ${vd.worstVal}% of what it sells`, `${nm(vd.best)} voids ${vd.bestVal}%. High voids point to wrong orders, waste or misuse.`, 'Look at the void log by waiter and by hour at that branch.', 'high', vd.worst);
    const rt = rank.rating; if (rt && rt.n >= 2 && rt.bestVal - rt.worstVal >= 0.5) add('risk', `${nm(rt.worst)} is rated ${rt.worstVal}, ${r1(rt.bestVal - rt.worstVal)} below ${nm(rt.best)}`, `Based on guest reviews in the last ${days} days.`, `Read the low reviews at ${nm(rt.worst)} and pick the one repeated complaint to fix first.`, 'high', rt.worst);
    const lb = rank.labourPct; if (lb && lb.n >= 2 && lb.worstVal - lb.bestVal >= 5) add('risk', `${nm(lb.worst)} pays ${lb.worstVal}% of sales in wages`, `${nm(lb.best)} pays ${lb.bestVal}%.`, 'Compare schedules against the busy hours and trim shifts in the quiet ones.', 'high', lb.worst);
    const gr = rank.growth; if (gr && gr.worstVal !== null && gr.worstVal <= -10) add('risk', `${nm(gr.worst)} sales are down ${Math.abs(gr.worstVal)}%`, `Compared with the previous ${days} days.`, `Open that branch's insights page to see which days and hours fell.`, 'high', gr.worst);
    if (gr && gr.bestVal !== null && gr.bestVal >= 10) add('win', `${nm(gr.best)} is growing ${gr.bestVal}%`, `Compared with the previous ${days} days.`, 'Find out what changed there (new items, offers, staff) and repeat it elsewhere.', 'medium', gr.best);
    const dw = rank.dwellMin; if (dw && dw.worstVal > dw.bestVal * 1.4 && dw.worstVal - dw.bestVal >= 10) add('opportunity', `Tables stay ${dw.worstVal} minutes at ${nm(dw.worst)} against ${dw.bestVal} at ${nm(dw.best)}`, 'Slow turns cost covers in busy hours.', 'Check kitchen speed and how fast the bill is brought after guests ask.', 'medium', dw.worst);
    const pk = new Set(active.map((b) => b.peakHour)); if (pk.size === active.length && active.length > 1) add('info', 'Branches peak at different hours', active.map((b) => `${b.name} ${hr(b.peakHour)}`).join(', ') + '.', 'Stagger deliveries, promotions and staff cover per branch rather than chain-wide.', 'low');
  }
  dishes.filter((d) => d.gap.length).slice(0, 3).forEach((d) => add('opportunity', `${d.name} sells well in the chain but not at ${d.gap.map((g) => nm(g.slug)).join(', ')}`, d.gap.map((g) => `${nm(g.slug)}: ${g.got} sold, about ${Math.round(g.exp)} expected for its traffic`).join('; ') + '.', 'Check it is on the menu, in stock and recommended by the waiters there.', 'medium', d.gap[0].slug));
  rows.filter((b) => b.costKnown < 60 && b.orders >= 10).forEach((b) => add('info', `${b.name}: only ${b.costKnown}% of items sold have a cost`, 'Food cost figures for this branch are incomplete.', 'Add recipes or costs to the remaining items.', 'low', b.slug));
  const order = { high: 0, medium: 1, low: 2 }; out.sort((a, b) => order[a.impact] - order[b.impact]);
  rows.forEach((b) => { delete b.items; });
  return { days, now, currency: cur, totals: T, branches: rows, rank, avg, dishes, findings: out, metrics: METRICS };
}
module.exports = { build, METRICS };
