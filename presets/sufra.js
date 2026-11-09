// Showroom for the UAE: "Sufra" (سفرة), a full-service Arabic and Gulf restaurant: mezze, grills, Gulf rice dishes, shawarma, desserts.
// AED prices at typical mid-range Dubai / Abu Dhabi levels (5% VAT, 10% service). Gulf Arabic wording (settings.dialect = 'gulf'), English + Arabic only. Used by /p/sufra.
const F = require('../features');
const IMG = '/demo/sufra/';
const { pick } = require('./photos');
const PHOTO = [
  [/^Hummus with Meat/, 'hummusmeat'], [/^Hummus/, 'hummus'], [/^Moutabal/, 'moutabal'], [/^Tabbouleh/, 'tabbouleh'], [/^Fattoush/, 'fattoush'], [/^Labneh/, 'labneh'], [/^Vine Leaves/, 'warak'],
  [/^Kibbeh/, 'kibbeh'], [/^Cheese Sambousek/, 'sambousek'], [/^Falafel Wrap/, 'falafelwrap'], [/^Falafel/, 'falafel'], [/^Fried Halloumi/, 'friedhalloumi'], [/^Chicken Liver/, 'chickenliver'], [/^Batata Harra/, 'batata'],
  [/^Lentil Soup/, 'lentilsoup'], [/^Arabic Salad/, 'arabsalad'], [/^Rocca/, 'roccasalad'],
  [/^Mixed Grill/, 'mixedgrill'], [/^Chicken Tawook/, 'tawook'], [/^Lamb Kofta/, 'kofta'], [/^Lamb Chops/, 'lambchops'], [/^Beef Kebab/, 'beefkebab'], [/^Grilled Hammour/, 'hammour'], [/^Grilled Prawns/, 'prawns'],
  [/^Chicken Machboos/, 'machboos'], [/^Lamb Mandi/, 'mandi'], [/^Chicken Kabsa/, 'kabsa'], [/^Harees/, 'harees'], [/^Saloona/, 'saloona'], [/^Chicken Biryani/, 'biryani'], [/^Fish Sayadieh/, 'sayadieh'],
  [/^Chicken Shawarma Wrap/, 'shawarmawrap'], [/^Beef Shawarma/, 'beefshawarma'], [/^Shawarma Plate/, 'shawarmaplate'], [/^Kofta Sandwich/, 'koftasand'], [/^Chicken Tawook Sandwich/, 'tawook'], [/^French Fries/, 'fries'],
  [/^Kunafa/, 'kunafa'], [/^Umm Ali/, 'ummali'], [/^Baklava/, 'baklava'], [/^Luqaimat/, 'luqaimat'], [/^Basbousa/, 'basbousa'], [/^Muhallabia/, 'muhallabia'],
  [/^Fresh Orange/, 'orange'], [/^Lemon Mint/, 'lemonmint'], [/^Mango/, 'mango'], [/^Pomegranate/, 'pomegranate'], [/^Laban/, 'laban'], [/^Jallab/, 'jallab'], [/^Karak/, 'karak'], [/^Arabic Coffee/, 'arabiccoffee'],
  [/^Turkish Coffee/, 'turkish'], [/^Moroccan|^Mint Tea/, 'mintTea'], [/^Soft Drink/, 'softdrink'], [/^Still Water|^Water/, 'water'], [/^Sparkling/, 'sparkling'], [/^Mojito/, 'mocktail'],
];

const categories = [
  { id: 'c1', name: 'Cold Mezze', name_ar: 'مقبلات باردة', emoji: '🥙', station: 'kitchen' },
  { id: 'c2', name: 'Hot Mezze', name_ar: 'مقبلات ساخنة', emoji: '🧆', station: 'kitchen' },
  { id: 'c3', name: 'Soup & Salads', name_ar: 'شوربة وسلطات', emoji: '🥗', station: 'kitchen' },
  { id: 'c4', name: 'Grills', name_ar: 'مشاوي', emoji: '🍢', station: 'kitchen' },
  { id: 'c5', name: 'Gulf Specialties', name_ar: 'أطباق خليجية', emoji: '🍛', station: 'kitchen' },
  { id: 'c6', name: 'Shawarma & Sandwiches', name_ar: 'شاورما وساندويتشات', emoji: '🌯', station: 'kitchen' },
  { id: 'c7', name: 'Desserts', name_ar: 'حلويات', emoji: '🍮', station: 'kitchen' },
  { id: 'c8', name: 'Drinks', name_ar: 'مشروبات', emoji: '🥤', station: 'bar' },
];

// ---- option groups ----
const ch = (list) => list.map((c, i) => { const [name, price = 0, name_ar] = Array.isArray(c) ? c : [c]; return { id: 'c' + i, name, ...(name_ar ? { name_ar } : {}), price }; });
const one = (id, name, name_ar, list, required, defIdx) => ({ id, name, name_ar, type: 'one', required: !!required, choices: ch(list).map((c, i) => (i === defIdx ? { ...c, def: true } : c)) });
const many = (id, name, name_ar, list, max) => ({ id, name, name_ar, type: 'many', max: max || 3, choices: ch(list) });
const bread = many('bread', 'Extra bread', 'خبز إضافي', [['Arabic bread', 3, 'خبز عربي'], ['Saj bread', 4, 'خبز صاج']], 2);
const grillSide = one('side', 'Served with', 'يُقدَّم مع', [['Saffron rice', 0, 'أرز بالزعفران'], ['French fries', 0, 'بطاطس مقلية'], ['Grilled vegetables', 0, 'خضار مشوية']], true, 0);
const grillAdd = many('add', 'Add', 'إضافات', [['Garlic sauce', 3, 'ثومية'], ['Hummus', 8, 'حمص'], ['Extra bread', 3, 'خبز إضافي']], 3);
const done = one('done', 'How would you like it cooked?', 'درجة الستواء', [['Medium', 0, 'ميديم'], ['Medium well', 0, 'ميديم ويل'], ['Well done', 0, 'ويل دن']], true, 1);
const spice = one('spice', 'Spice level', 'درجة الحرارة', [['Mild', 0, 'خفيف'], ['Medium', 0, 'وسط'], ['Hot', 0, 'حار']], true, 1);
const portion = (extra) => one('portion', 'Portion', 'الحجم', [['Single', 0, 'فرد'], ['For two', extra, 'لشخصين']], true, 0);
const riceAdd = many('add', 'Add', 'إضافات', [['Extra rice', 8, 'أرز إضافي'], ['Daqoos (tomato sauce)', 3, 'دقوس'], ['Raita', 4, 'رايتا'], ['Fried onions', 3, 'بصل مقرمش']], 3);
const wrapSize = one('size', 'Size', 'الحجم', [['Regular', 0, 'عادي'], ['Large', 6, 'كبير']], true, 0);
const wrapAdd = many('add', 'Extras', 'إضافات', [['Extra garlic sauce', 2, 'ثومية زيادة'], ['Pickles', 0, 'مخلل'], ['Fries inside', 3, 'بطاطس داخل الساندويتش'], ['Cheese', 4, 'جبنة']], 3);
const drinkSize = one('size', 'Size', 'الحجم', [['Regular', 0, 'عادي'], ['Large', 4, 'كبير']], true, 0);
const sweet = one('sweet', 'Sweetness', 'درجة السكر', [['Normal sugar', 0, 'سكر عادي'], ['Less sugar', 0, 'سكر خفيف'], ['No sugar', 0, 'بدون سكر']], true, 0);

// [cat, name, name_ar, price, emoji, prep (min), featured, options]
const R = [
  ['c1', 'Hummus', 'حمص', 28, '🥙', 5, 1, [bread]], ['c1', 'Moutabal', 'متبل', 30, '🍆', 5, 0, [bread]], ['c1', 'Tabbouleh', 'تبولة', 32, '🥗', 6, 0, []], ['c1', 'Fattoush', 'فتوش', 34, '🥗', 6, 1, []],
  ['c1', 'Labneh with Zaatar', 'لبنة بالزعتر', 26, '🫒', 4, 0, [bread]], ['c1', 'Vine Leaves (Warak Enab)', 'ورق عنب', 34, '🍃', 6, 0, []],
  ['c2', 'Kibbeh (4 pcs)', 'كبة (4 قطع)', 38, '🧆', 12, 1, []], ['c2', 'Cheese Sambousek (4 pcs)', 'سمبوسة جبنة (4 قطع)', 32, '🥟', 10, 0, []], ['c2', 'Falafel (6 pcs)', 'فلافل (6 قطع)', 26, '🧆', 8, 0, []],
  ['c2', 'Hummus with Meat', 'حمص باللحم', 42, '🥙', 9, 0, [bread]], ['c2', 'Fried Halloumi', 'حلوم مقلي', 36, '🧀', 8, 0, []], ['c2', 'Chicken Liver', 'كبدة دجاج', 34, '🍗', 9, 0, []], ['c2', 'Batata Harra', 'بطاطس حرة', 28, '🥔', 8, 0, [spice]],
  ['c3', 'Lentil Soup', 'شوربة عدس', 24, '🍲', 6, 0, []], ['c3', 'Arabic Salad', 'سلطة عربية', 26, '🥗', 5, 0, []], ['c3', 'Rocca Salad', 'سلطة جرجير', 30, '🥗', 5, 0, [many('add', 'Add', 'إضافات', [['Grilled halloumi', 10, 'حلوم مشوي'], ['Grilled chicken', 12, 'دجاج مشوي']], 2)]],
  ['c4', 'Mixed Grill', 'مشاوي مشكلة', 89, '🍢', 22, 1, [portion(80), grillSide, done, grillAdd]], ['c4', 'Chicken Tawook', 'شيش طاووق', 58, '🍗', 18, 1, [grillSide, grillAdd]], ['c4', 'Lamb Kofta', 'كفتة لحم', 65, '🍢', 18, 0, [grillSide, done, grillAdd]],
  ['c4', 'Lamb Chops', 'ريش غنم', 98, '🍖', 20, 1, [grillSide, done, grillAdd]], ['c4', 'Beef Kebab', 'كباب لحم', 68, '🍢', 18, 0, [grillSide, done, grillAdd]], ['c4', 'Grilled Hammour', 'هامور مشوي', 85, '🐟', 22, 0, [grillSide, grillAdd]],
  ['c4', 'Grilled Prawns', 'روبيان مشوي', 92, '🦐', 18, 0, [grillSide, grillAdd]],
  ['c5', 'Chicken Machboos', 'مجبوس دجاج', 55, '🍛', 20, 1, [portion(45), riceAdd]], ['c5', 'Lamb Mandi', 'مندي لحم', 78, '🍖', 25, 1, [portion(70), riceAdd]], ['c5', 'Chicken Kabsa', 'كبسة دجاج', 58, '🍛', 20, 0, [portion(48), riceAdd]],
  ['c5', 'Harees', 'هريس', 45, '🥣', 15, 1, []], ['c5', 'Saloona', 'سالونة', 52, '🍲', 18, 0, [riceAdd]], ['c5', 'Chicken Biryani', 'برياني دجاج', 50, '🍛', 20, 0, [spice, riceAdd]], ['c5', 'Fish Sayadieh', 'صيادية سمك', 62, '🐟', 22, 0, []],
  ['c6', 'Chicken Shawarma Wrap', 'شاورما دجاج', 18, '🌯', 6, 1, [wrapSize, wrapAdd]], ['c6', 'Beef Shawarma Wrap', 'شاورما لحم', 22, '🌯', 6, 0, [wrapSize, wrapAdd]], ['c6', 'Shawarma Plate', 'صحن شاورما', 42, '🍽️', 10, 0, [one('meat', 'Meat', 'اللحم', [['Chicken', 0, 'دجاج'], ['Beef', 6, 'لحم']], true, 0), wrapAdd]],
  ['c6', 'Falafel Wrap', 'ساندويتش فلافل', 16, '🌯', 6, 0, [wrapSize, wrapAdd]], ['c6', 'Chicken Tawook Sandwich', 'ساندويتش شيش طاووق', 24, '🥖', 8, 0, [wrapSize, wrapAdd]], ['c6', 'Kofta Sandwich', 'ساندويتش كفتة', 26, '🥖', 8, 0, [wrapSize, wrapAdd]],
  ['c6', 'French Fries', 'بطاطس مقلية', 14, '🍟', 6, 0, []],
  ['c7', 'Kunafa', 'كنافة', 34, '🍮', 10, 1, [one('type', 'Type', 'النوع', [['Cheese', 0, 'بالجبنة'], ['Cream (Ashta)', 0, 'بالقشطة'], ['Nutella', 4, 'بالنوتيلا']], true, 0)]], ['c7', 'Umm Ali', 'أم علي', 30, '🥣', 8, 0, []], ['c7', 'Baklava (4 pcs)', 'بقلاوة (4 قطع)', 28, '🥮', 3, 0, []],
  ['c7', 'Luqaimat', 'لقيمات', 26, '🧆', 8, 1, []], ['c7', 'Basbousa', 'بسبوسة', 24, '🍰', 3, 0, []], ['c7', 'Muhallabia', 'مهلبية', 22, '🍮', 3, 0, []],
  ['c8', 'Fresh Orange Juice', 'عصير برتقال طازج', 22, '🍊', 3, 0, [drinkSize]], ['c8', 'Lemon Mint', 'ليمون بالنعناع', 20, '🍋', 3, 0, [drinkSize]], ['c8', 'Mango Juice', 'عصير مانجو', 24, '🥭', 3, 0, [drinkSize]], ['c8', 'Pomegranate Juice', 'عصير رمان', 26, '🍎', 3, 0, [drinkSize]],
  ['c8', 'Laban', 'لبن', 12, '🥛', 1, 0, []], ['c8', 'Jallab', 'جلاب', 18, '🍇', 2, 0, []], ['c8', 'Karak Chai', 'شاي كرك', 10, '🫖', 3, 1, [sweet]], ['c8', 'Arabic Coffee', 'قهوة عربية', 16, '☕', 3, 0, []],
  ['c8', 'Turkish Coffee', 'قهوة تركية', 18, '☕', 5, 0, [sweet]], ['c8', 'Moroccan Mint Tea', 'شاي مغربي بالنعناع', 20, '🌿', 4, 0, []], ['c8', 'Soft Drink', 'مشروب غازي', 10, '🥤', 1, 0, [one('kind', 'Choice', 'الاختيار', [['Cola', 0, 'كولا'], ['Lemon-lime', 0, 'ليمون'], ['Orange', 0, 'برتقال']], true, 0)]],
  ['c8', 'Mojito (no alcohol)', 'موهيتو (بدون كحول)', 24, '🍹', 3, 0, []], ['c8', 'Still Water', 'ماي', 6, '💧', 1, 0, []], ['c8', 'Sparkling Water', 'ماي غازي', 14, '💧', 1, 0, []],
];

const items = R.map((r, i) => ({
  id: 'i' + (i + 1), cat: r[0], name: r[1], name_ar: r[2], price: r[3], cost: Math.round(r[3] * 0.32), emoji: r[4], desc: '', prep: r[5], featured: !!r[6],
  img: pick(PHOTO, r[1], ''),
  ...(r[7].length ? { options: r[7] } : {}),
}));

const settings = {
  name: 'Sufra Restaurant', name_ar: 'مطعم سفرة', tagline: 'Gulf and Levantine favourites, grilled and shared', tagline_ar: 'أطباق خليجية ولبنانية ومشاوي للجمعات',
  tagline_sub: 'Scan, order for the whole table and follow it live.', tagline_sub_ar: 'امسح الرمز واطلبوا للطاولة كلها وتابعوا الطلب مباشرة.',
  logo: IMG + 'logo.svg', theme: 'custom', palette: { accent: '#0f6b66', accent2: '#c8963e', bg: '#f5f0e6', card: '#ffffff', text: '#12302e' },
  demoBrand: { g: '#0f4c4a', bg: '#f3efe6', text: '#12302e', muted: '#587270', line: '#d9d2c0' },
  currency: 'AED', tax: 5, service: 10, lang: 'en', langs: ['ar', 'en'], dialect: 'gulf',
  menuLayout: 'cards', heroImg: '', kitchenStations: 2, wifi: 'Sufra_Guest', wifiPass: 'welcome2026', requireKey: false,
  online: F.onlineCfg({ online: { enabled: true, pickup: true, delivery: true } }),
  promos: [
    { title: 'Family mandi for the weekend', title_ar: 'مندي العائلة في الويكند', text: 'Order a mandi for two and share it at the table.', text_ar: 'اطلب مندي لشخصين وشاركوه على الطاولة.' },
    { title: 'Join our loyalty card', title_ar: 'سجّل في بطاقة الولاء', text: 'Every AED 10 you spend = 1 point.', text_ar: 'كل 10 دراهم = نقطة، واستخدم نقاطك في حسابك.' },
  ],
  loyalty: { enabled: true, egpPerPoint: 10, pointsPerRedeem: 100, redeemValue: 25 },
};
module.exports = { categories, items, settings };
