// Owner report pack: turns a café's own numbers into KPIs, a scorecard, findings (risks, opportunities, wins) and decisions.
// Pure functions (no I/O). Every sentence is rule based and quotes numbers from the data, nothing is invented.
const r1 = (n) => Math.round((+n || 0) * 10) / 10, r2 = (n) => Math.round((+n || 0) * 100) / 100, sum = (a, f = (x) => x) => a.reduce((n, x) => n + f(x), 0);
const pct = (a, b) => (b > 0 ? r1(a / b * 100) : 0);
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hr = (h) => String(h).padStart(2, '0') + ':00';
const win = (w) => w.map(([a, b]) => hr(a) + '-' + hr(b)).join(', ');

// opts: { days, now, hist, ins (insights.analyze result), att (attendance summary or null), stock: { ingredients, items }, loyalty, settings, reservations, name, currency, advisor }
function build(o) {
  const days = o.days || 30, now = o.now || Date.now(), from = now - days * 86400000, pfrom = from - days * 86400000, money = o.currency || 'EGP';
  const H = (o.hist || []).filter((h) => h.closedAt >= from && h.closedAt <= now && !h.unpaid), P = (o.hist || []).filter((h) => h.closedAt >= pfrom && h.closedAt < from && !h.unpaid);
  const ins = o.ins || {}, V = ins.venue || {}, RV = ins.reviews || {}, staff = ins.staff || [];
  const revenue = sum(H, (h) => h.total), prevRev = sum(P, (h) => h.total), gross = sum(H, (h) => h.sub), disc = sum(H, (h) => h.discount || 0);
  const lines = H.flatMap((h) => h.items || []), cogs = sum(lines, (l) => l.qty * (l.cost || 0)), net = gross - disc;
  const voidV = sum(H, (h) => sum(h.voids || [], (v) => v.qty * v.price)), wasteV = sum(H, (h) => sum((h.voids || []).filter((v) => v.waste), (v) => v.qty * v.price));
  const costed = lines.filter((l) => l.cost > 0).length, costShare = lines.length ? costed / lines.length : 0;
  const tips = sum(H, (h) => h.tip || 0), service = sum(H, (h) => h.service || 0), tax = sum(H, (h) => h.tax || 0);
  const digital = sum(H, (h) => (h.pay && h.pay.digital) || 0), card = sum(H, (h) => (h.pay && h.pay.card) || 0), cash = sum(H, (h) => (h.pay && h.pay.cash) || 0);
  const online = H.filter((h) => h.kind === 'takeaway' || h.kind === 'delivery' || h.kind === 'car');
  const mins = H.length ? sum(H, (h) => (h.closedAt - h.startedAt) / 60000) / H.length : 0;

  // ---- menu engineering: popularity vs margin per dish
  const items = {}; lines.forEach((l) => { const a = (items[l.name] ||= { name: l.name, qty: 0, revenue: 0, profit: 0, price: l.price, cost: l.cost || 0 }); a.qty += l.qty; a.revenue += l.qty * l.price; a.profit += l.qty * (l.price - (l.cost || 0)); });
  const list = Object.values(items), med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const mq = med(list.map((x) => x.qty)), mm = med(list.filter((x) => x.cost > 0).map((x) => (x.price - x.cost) / x.price));
  const cls = (x) => { if (!(x.cost > 0)) return 'unknown'; const m = (x.price - x.cost) / x.price, pop = x.qty >= mq, good = m >= mm; return pop && good ? 'star' : pop ? 'plowhorse' : good ? 'puzzle' : 'dog'; };
  list.forEach((x) => { x.class = cls(x); x.marginPct = x.price > 0 && x.cost > 0 ? r1((x.price - x.cost) / x.price * 100) : null; });
  const by = (c) => list.filter((x) => x.class === c).sort((a, b) => b.revenue - a.revenue);
  const top3 = list.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 3), top3Share = pct(sum(top3, (x) => x.revenue), sum(list, (x) => x.revenue));

  // ---- labour (needs attendance data)
  const att = o.att && o.att.hours > 0 ? o.att : null;

  // ---- findings
  const F = []; const add = (type, area, title, detail, action, impact) => F.push({ type, area, title, detail, action, impact: impact || 'medium' });
  const enough = H.length >= 15;
  if (!enough) add('risk', 'data', 'Not enough sales data yet for firm conclusions', `Only ${H.length} paid orders in the last ${days} days.`, 'Keep every table going through the system (including takeaway and cash) so the report reflects the whole business. Review again after 2 weeks of full use.', 'high');
  if (enough) {
    const d = prevRev > 0 ? r1((revenue - prevRev) / prevRev * 100) : null;
    if (d !== null && d <= -10) add('risk', 'sales', `Sales fell ${Math.abs(d)}% against the previous ${days} days`, `${r2(revenue)} ${money} now against ${r2(prevRev)} ${money} before.`, 'Check the weakest weekday and the quiet hours below, look at guest comments for a cause (service, price, product) and run one targeted offer in the quiet window.', 'high');
    else if (d !== null && d >= 10) add('win', 'sales', `Sales grew ${d}% against the previous ${days} days`, `${r2(revenue)} ${money} now against ${r2(prevRev)} ${money} before.`, 'Find out what changed (new dish, offer, season) and repeat it.', 'medium');
    if (V.peakWindows && V.peakWindows.length) add('opportunity', 'staffing', `Busiest hours: ${win(V.peakWindows)}`, 'These hours carry most of the orders.', 'Roster your strongest and fastest people in these hours, and have the kitchen prepped before they start.', 'medium');
    if (V.quietWindows && V.quietWindows.length) add('opportunity', 'sales', `Quiet hours: ${win(V.quietWindows)}`, 'Capacity is idle in these windows.', 'Try a timed offer or happy-hour price (Offers page) in this window and measure the change after two weeks.', 'medium');
    const dow = V.dowAvg || [], dn = V.dowN || [], ok = dow.map((v, i) => (dn[i] >= 2 && v > 0 ? i : -1)).filter((i) => i >= 0);
    if (ok.length >= 4) { const lo = ok.reduce((a, b) => (dow[b] < dow[a] ? b : a)), hi = ok.reduce((a, b) => (dow[b] > dow[a] ? b : a)); if (dow[hi] > dow[lo] * 1.8) add('opportunity', 'sales', `${DOW[lo]} is your weakest day`, `Average ${r2(dow[lo])} ${money} against ${r2(dow[hi])} ${money} on ${DOW[hi]}.`, `Plan one recurring ${DOW[lo]} offer or event, and cut staffing hours that day if the trend holds.`, 'medium'); }
    if (net > 0 && disc / (gross || 1) > 0.08) add('risk', 'control', `Discounts are ${pct(disc, gross)}% of sales`, `${r2(disc)} ${money} given away in ${days} days.`, 'Review who applies discounts and why. Limit the discount permission to managers and require a reason.', 'high');
    if (revenue > 0 && voidV / revenue > 0.02) add('risk', 'control', `Voids and cancellations are ${pct(voidV, revenue)}% of sales`, `${r2(voidV)} ${money} voided${wasteV ? `, of which ${r2(wasteV)} ${money} marked as waste` : ''}.`, 'Check the voids by person on the Insights page. Frequent voids by one person after the food is sent need a conversation.', 'high');
    if (costShare < 0.6) add('risk', 'margin', `Only ${Math.round(costShare * 100)}% of sold items have a cost`, 'Profit and food cost cannot be trusted until costs are entered.', 'Enter item costs (or build recipes with ingredient prices) for your top 20 sellers first.', 'high');
    else {
      const fc = pct(cogs, net); if (fc > 35) add('risk', 'margin', `Food cost is ${fc}% of sales (healthy cafés aim for 25-32%)`, `${r2(cogs)} ${money} of ingredients against ${r2(net)} ${money} net sales.`, 'Raise prices on the high-volume low-margin dishes below, reduce portions or renegotiate suppliers for the biggest ingredients.', 'high');
      else if (fc > 0) add('win', 'margin', `Food cost is ${fc}%, within a healthy range`, `${r2(cogs)} ${money} of ingredients against ${r2(net)} ${money} net sales.`, 'Protect it: re-check ingredient prices every month.', 'low');
      by('plowhorse').slice(0, 3).forEach((x) => add('opportunity', 'menu', `Raise the price of ${x.name}`, `Sold ${x.qty} times with a ${x.marginPct}% margin, below your menu median (${r1(mm * 100)}%).`, `A small increase (5-10%) on a best seller adds profit with little risk. Also check its recipe for savings.`, 'medium'));
      by('puzzle').slice(0, 3).forEach((x) => add('opportunity', 'menu', `Promote ${x.name}`, `Margin ${x.marginPct}% is good but only ${x.qty} sold.`, 'Feature it as dish of the day, put it first in its category, or have staff suggest it.', 'medium'));
      const dogs = by('dog').filter((x) => x.qty <= Math.max(2, mq / 3)); if (dogs.length >= 2) add('opportunity', 'menu', `${dogs.length} dishes sell little and earn little`, dogs.slice(0, 5).map((x) => `${x.name} (${x.qty} sold, ${x.marginPct}% margin)`).join('; ') + '.', 'Consider removing or reworking them. A shorter menu is faster to prepare and cheaper to stock.', 'low');
    }
    if (top3Share > 55) add('risk', 'menu', `Three dishes make ${top3Share}% of sales`, top3.map((x) => x.name).join(', ') + '.', 'If one of them goes out of stock or a competitor copies it, sales drop sharply. Build up a second tier of popular dishes.', 'medium');
    if (RV.count >= 5) {
      if (RV.avg >= 4.5) add('win', 'quality', `Guests rate you ${RV.avg} out of 5`, `${RV.count} ratings.`, 'Ask happy guests for a Google review (the feedback page does this automatically).', 'medium');
      else if (RV.avg < 4) add('risk', 'quality', `Guest rating is ${RV.avg} out of 5`, `${RV.count} ratings, ${RV.lowCount || 0} low ones.`, 'Read the low comments and fix the top theme first.', 'high');
      if (RV.prevAvg && RV.avg <= RV.prevAvg - 0.3) add('risk', 'quality', `Rating dropped from ${RV.prevAvg} to ${RV.avg}`, 'Compared with the previous period.', 'Find what changed: a new person, a menu change, long waits.', 'high');
      const cats = Object.entries(RV.cats || {}).filter(([, v]) => v.n >= 3).sort((a, b) => a[1].avg - b[1].avg); if (cats.length && cats[0][1].avg < 4) add('risk', 'quality', `Weakest area: ${cats[0][0]} (${cats[0][1].avg} out of 5)`, `From ${cats[0][1].n} guest ratings.`, 'Make this the one thing the team improves this month, and check the score again in two weeks.', 'medium');
      (RV.themes || []).slice(0, 2).forEach((t) => add('risk', 'quality', `Complaints about ${t.en.toLowerCase()} (${t.count})`, t.sample ? `Example: "${t.sample}"` : '', 'Raise it in the next staff meeting with the examples.', 'medium'));
    } else if (RV.count < 5) add('opportunity', 'quality', 'Few guest ratings so far', `${RV.count || 0} ratings in ${days} days.`, 'Ask servers to remind guests to rate after paying. Ratings are your early warning system.', 'low');
    if (mins > 0) { if (mins > 90) add('opportunity', 'operations', `Guests stay ${Math.round(mins)} minutes on average`, 'Long stays reduce how many tables you can serve in the busy hours.', 'Check the speed of the kitchen and of the bill. Consider a time suggestion on peak days.', 'low'); }
    const slow = staff.filter((s) => s.avgResponseSec > 120 && s.total >= 15).sort((a, b) => b.avgResponseSec - a.avgResponseSec)[0]; if (slow) add('risk', 'team', `${slow.name} answers guest requests in ${Math.round(slow.avgResponseSec / 60 * 10) / 10} minutes on average`, `Over ${slow.total} actions.`, 'Check their section and the hours they work. Pair them with someone quicker.', 'medium');
    const best = staff.filter((s) => s.tables >= 10).sort((a, b) => b.avgTicket - a.avgTicket)[0]; if (best) add('win', 'team', `${best.name} has the highest average ticket (${best.avgTicket} ${money})`, `${best.tables} tables.`, 'Ask them to share how they suggest dishes, and consider a small incentive.', 'low');
    staff.filter((s) => s.flags && s.flags.some((f) => f.level === 'alert')).slice(0, 3).forEach((s) => add('risk', 'control', `${s.name}: activity needs review`, s.flags.map((f) => f.en).join('; '), 'Look at their activity log on the Insights page and speak to them privately.', 'high'));
    if (att) {
      if (att.laborPct > 35) add('risk', 'labour', `Labour is ${att.laborPct}% of sales`, `${r2(att.laborCost)} ${money} of wages for ${att.hours} hours.`, 'Move hours out of the quiet windows above. Typical cafés aim for 25-33%.', 'high');
      else if (att.laborPct > 0) add('win', 'labour', `Labour is ${att.laborPct}% of sales`, `${r2(att.laborCost)} ${money} for ${att.hours} hours.`, 'Keep rosters matched to the busy hours.', 'low');
      const late = (att.staff || []).filter((s) => s.late >= 3); if (late.length) add('risk', 'team', `${late.length} people were late 3 or more times`, late.map((s) => `${s.name} (${s.late})`).join(', '), 'Talk to them and check whether the scheduled start time is realistic.', 'medium');
    } else add('opportunity', 'labour', 'Labour cost is not measured yet', 'No attendance or wages recorded.', 'Enter hourly wages and schedules on the Attendance page to see labour as a percentage of sales.', 'medium');
    const dgShare = pct(digital, revenue); if (digital > 0) add('win', 'payments', `${dgShare}% of sales are paid by InstaPay / wallet`, `${r2(digital)} ${money}.`, 'Digital payments are faster to close and avoid cash handling. Keep the QR visible on the bill.', 'low');
    if (revenue > 0 && cash / revenue > 0.7) add('opportunity', 'payments', `${pct(cash, revenue)}% of sales are cash`, 'High cash share means more handling risk and slower closing.', 'Offer InstaPay or wallet at the table and show it clearly.', 'low');
    if (online.length) add('opportunity', 'channels', `${online.length} takeaway / delivery orders (${pct(sum(online, (h) => h.total), revenue)}% of sales)`, 'Your own channel avoids marketplace commissions.', 'Share the order link on Instagram, WhatsApp and Google so more guests order directly.', 'medium');
    else if ((o.settings || {}).online && (o.settings.online || {}).enabled) add('opportunity', 'channels', 'No takeaway / delivery orders yet', 'Online ordering is on but unused.', 'Put the order link on your social pages and the bill.', 'medium');
  }
  // stock risks (independent of sales volume)
  const ing = ((o.stock || {}).ingredients || []).filter((g) => g.low > 0 && g.stock <= g.low), out = ing.filter((g) => g.stock <= 0);
  if (out.length) add('risk', 'stock', `${out.length} ingredient(s) are out of stock`, out.slice(0, 6).map((g) => g.name).join(', '), 'Reorder today. Dishes using them can no longer be prepared correctly.', 'high');
  else if (ing.length) add('risk', 'stock', `${ing.length} ingredient(s) are running low`, ing.slice(0, 6).map((g) => `${g.name} (${g.stock} ${g.unit})`).join(', '), 'Reorder before the next busy day.', 'medium');
  const lowItems = ((o.stock || {}).items || []).filter((i) => i.stock !== undefined && i.stock !== null && i.stock !== '' && i.stock <= (i.lowAt === undefined ? 5 : i.lowAt)); if (lowItems.length) add('risk', 'stock', `${lowItems.length} menu item(s) are low or out`, lowItems.slice(0, 6).map((i) => i.name).join(', '), 'Restock them, or mark them sold out so guests are not disappointed.', 'medium');
  const L = o.loyalty || {}; if (L.members >= 10) add('win', 'loyalty', `${L.members} loyalty members`, L.repeatPct ? `${L.repeatPct}% have visited more than once.` : '', 'Send them an offer for the quiet hours.', 'low');

  // ---- scorecard 0-100 (only areas with data)
  const sc = []; const S = (k, v, why) => { if (v !== null) sc.push({ area: k, score: Math.max(0, Math.min(100, Math.round(v))), why }); };
  S('Sales trend', enough && prevRev > 0 ? 60 + (revenue - prevRev) / prevRev * 200 : null, prevRev > 0 ? `${r1((revenue - prevRev) / prevRev * 100)}% vs previous period` : '');
  S('Margin', enough && costShare >= 0.6 && net > 0 ? 100 - Math.max(0, pct(cogs, net) - 25) * 5 : null, enough && net > 0 ? `food cost ${pct(cogs, net)}%` : '');
  S('Guest quality', RV.count >= 5 ? (RV.avg - 3) * 50 : null, RV.count >= 5 ? `${RV.avg} out of 5 from ${RV.count} ratings` : '');
  S('Control', enough ? 100 - pct(disc, gross) * 4 - pct(voidV, revenue) * 8 : null, enough ? `discounts ${pct(disc, gross)}%, voids ${pct(voidV, revenue)}%` : '');
  S('Labour', att && att.laborPct > 0 ? 100 - Math.max(0, att.laborPct - 25) * 5 : null, att ? `${att.laborPct}% of sales` : '');
  S('Stock', 100 - out.length * 25 - Math.max(0, ing.length - out.length) * 10 - lowItems.length * 5, `${out.length} out, ${ing.length - out.length} low`);
  const overall = sc.length ? Math.round(sum(sc, (x) => x.score) / sc.length) : null;

  // ---- decisions: the five most valuable actions in plain words
  const rank = { high: 0, medium: 1, low: 2 }, order = { risk: 0, opportunity: 1, win: 2 };
  const decisions = F.filter((f) => f.type !== 'win').sort((a, b) => rank[a.impact] - rank[b.impact] || order[a.type] - order[b.type]).slice(0, 5).map((f, i) => ({ n: i + 1, title: f.title, action: f.action, impact: f.impact, area: f.area }));

  return {
    name: o.name || '', currency: money, from, to: now, days, orders: H.length, ready: enough, advisor: o.advisor || '',
    kpis: { revenue: r2(revenue), prevRevenue: r2(prevRev), revDelta: prevRev > 0 ? r1((revenue - prevRev) / prevRev * 100) : null, orders: H.length, avgTicket: H.length ? r2(revenue / H.length) : 0, guests: sum(H, (h) => h.guests || 0), discounts: r2(disc), voids: r2(voidV), foodCostPct: costShare >= 0.6 ? pct(cogs, net) : null, grossProfit: r2(net - cogs), tips: r2(tips), service: r2(service), tax: r2(tax), avgMinutes: Math.round(mins), rating: RV.count ? RV.avg : null, ratingCount: RV.count || 0, laborPct: att ? att.laborPct : null, laborCost: att ? att.laborCost : null, cash: r2(cash), card: r2(card), digital: r2(digital) },
    scorecard: sc, overall, findings: F.sort((a, b) => order[a.type] - order[b.type] || rank[a.impact] - rank[b.impact]), decisions,
    menu: { stars: by('star').slice(0, 8), plowhorses: by('plowhorse').slice(0, 8), puzzles: by('puzzle').slice(0, 8), dogs: by('dog').slice(0, 8), top: list.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 10) },
    staff: staff.map((s) => ({ name: s.name, role: s.role, tables: s.tables, sales: s.sales, avgTicket: s.avgTicket, avgResponseSec: s.avgResponseSec, discountPct: s.discountPct, voidValue: s.voidValue, rating: s.rating })),
    attendance: att ? { hours: att.hours, cost: att.laborCost, pct: att.laborPct, people: att.staff.filter((s) => s.hours > 0).map((s) => ({ name: s.name, hours: s.hours, days: s.days, late: s.late })) } : null,
  };
}
module.exports = { build };
