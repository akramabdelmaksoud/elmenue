// Branded showroom for FRÍO (cozy, modern, wood-and-white café). Menu, prices and option groups come from the café's own menu PDF.
// Sizes, milk, flavours and add-ons are real item options (the "options" feature), so the owner sees how customers customise a drink.
const F = require('../features');
const IMG = '/demo/frio/';

const categories = [
  { id: 'c1', name: 'Hot Drinks', name_ar: 'مشروبات ساخنة', emoji: '☕', station: 'bar' },
  { id: 'c2', name: 'Classic Coffee', name_ar: 'قهوة كلاسيك', emoji: '🫖', station: 'bar' },
  { id: 'c3', name: 'Cold & Iced', name_ar: 'مشروبات باردة', emoji: '🧊', station: 'bar' },
  { id: 'c4', name: 'Bakery', name_ar: 'مخبوزات', emoji: '🥐', station: 'kitchen' },
  { id: 'c5', name: 'Fresh Salad', name_ar: 'سلطات', emoji: '🥗', station: 'kitchen' },
  { id: 'c6', name: 'Sandwich', name_ar: 'ساندوتشات', emoji: '🥖', station: 'kitchen' },
];

// ---- option groups ----
const ch = (list) => list.map((c, i) => { const [name, price = 0, name_ar] = Array.isArray(c) ? c : [c]; return { id: 'c' + i, name, ...(name_ar ? { name_ar } : {}), price }; });
const one = (id, name, name_ar, list, required, defIdx) => ({ id, name, name_ar, type: 'one', required: !!required, choices: ch(list).map((c, i) => (i === defIdx ? { ...c, def: true } : c)) });
const many = (id, name, name_ar, list, max) => ({ id, name, name_ar, type: 'many', max: max || 3, choices: ch(list) });
const size2 = (s, d) => one('size', 'Size', 'الحجم', [['Single', 0, 'سنجل'], ['Double', d - s, 'دبل']], true, 0);
const sizeML = (m, l) => one('size', 'Size', 'الحجم', [['Medium', 0, 'وسط'], ['Large', l - m, 'كبير']], true, 0);
const milk = one('milk', 'Type of milk', 'نوع اللبن', [['Whole milk', 0, 'لبن كامل الدسم'], ['Skimmed milk', 0, 'لبن خالي الدسم'], ['Almond milk', 15, 'لبن لوز'], ['Coconut milk', 0, 'لبن جوز الهند'], ['Oat milk', 0, 'لبن شوفان']], false, 0);
const syrupHot = many('flavor', 'Flavor', 'النكهة', [['Caramel', 10, 'كراميل'], ['Vanilla', 10, 'فانيليا'], ['Hazelnut', 10, 'بندق'], ['Irish', 10, 'أيرش'], ['Cinnamon', 10, 'قرفة']], 1);
const syrupCold = many('flavor', 'Flavor', 'النكهة', [['Caramel', 10, 'كراميل'], ['Vanilla', 10, 'فانيليا'], ['Hazelnut', 10, 'بندق'], ['Irish', 10, 'أيرش'], ['Cinnamon', 10, 'قرفة'], ['Honey', 10, 'عسل']], 1);
const addHot = many('add', 'Additions', 'إضافات', [['Whipped cream', 8, 'كريمة مخفوقة'], ['Marshmallow', 5, 'مارشميلو']], 2);
const addCold = many('add', 'Additions', 'إضافات', [['Whipped cream', 8, 'كريمة مخفوقة'], ['Espresso shot', 15, 'شوت إسبريسو'], ['Cookies', 10, 'كوكيز']], 3);
const addBake = many('add', 'Additions', 'إضافات', [['Nutella', 5, 'نوتيلا'], ['Caramel', 5, 'كراميل'], ['Chocolate', 5, 'شوكولاتة']], 2);
const hotMilk = (size) => [...(size ? [size] : []), milk, syrupHot, addHot];
const coldMilk = [milk, syrupCold, addCold];
const flavors = (name, list, required = true) => one('fl', name, 'النكهة', list.map((n) => [n]), required, 0);

const SMOOTHIE = ['Kiwi', 'Kiwi peach', 'Kiwi lemon', 'Kiwi mango', 'Blueberry', 'Raspberry', 'Peach', 'Green apple', 'Strawberry', 'Passion fruit', 'Hacienda', 'Pineapple', 'Mango', 'Mango peach', 'Tangy tango', 'Mix blueberry raspberry', 'Orange and tangerine'];
const SUNSHINE = ['Mint lemon', 'Watermelon', 'Peach', 'Passion fruit', 'Blueberry', 'Strawberry', 'Blue curacao', 'Passion fruit lemon', 'Cherry', 'Green apple', 'Green apple lemon', 'Pineapple', 'Blue passion', 'Kiwi peach', 'Tangerine', 'Red soda', 'Tangerine lemon', 'Blue pineapple'];
const RB_MIX = ['Blueberry', 'Watermelon', 'Passion fruit', 'Peach', 'Blue curaçao', 'Cherry', 'Mint & blue curaçao', 'Pineapple', 'Kiwi', 'Pomegranate', 'Lemon', 'Apple', 'Kiwi peach', 'Pomegranate lemon', 'Blueberry lemon', 'Apple lemon', 'Passion fruit lemon', 'Dark', 'Mango & peach', 'Cherry lemon', 'Watermelon lemon', 'Pineapple lemon', 'Blue passion', 'Red soda', 'Tangerine lemon', 'Blue pineapple'];
const SHAKE = [['Vanilla', 5], ['Dark chocolate', 5], ['Caramel', 5], ['Blueberry', 5], ['Raspberry', 5], ['Popcorn', 5], ['Kiwi', 0], ['Mango', 5], ['Peach', 5], ['Passion fruit', 5], ['Strawberries', 5], ['Coconut', 5], ['Vanilla caramel', 5], ['Red mystery', 15], ['Biscuits', 10], ['Biscuits blueberry', 10], ['Biscuits strawberry', 10]];

// [cat, name, name_ar, price, emoji, prep minutes, featured, options[]]
const R = [
  ['c1', 'Espresso', 'إسبريسو', 20, '☕', 3, 0, [size2(20, 25)]],
  ['c1', 'Macchiato', 'ميكاتو', 25, '☕', 3, 0, [size2(25, 30)]],
  ['c1', 'Latte', 'لاتيه', 25, '☕', 4, 1, hotMilk(sizeML(25, 35))],
  ['c1', 'Spanish Latte', 'سبانيش لاتيه', 30, '☕', 4, 1, hotMilk(size2(30, 40))],
  ['c1', 'Cappuccino', 'كابتشينو', 30, '☕', 4, 1, hotMilk(size2(30, 40))],
  ['c1', 'Flat White', 'فلات وايت', 25, '☕', 4, 0, hotMilk()],
  ['c1', 'Mocha', 'موكا', 30, '☕', 4, 0, hotMilk(size2(30, 40))],
  ['c1', 'Cortado', 'كورتادو', 25, '☕', 3, 0, hotMilk()],
  ['c1', 'Americano', 'أمريكانو', 20, '☕', 3, 0, [size2(20, 30), one('mk', 'Black or milk', 'سادة أو بلبن', [['Black', 0, 'سادة'], ['With milk', 0, 'بلبن']], true, 0)]],
  ['c1', 'Caramel Macchiato', 'كراميل ميكاتو', 30, '☕', 4, 0, hotMilk(size2(30, 40))],
  ['c1', 'Matcha (Green Tea Latte)', 'ماتشا لاتيه', 30, '🍵', 5, 1, hotMilk(size2(30, 40))],
  ['c1', 'Hot Chocolate', 'هوت شوكلت', 30, '🍫', 4, 0, hotMilk(size2(30, 35))],
  ['c1', 'Hot Cider', 'هوت سيدر', 25, '🍎', 4, 0, [size2(25, 30)]],
  ['c1', 'Tea', 'شاي', 10, '🫖', 3, 0, [one('tea', 'Tea type', 'نوع الشاي', [['Classic', 0, 'كلاسيك'], ['Latte', 10, 'لاتيه'], ['Lemon', 5, 'ليمون'], ['Mango', 2, 'مانجو'], ['Strawberry', 2, 'فراولة'], ['Green', 2, 'أخضر']], true, 0)]],
  ['c1', 'Cinnamon Milk', 'لبن بالقرفة', 20, '🥛', 4, 0, [size2(20, 30)]],
  ['c2', 'Turkish Coffee', 'قهوة تركي', 20, '☕', 5, 1, [size2(20, 25)]],
  ['c2', 'French Coffee', 'قهوة فرنساوي', 25, '☕', 5, 0, [size2(25, 30), flavors('Flavor', ['French', 'Hazelnut', 'Caramel'])]],
  ['c2', 'Nutella French Coffee', 'قهوة فرنساوي نوتيلا', 30, '☕', 5, 0, [size2(30, 35)]],
  ['c3', 'Iced Latte', 'آيس لاتيه', 35, '🧊', 4, 1, coldMilk],
  ['c3', 'Iced Mocha', 'آيس موكا', 40, '🧊', 4, 0, [one('mk', 'Caramel or chocolate', 'كراميل أو شوكولاتة', [['Caramel', 0, 'كراميل'], ['Chocolate', 0, 'شوكولاتة']], true, 0), ...coldMilk]],
  ['c3', 'Frappuccino', 'فرابتشينو', 40, '🥤', 5, 1, [flavors('Flavor', ['Vanilla', 'Mocha', 'Caramel', 'Hazelnut', 'Classic']), ...coldMilk]],
  ['c3', 'Ice Caramel Macchiato', 'آيس كراميل ميكاتو', 40, '🧊', 4, 0, coldMilk],
  ['c3', 'Iced Chocolate', 'آيس شوكلت', 35, '🧊', 4, 0, coldMilk],
  ['c3', 'Oreo', 'أوريو', 40, '🍪', 5, 0, coldMilk],
  ['c3', 'Milkshake', 'ميلك شيك', 35, '🥛', 5, 1, [one('fl', 'Flavor', 'النكهة', SHAKE, true, 0), ...coldMilk]],
  ['c3', 'Smoothie', 'سموذي', 35, '🥤', 5, 0, [flavors('Flavor', SMOOTHIE)]],
  ['c3', 'Sunshine', 'صن شاين', 30, '🍹', 4, 0, [flavors('Flavor', SUNSHINE)]],
  ['c3', 'Cherry Cola', 'شيري كولا', 25, '🍒', 3, 0, []],
  ['c3', 'Espresso Red Bull', 'إسبريسو ريدبول', 45, '⚡', 4, 0, []],
  ['c3', 'Red Bull', 'ريدبول', 35, '⚡', 1, 0, []],
  ['c3', 'Red Bull White', 'ريدبول وايت', 35, '⚡', 1, 0, []],
  ['c3', 'Red Bull White Mixes', 'ريدبول وايت ميكس', 40, '⚡', 3, 0, [flavors('Flavor', ['Blueberry', 'Watermelon', 'Passion fruit', 'Blue curaçao'])]],
  ['c3', 'Red Bull Sugar Free', 'ريدبول شوجر فري', 35, '⚡', 1, 0, []],
  ['c3', 'Red Bull Mixes', 'ريدبول ميكس', 40, '⚡', 3, 0, [flavors('Flavor', RB_MIX)]],
  ['c3', 'Iced Matcha (Green Tea Latte)', 'آيس ماتشا لاتيه', 40, '🍵', 5, 0, coldMilk],
  ['c3', 'Iced Tea', 'آيس تي', 30, '🧊', 3, 0, [flavors('Flavor', ['Classic', 'Passion fruit', 'Mango', 'Blueberry', 'Strawberry', 'Green apple'])]],
  ['c3', 'Water', 'مياه', 5, '💧', 1, 0, []],
  ['c4', 'Cookies', 'كوكيز', 15, '🍪', 2, 1, [one('fl', 'Flavor', 'النكهة', [['Vanilla chocolate chip'], ['Dark chocolate'], ['Oats'], ['Red velvet'], ['American cookie', 10], ['Lotus']], true, 0), addBake]],
  ['c4', 'Croissant', 'كرواسون', 15, '🥐', 3, 1, [one('fl', 'Filling', 'الحشو', [['Cheese'], ['Pastrami'], ['Chocolate'], ['Salmy', 15], ['Smoke beef', 15], ['Smoke Turkish', 15]], true, 0), addBake]],
  ['c4', 'Granola Greek Yogurt', 'جرانولا زبادي يوناني', 35, '🥣', 3, 0, [many('fruit', 'Extra fruit', 'فاكهة إضافية', [['Kiwi', 5], ['Strawberry', 5], ['Granola bar', 20], ['Banana', 5], ['Plum', 5]], 3)]],
  // salads and sandwiches have no printed price on the source menu: sample prices for the demo (change them in Menu)
  ['c5', 'Pasta Salad', 'سلطة باستا', 75, '🥗', 6, 0, []], ['c5', 'Chicken Salad', 'سلطة فراخ', 85, '🥗', 6, 0, []], ['c5', 'Caesar Salad', 'سلطة سيزر', 85, '🥗', 6, 0, []],
  ['c5', 'Greek Salad', 'سلطة يونانية', 75, '🥗', 5, 0, []], ['c5', 'Avocado Salad', 'سلطة أفوكادو', 90, '🥑', 6, 0, []],
  ['c6', 'Smoked Turkey Baguette', 'باجيت تركي مدخن', 85, '🥖', 6, 0, []], ['c6', 'Smoked Beef Baguette', 'باجيت لحم مدخن', 95, '🥖', 6, 1, []],
  ['c6', 'Salami Baguette', 'باجيت سلامي', 75, '🥖', 6, 0, []], ['c6', 'Pastrami Baguette', 'باجيت بسطرمة', 85, '🥖', 6, 0, []],
];

const items = R.map((r, i) => ({
  id: 'i' + (i + 1), cat: r[0], name: r[1], name_ar: r[2], price: r[3], cost: Math.round(r[3] * 0.3), emoji: r[4], desc: '', prep: r[5], featured: !!r[6],
  ...(r[7].length ? { options: r[7] } : {}),
}));

const settings = {
  name: 'FRÍO', name_ar: 'فريو', tagline: 'Specialty coffee, baked fresh', tagline_ar: 'قهوة مختصة ومخبوزات طازجة',
  tagline_sub: 'Scan, customise your drink and watch your order live.', tagline_sub_ar: 'امسح الكود، اظبط مشروبك زي ما تحب وتابع طلبك لحظة بلحظة.',
  logo: IMG + 'logo.svg', theme: 'custom', palette: { accent: '#a8703f', accent2: '#d2b48c', bg: '#faf6ef', card: '#ffffff', text: '#2a1f17' },
  demoBrand: { g: '#4a3123', bg: '#f6efe4', text: '#2a1f17', muted: '#7a6655', line: '#e5d8c6' },
  menuLayout: 'cards', heroImg: '', kitchenStations: 2, tax: 0, service: 0, wifi: 'Frio_Guest', wifiPass: 'welcome2026', requireKey: false,
  online: F.onlineCfg({ online: { enabled: true, pickup: true, delivery: true } }),
  promos: [
    { title: 'Fresh from the oven', title_ar: 'طازج من الفرن', text: 'Croissants and cookies baked every morning.', text_ar: 'كرواسون وكوكيز بتتخبز كل يوم الصبح.' },
    { title: 'Join our loyalty card', title_ar: 'اعمل كارت الولاء', text: 'Every 10 EGP you spend = 1 point.', text_ar: 'كل 10 جنيه = نقطة، واستخدم نقطك في الحساب.' },
  ],
};
module.exports = { categories, items, settings };
