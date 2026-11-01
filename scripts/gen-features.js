// Builds docs/features/ from the live catalogue so the lists never drift from the code.
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..') + '/', F = require(ROOT + 'features.js');
const OUT = ROOT + 'docs/features/'; fs.mkdirSync(OUT, { recursive: true });

// id -> [what the guest/owner gets, why a café pays for it, running cost to you]
const D = {
  menu: ['A bilingual digital menu with photos, categories, search and a dish of the day.', 'Replaces printed menus. The reason a café signs up at all.', 'None'],
  qr: ['One QR code per table that opens the menu for that exact table.', 'Guests need no app. Printable QR sheets.', 'None'],
  admin: ['Owner dashboard: edit menu, prices, tables, theme, reports.', 'The owner runs the café without calling you.', 'None'],
  micro: ['Guests tap to call the waiter, ask for water, the bill, etc.', 'Faster service with fewer staff.', 'None'],
  ordering: ['Guests order from their phone, staff see it on the captain screen.', 'Fewer mistakes, faster turnover, bigger orders.', 'None'],
  options: ['Size, milk, sugar and extras with price changes, required or optional choices.', 'Cafés cannot sell coffee properly without it. Raises average ticket.', 'None'],
  itemdetails: ['Allergens, calories and badges (new, spicy, vegan, popular) on each dish.', 'Trust and safety; helps guests decide.', 'None'],
  staff: ['Named staff accounts with PINs and roles; actions are traced to a person.', 'Accountability, tips per waiter, audit log.', 'None'],
  kds: ['Kitchen display screen with timers and order stages.', 'Replaces paper tickets in the kitchen.', 'None'],
  cashier: ['Cashier screen, shifts, X and Z reports, cash in and out.', 'Daily cash control; the owner stops trusting a notebook.', 'None'],
  party: ['Guests say how many people are at the table; helps the host and bill splitting.', 'Better table planning.', 'None'],
  lock: ['Staff approve orders before they reach the kitchen (anti prank, anti walk-out).', 'Safer for open tables and busy venues.', 'None'],
  trilingual: ['A third menu language (for example French or Franco-Arab).', 'Tourist areas, expat cafés.', 'None'],
  online: ['Pickup and delivery ordering page with fees and hours.', 'A new sales channel without paying aggregator commission.', 'None'],
  geo: ['Orders only from inside the café; delivery zones priced by distance.', 'Stops fake orders; fair delivery fees.', 'None'],
  feedback: ['Guest ratings after paying; happy guests are sent to Google reviews, unhappy ones stay private.', 'Better public rating and early warning.', 'None'],
  insights: ['Period comparison, best sellers, peak hours, staff performance, low stock.', 'Decisions from data instead of gut feeling.', 'None'],
  instapay: ['InstaPay or wallet payment at the table with the café\'s QR/number and an "I paid" notice to the cashier.', 'Most Egyptian guests prefer it to cash or card. No gateway fee.', 'None'],
  acctexport: ['Daily sales, service, VAT, tips and payment-method totals as Excel/CSV.', 'Saves the accountant hours every month.', 'None'],
  reservations: ['Guests book a table or join a waitlist from a link; staff confirm, decline or seat them.', 'Fills quiet hours and removes the phone-call burden.', 'None'],
  attendance: ['Staff clock in when they sign in; schedules, lateness, hours and labour cost per person.', 'Shows what each person really costs and who is reliable.', 'None'],
  carservice: ['Guests parked outside order from their car: they pick the car colour and type, order and tap I am here. Staff get a car screen and bring the order out.', 'Add-on for cafes and kiosks with parking or a car area. Not in any bundle: switch it on per venue (or add it to a bundle) from the super admin.', 'None'],
  ownerreport: ['A one-page report for the owner: KPIs, staff scorecard, findings, decisions and menu engineering.', 'Lets you advise the owner from his own numbers.', 'None'],
  invoicing: ['Formal numbered invoices with your own letterhead, template and language, from a paid order or blank.', 'Satisfies companies and authorities that ask for a proper invoice.', 'None'],
  purchasing: ['Suppliers, reorder suggestions from low stock, purchase orders, receiving that updates stock and cost.', 'Stops stock-outs and keeps ingredient costs current.', 'Recipes & ingredient stock'],
  recipes: ['Ingredients, recipes, stock that drops with every sale, food-cost % per dish.', 'The owner sees real margin and what to reorder. Strong upsell to VIP.', 'None'],
  upsell: ['Smart suggestions ("add a cake?") by time of day and basket.', 'Raises average ticket with no staff effort.', 'None'],
  coupons: ['Coupon codes and timed offers (happy hour).', 'Marketing tool that fills slow hours.', 'None'],
  onlinepay: ['Card payment online through Paymob.', 'Delivery prepaid; guests pay without waiting for the bill.', 'Paymob fees are paid by the café'],
  eta: ['Egyptian tax authority e-receipts.', 'Compliance for registered businesses.', 'Needs ETA credentials; support effort'],
  offline: ['Staff keep working when the internet drops, syncing later.', 'Cafés with weak internet.', 'None'],
  loyalty: ['Points per visit and rewards, tied to the guest phone.', 'Repeat visits.', 'None'],
  giftcards: ['Sell and redeem gift cards.', 'Cash up front, new guests.', 'None'],
  themes: ['Premium and luxury visual themes for the guest menu.', 'Brand feel for upscale venues.', 'None'],
  ocr: ['Photo of a printed menu becomes a digital menu automatically.', 'Onboarding in minutes instead of hours.', 'AI usage cost per scan'],
  copilot: ['An AI assistant that answers questions about sales and changes settings by chat.', 'The "wow" feature for VIP demos.', 'AI usage cost per message'],
  branches: ['Several branches, combined reports.', 'Chains and owners with 2 or more locations.', 'None'],
};
const LV = { 1: ['Level 1 - Core', 'The product does not work without these. Give them to everyone.'], 2: ['Level 2 - Strong value', 'Features most cafés notice and value within the first month.'], 3: ['Level 3 - Growth tools', 'Features that raise revenue or control for busier venues.'], 4: ['Level 4 - Premium', 'Differentiators for bigger venues and chains.'] };
const AREA = { guest: 'Guest side', staff: 'Staff side', admin: 'Owner dashboard' };
const PL = ['basic', 'operations', 'vip'], has = (p, id) => F.PLANS[p].features.includes(id);
const rows = F.CATALOG.map((c) => ({ ...c, d: D[c.id] || ['', '', ''], inPlan: PL.filter((p) => has(p, c.id)), min: F.minPlanFor(c.id) }));
for (const r of rows) if (!D[r.id]) console.warn('no description for', r.id);

const planName = (p) => F.PLANS[p].name + ' (' + F.PLANS[p].price[0] + ' EGP/mo)';
let md = `# TableTab feature catalogue by importance\n\nGenerated from the app's feature list (features.js). Every feature has a level (1 = the product needs it, 4 = premium extra), an area, and the bundle it sits in today.\nThe super console lets you move any feature between bundles and lock it per café, so nothing here is final.\n\n## How the bundles stand today\n\n| Bundle | Monthly price (from - to) | Features |\n|---|---|---|\n`;
for (const p of PL) md += `| ${F.PLANS[p].name} | ${F.PLANS[p].price[0]} to ${F.PLANS[p].price[1]} EGP | ${F.PLANS[p].features.length} |\n`;
md += `\n## Features by importance\n`;
for (const lv of [1, 2, 3, 4]) {
  md += `\n### ${LV[lv][0]}\n${LV[lv][1]}\n\n| Feature | Area | What it does | Why a café pays | Running cost to you | Starter | Operations | VIP |\n|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows.filter((x) => x.level === lv)) md += `| **${r.en}** | ${AREA[r.area]} | ${r.d[0]} | ${r.d[1]} | ${r.d[2]} | ${has('basic', r.id) ? 'yes' : '-'} | ${has('operations', r.id) ? 'yes' : '-'} | ${has('vip', r.id) ? 'yes' : '-'} |\n`;
}
md += `\n## Ideas not built yet\n\nThese came out of the market research and are not in the app. Tell me which ones are worth building.\n\n| Idea | What it would do | Effort |\n|---|---|---|\n| Delivery driver assignment and tracking | Assign an order to a rider, guest sees status | Medium |\n| "Order direct" nudge | Tells aggregator customers to order from the café for a discount | Small |\n| WhatsApp order and booking confirmations | Sends confirmations through WhatsApp Business | Medium, needs a WhatsApp account |\n| Table turn-time alerts | Warns when a table stays long while guests are waiting | Small |\n| Supplier purchase orders | Turns low ingredient stock into a shopping list | Medium |\n| Printed kitchen tickets for every station | Splits tickets between bar and kitchen printers | Medium |\n| Customer database export | Guest names and phones (with consent) for marketing | Small |\n| Happy-hour automatic pricing | Prices change by time of day | Small |\n\n## Deciding prices - questions to ask\n\n1. Which Level 1 and 2 features would a small café refuse to live without? Those define the entry bundle.\n2. Which features cost you money to run (AI, Paymob support, ETA)? Keep them out of the cheapest bundle.\n3. Which features raise a café's revenue (options, upsell, online ordering, reservations)? Those justify the middle bundle's price.\n4. Which features only bigger venues need (branches, recipes, loyalty, gift cards, AI)? Those justify the top bundle.\n`;
fs.writeFileSync(OUT + 'FEATURES_BY_IMPORTANCE.md', md);

const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
const csv = ['Level,Area,Feature,Feature (Arabic),Id,What it does,Why a cafe pays,Running cost to you,Starter,Operations,VIP,Lowest bundle today,Your decision / price notes', ...rows.map((r) => [r.level, AREA[r.area], r.en, r.ar, r.id, r.d[0], r.d[1], r.d[2], has('basic', r.id) ? 'yes' : '', has('operations', r.id) ? 'yes' : '', has('vip', r.id) ? 'yes' : '', F.PLANS[r.min].name, ''].map(q).join(','))].join('\n');
fs.writeFileSync(OUT + 'features.csv', '\ufeff' + csv);
fs.writeFileSync(OUT + 'README.md', `# Feature catalogue\n\nThis folder is for deciding what goes in which bundle and at what price.\n\n- **FEATURES_BY_IMPORTANCE.md** - every feature grouped by level (1 core to 4 premium), what it does, what it costs you to run, and which bundle holds it today. Ends with ideas not built yet and questions for setting prices.\n- **features.csv** - the same list as a spreadsheet. Open it in Excel and use the last column for your decisions.\n\nTo apply a decision: sign in to the super console (admin.tabletab-tt.com), open Bundles, tick the features for each bundle and set the prices. It takes effect within about 20 seconds, no deploy needed. A single café can also be locked or unlocked per feature from its row.\n\nThe lists are generated: run \`node scripts/gen-features.js\` after changing features.js.\n`);
console.log('features docs written:', rows.length);
