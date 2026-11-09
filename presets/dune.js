// Showroom for the UAE: "Dune Coffee House" (دون كوفي هاوس), a specialty café. AED prices at typical Dubai / Abu Dhabi café levels.
// Arabic is Gulf wording (settings.dialect = 'gulf') and only English + Arabic are offered (settings.langs). Used by /p/dune.
const F = require('../features');
const IMG = '/demo/dune/';
const { pick } = require('./photos');
const PHOTO = [
  [/^Saffron Karak|^Karak/, 'karak'], [/^Saffron/, 'saffronlatte'], [/^Date Latte/, 'datelatte'], [/^Pistachio Latte|^Iced Pistachio/, 'pistachiolatte'], [/^Rose/, 'roselatte'], [/^Dubai Chocolate/, 'dubailatte'],
  [/^Spanish Latte/, 'latte'], [/^Iced (Latte|Spanish)/, 'icedlatte'], [/^Iced Americano|^Iced Mocha/, 'icedcoffee'], [/^Iced Matcha/, 'matcha'], [/^Cold Brew/, 'coldbrew'], [/^Caramel Frappe/, 'frappe'], [/^Affogato/, 'affogato'],
  [/^Hibiscus/, 'hibiscus'], [/^Iced Peach/, 'icedtea'],
  [/^Espresso|^Double Espresso/, 'espresso'], [/^Americano/, 'americano'], [/^Cappuccino/, 'cappuccino'], [/^Latte/, 'latte'], [/^Flat White/, 'flatwhite'], [/^Cortado|^Macchiato/, 'macchiato'], [/^Mocha/, 'mocha'],
  [/^Arabic Coffee/, 'arabiccoffee'], [/^Turkish/, 'turkish'], [/^V60/, 'pourover'], [/^Hot Chocolate/, 'hotchoc'],
  [/^Masala/, 'masalachai'], [/^Chai Latte/, 'chailatte'], [/^Moroccan/, 'mintTea'], [/^Green Tea/, 'greentea'], [/^Earl Grey/, 'earlgrey'],
  [/^Fresh Orange/, 'orange'], [/^Watermelon/, 'watermelon'], [/^Mango/, 'mango'], [/^Lemon Mint/, 'lemonmint'], [/^Pomegranate/, 'pomegranate'], [/^Carrot/, 'carrotjuice'], [/^Strawberry Lemonade/, 'strawlemonade'], [/^Mojito/, 'mojito'],
  [/^Still Water|^Water/, 'water'], [/^Sparkling/, 'sparkling'],
  [/^Avocado Toast/, 'avotoast'], [/^Shakshuka/, 'shakshuka'], [/^Zaatar/, 'manousheh'], [/^Pancakes/, 'pancakes'], [/^French Toast/, 'frenchtoast'], [/^Granola/, 'granola'],
  [/^Chicken Pesto/, 'panini'], [/^Halloumi/, 'halloumi'], [/^Club/, 'club'], [/^Tuna/, 'tuna'], [/^Caesar/, 'caesar'], [/^Quinoa/, 'quinoa'],
  [/^Butter Croissant/, 'croissant'], [/^Pistachio Croissant/, 'pistachiocroissant'], [/^Almond Croissant/, 'almondcroissant'], [/^Cinnamon Roll/, 'cinnroll'], [/^Cookie/, 'cookie'], [/^Brownie/, 'brownie'],
  [/^Lotus Cheesecake/, 'cheesecake'], [/^Basque/, 'basque'], [/^Luqaimat/, 'luqaimat'], [/^Umm Ali/, 'ummali'], [/^Tiramisu/, 'tiramisu'], [/^Sticky Date/, 'datecake'],
];

const categories = [
  { id: 'c1', name: 'Signature Lattes', name_ar: 'لاتيهات خاصة', emoji: '✨', station: 'bar' },
  { id: 'c2', name: 'Hot Coffee', name_ar: 'قهوة ساخنة', emoji: '☕', station: 'bar' },
  { id: 'c3', name: 'Iced & Cold', name_ar: 'مشروبات باردة', emoji: '🧊', station: 'bar' },
  { id: 'c4', name: 'Tea & Karak', name_ar: 'شاي وكرك', emoji: '🫖', station: 'bar' },
  { id: 'c5', name: 'Fresh Juices', name_ar: 'عصائر طازجة', emoji: '🍊', station: 'bar' },
  { id: 'c6', name: 'All-Day Breakfast', name_ar: 'فطور طوال اليوم', emoji: '🍳', station: 'kitchen' },
  { id: 'c7', name: 'Sandwiches & Salads', name_ar: 'ساندويتشات وسلطات', emoji: '🥪', station: 'kitchen' },
  { id: 'c8', name: 'Bakery & Desserts', name_ar: 'مخبوزات وحلويات', emoji: '🥐', station: 'kitchen' },
];

// ---- option groups ----
const ch = (list) => list.map((c, i) => { const [name, price = 0, name_ar] = Array.isArray(c) ? c : [c]; return { id: 'c' + i, name, ...(name_ar ? { name_ar } : {}), price }; });
const one = (id, name, name_ar, list, required, defIdx) => ({ id, name, name_ar, type: 'one', required: !!required, choices: ch(list).map((c, i) => (i === defIdx ? { ...c, def: true } : c)) });
const many = (id, name, name_ar, list, max) => ({ id, name, name_ar, type: 'many', max: max || 3, choices: ch(list) });
const size = one('size', 'Size', 'الحجم', [['Regular', 0, 'عادي'], ['Large', 4, 'كبير']], true, 0);
const milk = one('milk', 'Type of milk', 'نوع الحليب', [['Whole milk', 0, 'حليب كامل الدسم'], ['Skimmed milk', 0, 'حليب خالي الدسم'], ['Oat milk', 5, 'حليب الشوفان'], ['Almond milk', 5, 'حليب اللوز'], ['Camel milk', 8, 'حليب الإبل']], true, 0);
const extras = many('extra', 'Extras', 'إضافات', [['Extra espresso shot', 5, 'شوت إسبريسو إضافي'], ['Vanilla syrup', 3, 'شراب الفانيلا'], ['Caramel syrup', 3, 'شراب الكراميل'], ['Date syrup', 4, 'دبس التمر'], ['Whipped cream', 4, 'كريمة مخفوقة']], 3);
const sweet = one('sweet', 'Sweetness', 'درجة السكر', [['Normal sugar', 0, 'سكر عادي'], ['Less sugar', 0, 'سكر خفيف'], ['No sugar', 0, 'بدون سكر']], true, 0);
const hotMilk = [size, milk, extras];
const coldMilk = [size, milk, extras];
const addEgg = many('add', 'Add', 'إضافات', [['Fried egg', 6, 'بيض مقلي'], ['Smoked salmon', 18, 'سلمون مدخن'], ['Halloumi', 10, 'جبنة حلوم'], ['Avocado', 8, 'أفوكادو']], 3);
const side = one('side', 'Side', 'الطبق الجانبي', [['Fries', 0, 'بطاطس مقلية'], ['Side salad', 0, 'سلطة جانبية'], ['Sweet potato fries', 5, 'بطاطا حلوة مقلية']], true, 0);
const bread = one('bread', 'Bread', 'الخبز', [['Sourdough', 0, 'خبز العجين المخمّر'], ['Whole wheat', 0, 'خبز القمح الكامل'], ['Gluten-free', 6, 'خالي من الغلوتين']], true, 0);
const bakeAdd = many('add', 'Add', 'إضافات', [['Scoop of ice cream', 8, 'سكوب آيس كريم'], ['Date syrup', 4, 'دبس التمر'], ['Pistachio crumble', 6, 'فتات الفستق']], 2);

// [cat, name, name_ar, price, emoji, prep (min), featured, options]
const R = [
  ['c1', 'Saffron Latte', 'لاتيه زعفران', 32, '🌼', 4, 1, hotMilk], ['c1', 'Date Latte', 'لاتيه تمر', 30, '🌴', 4, 1, hotMilk], ['c1', 'Pistachio Latte', 'لاتيه فستق', 34, '🥜', 4, 1, hotMilk],
  ['c1', 'Rose Cardamom Latte', 'لاتيه ورد وهيل', 32, '🌹', 4, 0, hotMilk], ['c1', 'Spanish Latte', 'سبانش لاتيه', 28, '☕', 4, 0, hotMilk], ['c1', 'Dubai Chocolate Latte', 'لاتيه شوكولاتة دبي', 36, '🍫', 5, 1, hotMilk],
  ['c1', 'Karak Latte', 'كرك لاتيه', 26, '🫖', 4, 0, [size, milk, sweet]],
  ['c2', 'Espresso', 'إسبريسو', 14, '☕', 2, 0, [one('shots', 'Shots', 'الشوتات', [['Single', 0, 'سنجل'], ['Double', 3, 'دبل']], true, 0)]], ['c2', 'Americano', 'أمريكانو', 20, '☕', 3, 0, [size, extras]],
  ['c2', 'Cappuccino', 'كابتشينو', 24, '☕', 4, 0, hotMilk], ['c2', 'Latte', 'لاتيه', 25, '☕', 4, 0, hotMilk], ['c2', 'Flat White', 'فلات وايت', 25, '☕', 4, 1, hotMilk], ['c2', 'Cortado', 'كورتادو', 23, '☕', 3, 0, [milk]],
  ['c2', 'Mocha', 'موكا', 28, '🍫', 4, 0, hotMilk], ['c2', 'Macchiato', 'ماكياتو', 18, '☕', 3, 0, []], ['c2', 'Arabic Coffee (Gahwa)', 'قهوة عربية', 18, '🫖', 3, 1, [one('cup', 'Serving', 'التقديم', [['Cup with dates', 0, 'فنجان مع تمر'], ['Dallah for two', 24, 'دلة لشخصين']], true, 0)]],
  ['c2', 'Turkish Coffee', 'قهوة تركية', 20, '☕', 5, 0, [sweet]], ['c2', 'V60 Filter Coffee', 'قهوة فلتر في 60', 30, '☕', 6, 0, [one('beans', 'Beans', 'نوع البن', [['Ethiopia Yirgacheffe', 0, 'إثيوبيا يرغاشيف'], ['Colombia Huila', 0, 'كولومبيا هويلا'], ['Brazil Santos', 0, 'البرازيل سانتوس']], true, 0)]],
  ['c2', 'Hot Chocolate', 'هوت شوكليت', 26, '🍫', 4, 0, [size, one('choc', 'Chocolate', 'الشوكولاتة', [['Dark', 0, 'داكنة'], ['Milk', 0, 'بالحليب'], ['White', 0, 'بيضاء']], true, 1), addMarsh()]],
  ['c3', 'Iced Latte', 'آيس لاتيه', 26, '🧊', 3, 0, coldMilk], ['c3', 'Iced Americano', 'آيس أمريكانو', 21, '🧊', 3, 0, [size, extras]], ['c3', 'Iced Spanish Latte', 'آيس سبانش لاتيه', 29, '🧊', 3, 1, coldMilk],
  ['c3', 'Iced Matcha Latte', 'آيس ماتشا لاتيه', 30, '🍵', 4, 1, coldMilk], ['c3', 'Iced Mocha', 'آيس موكا', 29, '🧊', 3, 0, coldMilk], ['c3', 'Cold Brew', 'كولد برو', 27, '🧊', 2, 0, [size]],
  ['c3', 'Iced Pistachio Latte', 'آيس لاتيه فستق', 35, '🥜', 4, 0, coldMilk], ['c3', 'Caramel Frappe', 'فرابيه كراميل', 30, '🥤', 5, 0, [size, extras]], ['c3', 'Affogato', 'أفوغاتو', 28, '🍨', 3, 0, []],
  ['c3', 'Hibiscus Iced Tea', 'شاي الكركديه المثلج', 22, '🌺', 3, 0, [size]],
  ['c4', 'Karak Chai', 'شاي كرك', 10, '🫖', 3, 1, [size, sweet]], ['c4', 'Saffron Karak', 'كرك زعفران', 16, '🌼', 3, 1, [size, sweet]], ['c4', 'Masala Chai', 'شاي مسالا', 20, '🫖', 4, 0, [size, sweet]],
  ['c4', 'Chai Latte', 'تشاي لاتيه', 24, '🫖', 4, 0, hotMilk], ['c4', 'Moroccan Mint Tea', 'شاي مغربي بالنعناع', 22, '🌿', 4, 0, [one('serv', 'Serving', 'التقديم', [['Glass', 0, 'كأس'], ['Pot for two', 12, 'إبريق لشخصين']], true, 0)]],
  ['c4', 'Green Tea', 'شاي أخضر', 18, '🍵', 3, 0, []], ['c4', 'Earl Grey', 'إيرل غراي', 18, '🫖', 3, 0, []],
  ['c5', 'Fresh Orange Juice', 'عصير برتقال طازج', 24, '🍊', 3, 0, [size]], ['c5', 'Watermelon Juice', 'عصير بطيخ', 22, '🍉', 3, 0, [size]], ['c5', 'Mango Juice', 'عصير مانجو', 26, '🥭', 3, 1, [size]],
  ['c5', 'Lemon Mint', 'ليمون بالنعناع', 22, '🍋', 3, 0, [size]], ['c5', 'Pomegranate Juice', 'عصير رمان', 28, '🍎', 3, 0, [size]], ['c5', 'Carrot & Orange', 'جزر وبرتقال', 24, '🥕', 3, 0, [size]],
  ['c5', 'Strawberry Lemonade', 'ليموناضة الفراولة', 26, '🍓', 3, 0, [size]], ['c5', 'Mojito (no alcohol)', 'موهيتو (بدون كحول)', 26, '🍹', 3, 0, [size]], ['c5', 'Still Water', 'ماي', 6, '💧', 1, 0, []], ['c5', 'Sparkling Water', 'ماي غازي', 14, '💧', 1, 0, []],
  ['c6', 'Avocado Toast', 'توست أفوكادو', 42, '🥑', 10, 1, [bread, addEgg]], ['c6', 'Shakshuka', 'شكشوكة', 46, '🍳', 12, 1, [one('spice', 'Spice level', 'درجة الحرارة', [['Mild', 0, 'خفيفة'], ['Medium', 0, 'وسط'], ['Hot', 0, 'حارة']], true, 1), many('add', 'Add', 'إضافات', [['Halloumi', 10, 'جبنة حلوم'], ['Beef sausage', 12, 'نقانق لحم'], ['Extra bread', 4, 'خبز زيادة']], 3)]],
  ['c6', 'Zaatar & Cheese Manousheh', 'مناقيش زعتر وجبنة', 28, '🫓', 8, 0, []], ['c6', 'Pancakes with Berries', 'بان كيك التوت', 44, '🥞', 10, 0, [one('top', 'Topping', 'الإضافة', [['Maple syrup', 0, 'شراب القيقب'], ['Date syrup', 0, 'دبس التمر'], ['Nutella', 4, 'نوتيلا']], true, 0)]],
  ['c6', 'French Toast', 'فرنش توست', 42, '🍞', 10, 0, []], ['c6', 'Granola Yogurt Bowl', 'جرانولا بالزبادي', 34, '🥣', 5, 0, [many('fruit', 'Extra fruit', 'فواكه إضافية', [['Banana', 4, 'موز'], ['Strawberry', 5, 'فراولة'], ['Honey', 3, 'عسل']], 3)]],
  ['c7', 'Chicken Pesto Panini', 'بانيني دجاج بيستو', 42, '🥪', 9, 1, [side]], ['c7', 'Halloumi & Tomato Sandwich', 'ساندويتش حلوم وطماطم', 38, '🥪', 8, 0, [side]], ['c7', 'Club Sandwich', 'كلوب ساندويتش', 48, '🥪', 10, 0, [side]],
  ['c7', 'Tuna Melt', 'تونة ميلت', 40, '🥪', 9, 0, [side]], ['c7', 'Caesar Salad', 'سلطة سيزر', 44, '🥗', 7, 0, [many('add', 'Add', 'إضافات', [['Grilled chicken', 12, 'دجاج مشوي'], ['Shrimp', 18, 'روبيان']], 1)]], ['c7', 'Quinoa Salad', 'سلطة كينوا', 46, '🥗', 6, 0, []],
  ['c8', 'Butter Croissant', 'كرواسون بالزبدة', 16, '🥐', 2, 0, []], ['c8', 'Pistachio Croissant', 'كرواسون الفستق', 24, '🥐', 2, 1, []], ['c8', 'Almond Croissant', 'كرواسون اللوز', 20, '🥐', 2, 0, []], ['c8', 'Cinnamon Roll', 'سينابون', 20, '🍥', 3, 0, []],
  ['c8', 'Cookie', 'كوكيز', 14, '🍪', 2, 0, [one('fl', 'Flavor', 'النكهة', [['Chocolate chip', 0, 'رقائق الشوكولاتة'], ['Double chocolate', 0, 'شوكولاتة مضاعفة'], ['Pistachio', 2, 'فستق']], true, 0)]], ['c8', 'Brownie', 'براوني', 22, '🍫', 3, 0, [bakeAdd]],
  ['c8', 'Lotus Cheesecake', 'تشيز كيك لوتس', 32, '🍰', 2, 0, []], ['c8', 'Basque Cheesecake', 'باسك تشيز كيك', 34, '🍰', 2, 1, []], ['c8', 'Luqaimat', 'لقيمات', 28, '🧆', 8, 1, [many('top', 'Topping', 'الإضافة', [['Date syrup', 0, 'دبس التمر'], ['Chocolate sauce', 3, 'صوص الشوكولاتة'], ['Sesame', 0, 'سمسم']], 2)]],
  ['c8', 'Umm Ali', 'أم علي', 30, '🥣', 6, 0, []], ['c8', 'Tiramisu', 'تيراميسو', 34, '🍰', 2, 0, []], ['c8', 'Sticky Date Cake', 'كيكة التمر بصوص التوفي', 32, '🍰', 4, 0, [bakeAdd]],
];
function addMarsh() { return many('add', 'Additions', 'إضافات', [['Whipped cream', 4, 'كريمة مخفوقة'], ['Marshmallow', 3, 'مارشميلو']], 2); }

const items = R.map((r, i) => ({
  id: 'i' + (i + 1), cat: r[0], name: r[1], name_ar: r[2], price: r[3], cost: Math.round(r[3] * 0.28), emoji: r[4], desc: '', prep: r[5], featured: !!r[6],
  img: pick(PHOTO, r[1], ''),
  ...(r[7].length ? { options: r[7] } : {}),
}));

const settings = {
  name: 'Dune Coffee House', name_ar: 'دون كوفي هاوس', tagline: 'Specialty coffee with a Gulf soul', tagline_ar: 'قهوة مختصة بروح خليجية',
  tagline_sub: 'Scan, order from your table and follow your order live.', tagline_sub_ar: 'امسح الرمز واطلب من مكانك وتابع طلبك مباشرة.',
  logo: IMG + 'logo.svg', theme: 'custom', palette: { accent: '#a2602a', accent2: '#d9b26f', bg: '#f8f0e3', card: '#ffffff', text: '#2c1d12' },
  demoBrand: { g: '#5c3720', bg: '#f6ecdc', text: '#2c1d12', muted: '#7d6552', line: '#e6d6bd' },
  currency: 'AED', tax: 5, service: 0, lang: 'en', langs: ['ar', 'en'], dialect: 'gulf',
  menuLayout: 'cards', heroImg: '', kitchenStations: 2, wifi: 'Dune_Guest', wifiPass: 'welcome2026', requireKey: false,
  online: F.onlineCfg({ online: { enabled: true, pickup: true, delivery: true } }),
  promos: [
    { title: 'Try our Saffron Latte', title_ar: 'جرّب لاتيه الزعفران', text: 'Our signature drink, made with premium saffron.', text_ar: 'مشروبنا المميز بزعفران فاخر.' },
    { title: 'Join our loyalty card', title_ar: 'سجّل في بطاقة الولاء', text: 'Every AED 10 you spend = 1 point.', text_ar: 'كل 10 دراهم = نقطة، واستخدم نقاطك في حسابك.' },
  ],
  loyalty: { enabled: true, egpPerPoint: 10, pointsPerRedeem: 100, redeemValue: 25 },
};
module.exports = { categories, items, settings };
