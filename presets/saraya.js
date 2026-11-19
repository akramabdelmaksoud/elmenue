// Showroom for Egypt: "Saraya Cafe" (السرايا كافيه), Nasr City, Cairo. Menu read from the café's printed menu; EGP, Egyptian Arabic. Used by /p/saraya.
const F = require('../features');
const IMG = '/demo/saraya/';
const categories = [
  { id: "hot", name: "السخن", name_ar: "السخن", emoji: "☕", station: 'bar' },
  { id: "herb", name: "الأعشاب", name_ar: "الأعشاب", emoji: "🌿", station: 'bar' },
  { id: "juice", name: "العصائر", name_ar: "العصائر", emoji: "🍹", station: 'bar' },
  { id: "sweet", name: "الحلو", name_ar: "الحلو", emoji: "🍨", station: 'bar' },
  { id: "can", name: "كانز", name_ar: "كانز", emoji: "🥤", station: 'bar' },
];
const extra = { id: 'extra', name: 'Extras', name_ar: 'إضافات', type: 'many', max: 3, choices: ['عسل نحل', 'صوص', 'مكسرات', 'مناديل', 'قرنفل', 'موز', 'بلح'].map((n, i) => ({ id: 'x' + i, name: n, name_ar: n, price: 10 })) };
const PICKS = ['كابتشينو', 'سوبر السرايا', 'أم علي بالقشطة', 'ميلك شيك لوتس'];   // a family counts as featured when one of its types is listed here
// [cat, name, price, emoji, note]
const R = [
  ["hot", "شاي", 20, "🍵", ""],
  ["hot", "شاي أخضر", 25, "🍵", ""],
  ["hot", "شاي بحليب", 45, "🍵", ""],
  ["hot", "شاي براد سنجل", 30, "🍵", ""],
  ["hot", "براد سنجل بالقرنفل", 40, "☕", ""],
  ["hot", "براد شاي 4 أفراد", 90, "🍵", ""],
  ["hot", "شاي براد دبل", 50, "🍵", ""],
  ["hot", "قهوة تركي", 30, "☕", ""],
  ["hot", "قهوة تركي دبل", 50, "☕", ""],
  ["hot", "قهوة فرنساوي", 40, "☕", ""],
  ["hot", "قهوة فرنساوي دبل", 75, "☕", ""],
  ["hot", "كوفي ميكس سادة", 35, "☕", ""],
  ["hot", "كوفي ميكس بحليب", 50, "☕", ""],
  ["hot", "قهوة بندق", 50, "☕", ""],
  ["hot", "قهوة بندق دبل", 85, "☕", ""],
  ["hot", "نسكافيه بلاك", 35, "☕", ""],
  ["hot", "نسكافيه بحليب", 55, "☕", ""],
  ["hot", "كابتشينو", 55, "☕", ""],
  ["herb", "حلبة", 25, "🌿", ""],
  ["herb", "حلبة بحليب", 50, "🌿", ""],
  ["herb", "جنزبيل", 40, "🌿", ""],
  ["herb", "جنزبيل بحليب", 55, "🌿", ""],
  ["herb", "قرفة", 40, "🌿", ""],
  ["herb", "قرفة بحليب", 55, "🌿", ""],
  ["herb", "ينسون", 25, "🌿", ""],
  ["herb", "كركديه", 25, "🌿", ""],
  ["herb", "ليمون سخن", 30, "🌿", ""],
  ["herb", "كوكتيل أعشاب", 45, "🌿", ""],
  ["herb", "هوت سيدر", 60, "🥛", ""],
  ["herb", "حمص الشام", 55, "🥛", ""],
  ["herb", "سحلب مكسرات", 60, "🥛", ""],
  ["herb", "سحلب شوكولاتة", 65, "🥛", ""],
  ["herb", "سحلب أوريو", 70, "🥛", ""],
  ["herb", "سحلب فواكة", 75, "🥛", ""],
  ["herb", "كاكاو", 55, "🥛", ""],
  ["juice", "عناب", 35, "🍹", ""],
  ["juice", "ليمون", 35, "🍋", ""],
  ["juice", "ليمون بحليب أو نعناع", 40, "🍋", ""],
  ["juice", "مانجو", 60, "🥭", ""],
  ["juice", "فراولة", 60, "🍓", ""],
  ["juice", "جوافة", 60, "🍈", ""],
  ["juice", "برتقال", 60, "🍊", ""],
  ["juice", "موز بحليب", 65, "🍌", ""],
  ["juice", "بلح بحليب", 70, "🍹", ""],
  ["juice", "كنتالوب بحليب", 65, "🍹", ""],
  ["juice", "أفوكادو", 85, "🥑", ""],
  ["juice", "أفوكادو مكسرات", 90, "🥑", ""],
  ["juice", "رمان", 60, "🍎", ""],
  ["juice", "ميلك شيك", 65, "🥤", ""],
  ["juice", "ميلك شيك لوتس", 80, "🥤", ""],
  ["juice", "أوريو", 75, "🥤", ""],
  ["juice", "تويكس أو هوهو", 75, "🥤", ""],
  ["juice", "كوكتيل عصير", 75, "🍹", ""],
  ["juice", "كوكتيل قطع بالأيس", 85, "🍹", ""],
  ["juice", "سوبر السرايا", 75, "🍹", "مانجو وأيس كريم فانيليا"],
  ["juice", "مانجو خوخ", 70, "🥭", ""],
  ["juice", "كيوي", 75, "🥝", ""],
  ["juice", "كيوي مانجو", 75, "🥭", ""],
  ["juice", "كيوي حليب", 70, "🥝", ""],
  ["juice", "زبادي", 70, "🍧", ""],
  ["juice", "زبادي خوخ", 75, "🍧", ""],
  ["juice", "زبادي فواكة", 80, "🍧", ""],
  ["juice", "زبادي فواكة قطع", 95, "🍧", ""],
  ["juice", "زبادي بلو بيري", 70, "🍧", ""],
  ["juice", "زبادي فواكة أيس", 100, "🍧", ""],
  ["juice", "برتقال بالجزر أو بالأناناس", 70, "🍊", ""],
  ["juice", "مشروب طاقة", 90, "⚡", ""],
  ["sweet", "2 بولة أيس", 40, "🍨", ""],
  ["sweet", "3 بولة أيس", 55, "🍨", ""],
  ["sweet", "فروت سلات", 90, "🍓", ""],
  ["sweet", "فروت سلات أيس", 100, "🍓", ""],
  ["sweet", "فروت سلات قنبلة", 120, "🍓", ""],
  ["sweet", "بليلة بالحليب", 60, "🍚", ""],
  ["sweet", "أم علي سادة", 60, "🍮", ""],
  ["sweet", "أم علي بالقشطة", 70, "🍮", ""],
  ["sweet", "أم علي أيس كريم", 70, "🍮", ""],
  ["sweet", "أم علي أيس وفواكة", 90, "🍮", ""],
  ["sweet", "أرز باللبن", 50, "🍚", ""],
  ["sweet", "أرز باللبن أيس", 60, "🍚", ""],
  ["sweet", "أرز باللبن بالقشطة", 60, "🍚", ""],
  ["sweet", "أرز باللبن أيس وفواكة", 80, "🍚", ""],
  ["can", "مياه معدنية صغيرة", 12, "💧", ""],
  ["can", "كانز", 35, "🥫", ""],
  ["can", "ريد بول", 70, "⚡", ""],
];
// One card per drink family ("Tea"), the variants (green tea, tea with milk, ...) become a REQUIRED "Type" choice with their own prices.
// Card price = the cheapest variant; each choice adds the difference, so the sheet total is always the real menu price.
const FAMILIES = [
  ['hot', 'شاي', 'Tea', '🍵', ['شاي', 'شاي أخضر', 'شاي بحليب', 'شاي براد سنجل', 'براد سنجل بالقرنفل', 'شاي براد دبل', 'براد شاي 4 أفراد']],
  ['hot', 'قهوة تركي', 'Turkish coffee', '☕', ['قهوة تركي', 'قهوة تركي دبل']],
  ['hot', 'قهوة فرنساوي', 'French coffee', '☕', ['قهوة فرنساوي', 'قهوة فرنساوي دبل']],
  ['hot', 'كوفي ميكس', 'Coffee mix', '☕', ['كوفي ميكس سادة', 'كوفي ميكس بحليب']],
  ['hot', 'قهوة بندق', 'Hazelnut coffee', '☕', ['قهوة بندق', 'قهوة بندق دبل']],
  ['hot', 'نسكافيه', 'Nescafe', '☕', ['نسكافيه بلاك', 'نسكافيه بحليب']],
  ['herb', 'حلبة', 'Fenugreek', '🌿', ['حلبة', 'حلبة بحليب']],
  ['herb', 'جنزبيل', 'Ginger', '🌿', ['جنزبيل', 'جنزبيل بحليب']],
  ['herb', 'قرفة', 'Cinnamon', '🌿', ['قرفة', 'قرفة بحليب']],
  ['herb', 'سحلب', 'Sahlab', '🥛', ['سحلب مكسرات', 'سحلب شوكولاتة', 'سحلب أوريو', 'سحلب فواكة']],
  ['juice', 'أفوكادو', 'Avocado', '🥑', ['أفوكادو', 'أفوكادو مكسرات']],
  ['juice', 'زبادي', 'Yogurt', '🍧', ['زبادي فواكة', 'زبادي فواكة قطع', 'زبادي بلو بيري', 'زبادي فواكة أيس']],
  ['sweet', 'أم علي', 'Umm Ali', '🍮', ['أم علي سادة', 'أم علي بالقشطة', 'أم علي أيس كريم', 'أم علي أيس وفواكة']],
  ['sweet', 'أرز باللبن', 'Rice pudding', '🍚', ['أرز باللبن', 'أرز باللبن أيس', 'أرز باللبن بالقشطة', 'أرز باللبن أيس وفواكة']],
  ['sweet', 'فروت سلات', 'Fruit salad', '🍓', ['فروت سلات', 'فروت سلات أيس', 'فروت سلات قنبلة']],
  ['sweet', 'بولة أيس كريم', 'Ice cream scoops', '🍨', ['2 بولة أيس', '3 بولة أيس']],
];
const items = []; const doneFam = new Set();
R.forEach((r) => {
  const fam = FAMILIES.find((f) => f[0] === r[0] && f[4].includes(r[1]));
  const withExtra = ['hot', 'herb', 'juice'].includes(r[0]);
  if (!fam) { items.push({ id: 'i' + (items.length + 1), cat: r[0], name: r[1], name_ar: r[1], price: r[2], cost: Math.round(r[2] * 0.3), emoji: r[3], desc: r[4], prep: r[0] === 'can' ? 1 : 4, featured: PICKS.includes(r[1]), ...(withExtra ? { options: [extra] } : {}) }); return; }
  if (doneFam.has(fam)) return; doneFam.add(fam);
  const rows = fam[4].map((n) => R.find((x) => x[0] === r[0] && x[1] === n)).filter(Boolean), min = Math.min(...rows.map((x) => x[2]));
  const type = { id: 'type', name: 'Type', name_ar: 'النوع', type: 'one', required: true, max: 1, choices: rows.map((x, k) => ({ id: 'v' + (k + 1), name: x[1] + ' · ' + x[2] + ' EGP', name_ar: x[1] + ' · ' + x[2] + ' ج', price: x[2] - min })) };
  items.push({ id: 'i' + (items.length + 1), cat: r[0], name: fam[2], name_ar: fam[1], price: min, cost: Math.round(min * 0.3), emoji: fam[3], desc: 'Pick the type: starts from ' + min + ' EGP', desc_ar: 'اختار النوع · يبدأ من ' + min + ' ج', prep: 4, featured: rows.some((x) => PICKS.includes(x[1])), options: withExtra ? [type, extra] : [type] });
});
// Real photos (openly licensed, credits in /demo/photos/CREDITS.md). First matching rule wins; some are the closest available look, not the exact dish.
const { pick } = require('./photos');
const PHOTO = [
  [/^شاي أخضر/, 'greentea'], [/^شاي/, 'tea'], [/قهوة تركي/, 'turkish'], [/فرنساوي/, 'frenchcoffee'], [/كوفي ميكس|نسكافيه/, 'nescafe'], [/بندق/, 'hazelnut'], [/كابتشينو/, 'cappuccino'],
  [/حلبة/, 'herbal'], [/جنزبيل/, 'ginger'], [/قرفة/, 'cinnamon'], [/ينسون/, 'anise'], [/كركديه/, 'hibiscus'], [/ليمون سخن/, 'lemonmint'], [/كوكتيل أعشاب/, 'herbal'],
  [/هوت سيدر/, 'cider'], [/حمص الشام/, 'cinnmilk'], [/سحلب/, 'sahlab'], [/كاكاو/, 'hotchoc'], [/عناب/, 'jujube'],
  [/ليمون بحليب|ليمون/, 'lemonade'], [/مانجو خوخ/, 'peach'], [/كيوي/, 'kiwi'], [/مانجو/, 'mango'], [/فراولة/, 'strawberry'], [/جوافة/, 'guava'], [/برتقال بالجزر/, 'carrotjuice'], [/برتقال/, 'orange'],
  [/موز/, 'strawmilk'], [/بلح/, 'datelatte'], [/كنتالوب/, 'peach'], [/أفوكادو/, 'avocado'], [/رمان/, 'pomegranate'],
  [/أوريو/, 'shakeoreo'], [/لوتس|تويكس/, 'shakechoc'], [/ميلك شيك/, 'shakevanilla'], [/كوكتيل/, 'mocktail'], [/سوبر السرايا/, 'cocomango'], [/طاقة/, 'redbull'],
  [/زبادي/, 'yogurt'], [/بولة/, 'icecream'], [/فروت سلات/, 'fruitsalad'], [/بليلة|أرز/, 'muhallabia'], [/أم علي/, 'ummali'],
  [/ريد بول/, 'redbull'], [/مياه/, 'water'], [/كانز/, 'softdrink'],
];
items.forEach((i) => { i.img = pick(PHOTO, i.name_ar || i.name, ''); });
const settings = {
  name: 'Saraya Cafe', name_ar: 'السرايا كافيه', tagline: 'Tea, coffee and fresh juices in Nasr City', tagline_ar: 'شاي وقهوة وعصائر طازة في مدينة نصر',
  tagline_sub: 'Order from your phone and call the captain with one tap.', tagline_sub_ar: 'اطلب من موبايلك ونادي الكابتن بضغطة واحدة.',
  logo: IMG + 'logo.jpeg', theme: 'custom', palette: { accent: '#ff7a2f', accent2: '#ffbe5c', bg: '#1a0f0a', card: '#2a170e', text: '#fff4e6' },
  demoBrand: { g: '#ff7a2f', bg: '#1a0f0a', text: '#fff4e6', muted: '#c9ab92', line: '#4a2d1c' },
  currency: 'EGP', tax: 0, service: 0, lang: 'ar', langs: ['ar', 'en'], dialect: 'egypt',
  menuLayout: 'cards', heroImg: '', kitchenStations: 1, games: true, wifi: 'Saraya_Guest', wifiPass: 'saraya2026', requireKey: false, drops: true,
  online: F.onlineCfg({ online: { enabled: true, pickup: true, delivery: false } }),
  promos: [
    { title: 'Saraya Super', title_ar: 'سوبر السرايا', text: 'Mango with vanilla ice cream, our house favourite.', text_ar: 'مانجو بأيس كريم فانيليا، المشروب المميز عندنا.' },
    { title: 'Umm Ali with cream', title_ar: 'أم علي بالقشطة', text: 'Hot, creamy and baked to order.', text_ar: 'سخنة وبالقشطة وطالعة من الفرن.' },
    { title: 'Add honey, nuts or banana', title_ar: 'زوّد مشروبك', text: 'Any extra on your drink is just 10 EGP.', text_ar: 'أي إضافة على مشروبك بـ 10 جنيه بس.' },
    { title: 'Join our loyalty card', title_ar: 'سجّل في كارت الولاء', text: 'Every 10 EGP = 1 point.', text_ar: 'كل 10 جنيه = نقطة، وتستبدلها في حسابك.' },
  ],
  loyalty: { enabled: true, egpPerPoint: 10, pointsPerRedeem: 100, redeemValue: 25 },
};
module.exports = { categories, items, settings };
