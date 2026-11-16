// السرايا (El Saraya): an Egyptian ahwa (قهوة بلدي). Tea, Turkish coffee, herbs, juices, shisha and snacks.
// Its own look: white / black / orange, the name in gold Ruqaa calligraphy, and a "ولعة" (fresh coals for the shisha) button for guests.
// Three switches below are only set by this preset, so no other café changes:
//   staffAccess - the owner turns each person's access to the waiter/captain screen, the cashier screen and floor-plan editing on or off
//   fireBtn     - guests can ask for a ولعة from the table; the captain sees it as a 🔥 request
//   nameFont    - the café name is written in a Google font, in gold
const F = require('../features');
const { pick } = require('./photos');
const IMG = '/demo/saraya/';
const PHOTO = [
  [/^Mint Tea|^Tea/, 'tea'], [/^Green Tea/, 'greentea'], [/^Turkish|^Double Turkish/, 'turkish'], [/^French Coffee/, 'frenchcoffee'], [/^Nescafe/, 'nescafe'],
  [/^Cappuccino/, 'cappuccino'], [/^Espresso/, 'espresso'], [/^Sahlab/, 'sahlab'], [/^Hot Cocoa/, 'hotchoc'], [/^Cinnamon with Milk/, 'cinnmilk'],
  [/^Anise|^Hot Hibiscus|^Fenugreek|^Cinnamon|^Ginger|^Mixed Herbs/, 'herbal'], [/^Lemon Mint/, 'lemonmint'], [/^Lemon/, 'lemonade'], [/^Orange/, 'orange'],
  [/^Mango/, 'mango'], [/^Guava/, 'guava'], [/^Strawberry/, 'strawberry'], [/^Iced Hibiscus|^Tamarind/, 'pinksoda'], [/^Soft Drink/, 'cola'], [/^Red Bull/, 'redbull'], [/^Water/, 'water'],
];

const categories = [
  { id: 'c1', name: 'Tea', name_ar: 'الشاي', emoji: '🫖', station: 'bar' },
  { id: 'c2', name: 'Coffee', name_ar: 'القهوة', emoji: '☕', station: 'bar' },
  { id: 'c3', name: 'Herbs & Hot Drinks', name_ar: 'أعشاب ومشروبات سخنة', emoji: '🌿', station: 'bar' },
  { id: 'c4', name: 'Cold Drinks & Juices', name_ar: 'عصاير وساقع', emoji: '🍋', station: 'bar' },
  { id: 'c5', name: 'Shisha', name_ar: 'الشيشة', emoji: '💨', station: 'bar' },
  { id: 'c6', name: 'Snacks', name_ar: 'تسالي', emoji: '🥜', station: 'bar' },
];

// ---- option groups ----
const ch = (list) => list.map((c, i) => { const [name, price = 0, name_ar] = c; return { id: 'c' + i, name, ...(name_ar ? { name_ar } : {}), price }; });
const one = (id, name, name_ar, list, required, defIdx) => ({ id, name, name_ar, type: 'one', required: !!required, choices: ch(list).map((c, i) => (i === defIdx ? { ...c, def: true } : c)) });
const many = (id, name, name_ar, list, max) => ({ id, name, name_ar, type: 'many', max: max || 3, choices: ch(list) });
const sugar = one('sugar', 'Sugar', 'السكر', [['No sugar', 0, 'سادة'], ['A little', 0, 'ع الريحة'], ['Medium', 0, 'مظبوط'], ['Sweet', 0, 'زيادة']], true, 2);
const teaKind = one('kind', 'Tea', 'نوع الشاي', [['Loose leaf (koshary)', 0, 'كشري'], ['Tea bag', 0, 'فتلة'], ['Kettle tea (kanaka)', 5, 'شاي كنكة']], true, 0);
const coffeeExtra = many('add', 'Additions', 'إضافات', [['Extra shot', 10, 'وش زيادة'], ['Mastic', 5, 'مستكة'], ['Cardamom', 5, 'حبهان']], 2);
const shishaAdd = many('add', 'Extras', 'إضافات', [['Extra head', 30, 'حجر زيادة'], ['Ice hose', 15, 'لي تلج'], ['Milk in the base', 10, 'لبن في القزازة']], 3);

// [cat, name, name_ar, price, emoji, prep minutes, featured, options[]]
const R = [
  ['c1', 'Tea', 'شاي', 15, '🫖', 3, 1, [teaKind, sugar]],
  ['c1', 'Mint Tea', 'شاي بالنعناع', 18, '🌿', 3, 1, [teaKind, sugar]],
  ['c1', 'Tea with Milk', 'شاي بلبن', 25, '🥛', 4, 0, [sugar]],
  ['c1', 'Green Tea', 'شاي أخضر', 20, '🍵', 3, 0, [sugar]],
  ['c2', 'Turkish Coffee', 'قهوة تركي', 25, '☕', 5, 1, [sugar, coffeeExtra]],
  ['c2', 'Double Turkish Coffee', 'قهوة تركي دبل', 35, '☕', 5, 0, [sugar, coffeeExtra]],
  ['c2', 'French Coffee', 'قهوة فرنساوي', 35, '☕', 5, 0, [sugar]],
  ['c2', 'Nescafe', 'نسكافيه', 30, '☕', 3, 0, [one('mk', 'Black or milk', 'سادة ولا بلبن', [['Black', 0, 'سادة'], ['With milk', 5, 'بلبن']], true, 0), sugar]],
  ['c2', 'Espresso', 'إسبريسو', 30, '☕', 3, 0, []],
  ['c2', 'Cappuccino', 'كابتشينو', 40, '☕', 4, 0, [sugar]],
  ['c3', 'Anise', 'ينسون', 15, '🌿', 4, 0, [sugar]],
  ['c3', 'Hot Hibiscus', 'كركديه سخن', 15, '🌺', 4, 0, [sugar]],
  ['c3', 'Fenugreek', 'حلبة', 15, '🌾', 4, 0, [sugar]],
  ['c3', 'Cinnamon', 'قرفة', 15, '🌰', 4, 0, [sugar]],
  ['c3', 'Cinnamon with Milk', 'قرفة بلبن', 25, '🥛', 4, 0, [sugar]],
  ['c3', 'Ginger', 'جنزبيل', 20, '🫚', 4, 0, [sugar]],
  ['c3', 'Mixed Herbs', 'أعشاب مشكلة', 20, '🌿', 4, 0, [sugar]],
  ['c3', 'Sahlab', 'سحلب', 35, '🥣', 6, 1, [many('top', 'Toppings', 'على الوش', [['Nuts', 10, 'مكسرات'], ['Coconut', 5, 'جوز هند'], ['Raisins', 5, 'زبيب']], 3)]],
  ['c3', 'Hot Cocoa', 'كاكاو بلبن', 30, '🍫', 4, 0, []],
  ['c3', 'Hummus el Sham', 'حمص الشام', 25, '🌶️', 5, 0, [one('hot', 'Spicy', 'الشطة', [['Normal', 0, 'عادي'], ['Spicy', 0, 'بالشطة']], true, 0)]],
  ['c4', 'Lemon', 'ليمون', 25, '🍋', 3, 0, []],
  ['c4', 'Lemon Mint', 'ليمون نعناع', 30, '🍋', 3, 1, []],
  ['c4', 'Orange Juice', 'برتقال', 35, '🍊', 3, 0, []],
  ['c4', 'Mango Juice', 'مانجو', 45, '🥭', 3, 0, []],
  ['c4', 'Guava Juice', 'جوافة', 35, '🍐', 3, 0, []],
  ['c4', 'Strawberry Juice', 'فراولة', 40, '🍓', 3, 0, []],
  ['c4', 'Iced Hibiscus', 'كركديه ساقع', 20, '🌺', 2, 0, []],
  ['c4', 'Tamarind', 'تمر هندي', 20, '🥤', 2, 0, []],
  ['c4', 'Licorice', 'عرقسوس', 20, '🥤', 2, 0, []],
  ['c4', 'Sobia', 'سوبيا', 25, '🥛', 2, 0, []],
  ['c4', 'Soft Drink', 'حاجة ساقعة', 20, '🥤', 1, 0, [one('k', 'Which one', 'نوعها', [['Pepsi', 0, 'بيبسي'], ['7up', 0, 'سفن أب'], ['Mirinda', 0, 'ميرندا'], ['Schweppes', 0, 'شويبس']], true, 0)]],
  ['c4', 'Red Bull', 'ريدبول', 70, '⚡', 1, 0, []],
  ['c4', 'Water', 'مياه', 10, '💧', 1, 0, [one('sz', 'Size', 'الحجم', [['Small', 0, 'صغيرة'], ['Large', 5, 'كبيرة']], true, 0)]],
  ['c5', 'Shisha Moassel', 'شيشة معسل', 40, '💨', 5, 1, [shishaAdd]],
  ['c5', 'Shisha Moassel Qass', 'شيشة معسل قص', 45, '💨', 5, 0, [shishaAdd]],
  ['c5', 'Double Apple Shisha', 'شيشة تفاحتين', 60, '🍏', 5, 1, [shishaAdd]],
  ['c5', 'Mint Shisha', 'شيشة نعناع', 60, '🌿', 5, 0, [shishaAdd]],
  ['c5', 'Grape Mint Shisha', 'شيشة عنب نعناع', 60, '🍇', 5, 0, [shishaAdd]],
  ['c5', 'Watermelon Mint Shisha', 'شيشة بطيخ نعناع', 60, '🍉', 5, 0, [shishaAdd]],
  ['c5', 'Lemon Mint Shisha', 'شيشة ليمون نعناع', 60, '🍋', 5, 0, [shishaAdd]],
  ['c5', 'Cantaloupe Shisha', 'شيشة كانتلوب', 60, '🍈', 5, 0, [shishaAdd]],
  ['c5', 'Mastic Shisha', 'شيشة مستكة', 60, '💨', 5, 0, [shishaAdd]],
  ['c5', 'Mixed Fruit Shisha', 'شيشة فواكه مشكلة', 70, '🍓', 5, 0, [shishaAdd]],
  ['c6', 'Lupini', 'ترمس', 15, '🫘', 1, 0, []],
  ['c6', 'Peanuts', 'سوداني', 20, '🥜', 1, 0, []],
  ['c6', 'Seeds', 'لب', 20, '🌻', 1, 0, [one('k', 'Kind', 'النوع', [['Sunflower', 0, 'لب سوري'], ['Watermelon', 0, 'لب أبيض'], ['Mixed', 5, 'مشكل']], true, 0)]],
  ['c6', 'Popcorn', 'فشار', 20, '🍿', 2, 0, []],
  ['c6', 'Biscuits', 'بسكويت', 15, '🍪', 1, 0, []],
];

const items = R.map((r, i) => ({
  id: 'i' + (i + 1), cat: r[0], name: r[1], name_ar: r[2], price: r[3], cost: Math.round(r[3] * 0.3), emoji: r[4], desc: '', prep: r[5], featured: !!r[6],
  img: pick(PHOTO, r[1], ''),
  ...(r[7].length ? { options: r[7] } : {}),
}));

// Floor: small round ahwa tables inside, a row out on the sidewalk, the counter (النصبة) in the corner. The owner or a trusted captain can rearrange it any time.
const IN = [0.5, 4.5, 8.5, 12.5, 16.5], OUT = [0.5, 4.5, 8.5, 12.5, 16.5, 20.5];
const tables = [
  ...[0.5, 4.5].flatMap((fy) => IN.map((fx) => ({ fx, fy, zone: 'جوه' }))),
  ...OUT.map((fx) => ({ fx, fy: 11.5, zone: 'الرصيف' })),
].map((p, i) => ({ id: 't' + (i + 1), number: i + 1, ...p, fw: 3, fh: 3, shape: 'round', seats: 4 }));
const floor = { cols: 24, rows: 16, decor: [
  { id: 'd1', type: 'bar', fx: 20, fy: 0, fw: 4, fh: 8, label: 'النصبة' },
  { id: 'd2', type: 'wall', fx: 0, fy: 9, fw: 9, fh: 1, label: '' }, { id: 'd3', type: 'door', fx: 9, fy: 8.5, fw: 3, fh: 2, label: 'الباب' },
  { id: 'd4', type: 'wall', fx: 12, fy: 9, fw: 8, fh: 1, label: '' }, { id: 'd5', type: 'plant', fx: 21, fy: 8.5, fw: 2, fh: 2, label: '' },
] };

const settings = {
  name: 'El Saraya', name_ar: 'السرايا', lang: 'ar', tagline: 'Tea, coffee and shisha, the way it should be', tagline_ar: 'شاي وقهوة وشيشة، زي ما لازم تكون',
  tagline_sub: 'Order from your table, and ask for a fresh fire for your shisha with one tap.', tagline_sub_ar: 'اطلب من على ترابيزتك، ولو عايز ولعة دوس على الزرار وهتوصلك.',
  logo: IMG + 'logo.svg', theme: 'custom',
  palette: { accent: '#f26b0f', accent2: '#c9a227', bg: '#ffffff', card: '#f6f4f1', text: '#111111' },
  paletteDark: { accent: '#ff7a1a', accent2: '#d4af37', bg: '#0b0b0b', card: '#181818', text: '#f5f5f5' },
  nameFont: { family: 'Aref Ruqaa', weight: 700 },
  demoBrand: { g: '#111111', bg: '#ffffff', text: '#111111', muted: '#6b6b6b', line: '#ece6dc' },
  staffAccess: true, fireBtn: true,
  menuLayout: 'list', heroImg: '', kitchenStations: 2, tax: 0, service: 0, wifi: 'ElSaraya', wifiPass: 'saraya2026',
  online: F.onlineCfg({ online: { enabled: false } }),
  floor,
  promos: [
    { title: 'Fresh fire, any time', title_ar: 'الولعة عندنا ببلاش', text: 'Tap the 🔥 button and we bring fresh coals to your shisha.', text_ar: 'دوس على زرار 🔥 ولعة وهنغيرلك الفحم على طول.' },
    { title: 'Join our loyalty card', title_ar: 'اعمل كارت الولاء', text: 'Every 10 EGP you spend = 1 point.', text_ar: 'كل 10 جنيه = نقطة، واستخدم نقطك في الحساب.' },
  ],
};
module.exports = { categories, items, settings, tables };
