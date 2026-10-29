// The showroom menu: a luxurious, photographed menu with real prep times.
// Used by every demo café (freshData(demo)); real customers start from the plain seed menu in data.js.
// Photos live in public/menu/<key>.jpg (Wikimedia Commons, openly licensed - see public/menu/CREDITS.md).
const seed = require('./data');

const categories = [
  { id: 'c1', name: 'Starters', name_ar: 'المقبلات', emoji: '🥂', station: 'kitchen' },
  { id: 'c2', name: 'Signature Mains', name_ar: 'الأطباق الرئيسية', emoji: '🥩', station: 'kitchen' },
  { id: 'c3', name: 'Desserts', name_ar: 'الحلويات', emoji: '🍰', station: 'kitchen' },
  { id: 'c4', name: 'Coffee & Tea', name_ar: 'القهوة والشاي', emoji: '☕', station: 'bar' },
  { id: 'c5', name: 'Fresh & Mocktails', name_ar: 'عصائر وموكتيل', emoji: '🍹', station: 'bar' },
];

// [key, cat, name, name_ar, price, cost, emoji, description, prep minutes, featured]
const raw = [
  ['burrata', 'c1', 'Burrata & Heirloom Tomato', 'بوراتا مع طماطم معتّقة', 290, 95, '🍅', 'Creamy Puglian burrata, sun-ripened tomatoes, basil oil and aged balsamic pearls.', 6, 1],
  ['carpaccio', 'c1', 'Beef Carpaccio', 'كارباتشيو لحم', 340, 120, '🥩', 'Paper-thin wagyu-grade beef, rocket, shaved parmesan, truffle dressing and capers.', 7],
  ['tartare', 'c1', 'Tuna Tartare', 'تارتار التونة', 360, 130, '🐟', 'Hand-cut yellowfin tuna, avocado, sesame and a citrus-soy dressing.', 8],
  ['calamari', 'c1', 'Golden Calamari', 'كاليماري مقرمش', 230, 70, '🦑', 'Lightly crisp Mediterranean calamari, lemon aioli and smoked paprika.', 9],
  ['soup', 'c1', 'Truffle Mushroom Velouté', 'فيلوتيه المشروم بالترفل', 190, 55, '🍄', 'Silky wild mushroom soup finished with black truffle oil and warm brioche.', 8],
  ['ribeye', 'c2', 'Prime Ribeye 300g', 'ريب آي بريميوم ٣٠٠ جم', 1150, 430, '🥩', 'Dry-aged ribeye grilled over charcoal, roasted garlic butter, thick-cut fries and seasonal greens.', 22, 1],
  ['lamb', 'c2', 'Rack of Lamb', 'ريش ضاني مشوية', 980, 380, '🍖', 'Herb-crusted lamb cutlets, rosemary jus, creamy potato purée and glazed baby carrots.', 20, 1],
  ['salmon', 'c2', 'Seared Atlantic Salmon', 'سالمون أطلنطي مشوي', 640, 230, '🍣', 'Crisp-skinned salmon, lemon beurre blanc, asparagus and saffron potatoes.', 16],
  ['burger', 'c2', 'Wagyu Burger', 'واغيو برجر', 520, 180, '🍔', 'Wagyu beef, aged cheddar, caramelised onion, brioche bun and truffle fries.', 14, 1],
  ['pasta', 'c2', 'Black Truffle Tagliatelle', 'تالياتيلي بالترفل الأسود', 460, 140, '🍝', 'Fresh egg tagliatelle, wild mushrooms, parmesan cream and shaved black truffle.', 13],
  ['mixedgrill', 'c2', 'Royal Mixed Grill', 'ميكس جريل ملكي', 780, 290, '🍢', 'Kofta, tarb and shish tawook with grilled vegetables, tahini, garlic and warm baladi bread.', 18],
  ['chicken', 'c2', 'Roasted Chicken Supreme', 'صدر دجاج سوبريم', 420, 130, '🍗', 'Free-range chicken breast, thyme jus, wild mushroom ragout and pomme purée.', 15],
  ['pizza', 'c2', 'Margherita Napoletana', 'بيتزا مارجريتا نابوليتانا', 360, 95, '🍕', 'Wood-fired 48-hour dough, San Marzano tomato, buffalo mozzarella and basil.', 11],
  ['lava', 'c3', 'Molten Chocolate Fondant', 'فوندان شوكولاتة ساخن', 220, 60, '🍫', 'Warm Valrhona chocolate heart with Madagascan vanilla gelato.', 12, 1],
  ['brulee', 'c3', 'Crème Brûlée', 'كريم بروليه', 190, 45, '🍮', 'Tahitian vanilla custard beneath a glass-thin caramel crust.', 5],
  ['tiramisu', 'c3', 'Classic Tiramisu', 'تيراميسو كلاسيك', 200, 50, '☕', 'Mascarpone cream, espresso-soaked savoiardi and a dusting of dark cocoa.', 4],
  ['kunafa', 'c3', 'Pistachio Kunafa', 'كنافة بالفستق', 210, 55, '🥮', 'Golden crisp kunafa, melted akkawi cheese, warm orange-blossom syrup and pistachio.', 10, 1],
  ['omali', 'c3', 'Om Ali', 'أم علي', 170, 40, '🥣', 'Egypt’s beloved warm pastry pudding with cream, nuts and a caramelised top.', 9],
  ['baklava', 'c3', 'Pistachio Baklava', 'بقلاوة بالفستق', 180, 50, '🥜', 'Layers of buttery filo, Aleppo pistachios and honey.', 3],
  ['cheesecake', 'c3', 'Strawberry Cheesecake', 'تشيز كيك فراولة', 195, 50, '🍓', 'Baked New York cheesecake with a glossy strawberry compote.', 3],
  ['gelato', 'c3', 'Artisan Gelato Trio', 'ثلاث مغارف جيلاتو', 150, 35, '🍨', 'Three scoops made daily: pistachio, salted caramel and Madagascan vanilla.', 3],
  ['espresso', 'c4', 'Double Espresso', 'إسبريسو دبل', 75, 14, '☕', 'A rich ristretto-style double shot with thick hazelnut crema.', 3],
  ['cappuccino', 'c4', 'Cappuccino', 'كابتشينو', 105, 22, '☕', 'Silky microfoam over a double espresso, finished with latte art.', 4],
  ['turkish', 'c4', 'Turkish Coffee', 'قهوة تركي', 80, 12, '🫖', 'Slow-brewed in a copper cezve with cardamom, served with a Turkish delight.', 5],
  ['icedlatte', 'c4', 'Iced Spanish Latte', 'آيس سبانش لاتيه', 120, 28, '🧊', 'Cold espresso, sweet condensed milk and creamy milk over ice.', 4],
  ['matcha', 'c4', 'Ceremonial Matcha Latte', 'ماتشا لاتيه', 135, 34, '🍵', 'Stone-ground Japanese matcha whisked to order with your choice of milk.', 5],
  ['orange', 'c5', 'Fresh Orange Juice', 'عصير برتقال طازج', 95, 28, '🍊', 'Squeezed to order from Egyptian Valencia oranges.', 3],
  ['mojito', 'c5', 'Virgin Mojito', 'موهيتو بدون كحول', 125, 28, '🌿', 'Muddled mint and lime with sparkling water and cane sugar.', 4],
  ['lemonade', 'c5', 'Lemon & Mint Lemonade', 'ليمون بالنعناع', 95, 18, '🍋', 'Freshly pressed lemons blended with garden mint and ice.', 3],
  ['berry', 'c5', 'Wild Berry Smoothie', 'سموذي توت بري', 140, 42, '🫐', 'Strawberries, blueberries and raspberries blended with vanilla yoghurt.', 4],
];

const items = raw.map((r, i) => ({
  id: 'i' + (i + 1), cat: r[1], name: r[2], name_ar: r[3], price: r[4], cost: r[5], emoji: r[6], desc: r[7], prep: r[8], featured: !!r[9],
  img: '/menu/' + r[0] + '.jpg',
}));

// applied on top of the seed settings for every demo café
const settings = {
  name: 'Maison Aurelia', name_ar: 'ميزون أوريليا', tagline: 'Fine dining, perfectly timed', tagline_ar: 'مطبخ راقٍ، بتوقيت مثالي',
  tagline_sub: 'Every dish is cooked to order - your estimated time is shown live.', tagline_sub_ar: 'كل طبق بيتحضّر على الطلب - وقت التجهيز المتوقع بيظهر لحظة بلحظة.',
  theme: 'onyx', menuLayout: 'hero', heroImg: '/menu/hero.jpg', kitchenStations: 3, wifi: 'Aurelia_Guest', wifiPass: 'welcome2026', requireKey: false,
  promos: [
    { title: 'Chef’s tasting for two', title_ar: 'تذوّق الشيف لشخصين', text: 'Starter, two mains and a shared dessert - ask your waiter.', text_ar: 'مقبلات + طبقين رئيسيين + حلوى للمشاركة - اسأل الويتر.' },
    { title: 'Join our loyalty card', title_ar: 'اعمل كارت الولاء', text: 'Every 10 EGP you spend = 1 point. Spend points on your bill.', text_ar: 'كل 10 جنيه = نقطة. واستخدم نقطك في الحساب.' },
  ],
};

module.exports = { categories, items, settings, raw };
