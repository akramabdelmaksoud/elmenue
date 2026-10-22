// Seed data: settings, menu, tables, history
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (a) => a[rnd(0, a.length - 1)];

const settings = {
  name: 'Elmenu Café', name_ar: 'كافيه المنيو',
  theme: 'dark', mode: 'dark', lang: 'en',
  tax: 14, service: 12, currency: 'EGP',
  palette: { accent: '#e8a64a', accent2: '#ff5d8f', bg: '#14110f', card: '#1f1b18', text: '#f4ede4' },
  presets: {
    dark: { accent: '#e8a64a', accent2: '#ff5d8f', bg: '#14110f', card: '#1f1b18', text: '#f4ede4' },
    pink: { accent: '#ff5d9e', accent2: '#b34bff', bg: '#fff0f6', card: '#ffffff', text: '#3a1428' },
    white: { accent: '#111111', accent2: '#6b7280', bg: '#fafafa', card: '#ffffff', text: '#111111' },
  },
};

const categories = [
  { id: 'c1', name: 'Hot Coffee', name_ar: 'قهوة ساخنة', emoji: '☕' },
  { id: 'c2', name: 'Cold Drinks', name_ar: 'مشروبات باردة', emoji: '🧊' },
  { id: 'c3', name: 'Breakfast', name_ar: 'فطور', emoji: '🍳' },
  { id: 'c4', name: 'Mains', name_ar: 'أطباق رئيسية', emoji: '🍔' },
  { id: 'c5', name: 'Desserts', name_ar: 'حلويات', emoji: '🍰' },
  { id: 'c6', name: 'Shisha & Extras', name_ar: 'إضافات', emoji: '✨' },
];

// [cat, name, name_ar, price, cost, emoji, desc]
const rawItems = [
  ['c1', 'Espresso', 'إسبريسو', 45, 9, '☕', 'Double shot, rich crema'],
  ['c1', 'Cappuccino', 'كابتشينو', 70, 16, '☕', 'Espresso with silky foam'],
  ['c1', 'Flat White', 'فلات وايت', 75, 18, '☕', 'Velvety microfoam'],
  ['c1', 'Turkish Coffee', 'قهوة تركي', 50, 8, '🫖', 'Cardamom, served in a cezve'],
  ['c1', 'Spanish Latte', 'سبانش لاتيه', 85, 22, '🥛', 'Sweet condensed milk latte'],
  ['c1', 'Hot Chocolate', 'هوت شوكليت', 80, 20, '🍫', 'Belgian chocolate'],
  ['c2', 'Iced Latte', 'آيس لاتيه', 80, 18, '🧋', 'Cold milk over espresso'],
  ['c2', 'Cold Brew', 'كولد برو', 85, 15, '🧊', '18-hour steeped'],
  ['c2', 'Mango Smoothie', 'سموذي مانجو', 75, 20, '🥭', 'Fresh mango, yogurt'],
  ['c2', 'Fresh Orange', 'عصير برتقال', 65, 22, '🍊', 'Squeezed to order'],
  ['c2', 'Lemon Mint', 'ليمون نعناع', 55, 10, '🍋', 'Frozen & refreshing'],
  ['c2', 'Mojito Blue', 'موهيتو أزرق', 90, 22, '🫐', 'Non-alcoholic, sparkling'],
  ['c3', 'Shakshuka', 'شكشوكة', 120, 35, '🍳', 'Eggs in spicy tomato sauce'],
  ['c3', 'Avocado Toast', 'توست أفوكادو', 140, 50, '🥑', 'Sourdough, poached egg'],
  ['c3', 'Pancakes Stack', 'بان كيك', 110, 28, '🥞', 'Maple syrup, berries'],
  ['c3', 'Croissant', 'كرواسون', 60, 15, '🥐', 'Butter, baked fresh'],
  ['c4', 'Classic Burger', 'برجر كلاسيك', 180, 65, '🍔', 'Beef patty, cheddar, fries'],
  ['c4', 'Chicken Panini', 'بانيني دجاج', 150, 48, '🥪', 'Pesto, mozzarella'],
  ['c4', 'Penne Alfredo', 'بيني ألفريدو', 160, 42, '🍝', 'Creamy parmesan sauce'],
  ['c4', 'Caesar Salad', 'سلطة سيزر', 130, 38, '🥗', 'Grilled chicken, croutons'],
  ['c4', 'Margherita Pizza', 'بيتزا مارجريتا', 170, 45, '🍕', 'Fresh basil, mozzarella'],
  ['c4', 'Loaded Fries', 'بطاطس محملة', 95, 25, '🍟', 'Cheese sauce, jalapeño'],
  ['c5', 'Cheesecake', 'تشيز كيك', 110, 30, '🍰', 'New York style'],
  ['c5', 'Tiramisu', 'تيراميسو', 120, 32, '🍮', 'Coffee-soaked ladyfingers'],
  ['c5', 'Molten Cake', 'مولتن كيك', 115, 28, '🧁', 'Warm chocolate center'],
  ['c5', 'Ice Cream Scoops', 'آيس كريم', 80, 18, '🍨', 'Three scoops'],
  ['c5', 'Om Ali', 'أم علي', 90, 20, '🥣', 'Traditional hot pudding'],
  ['c6', 'Still Water', 'مياه', 20, 4, '💧', '500ml'],
  ['c6', 'Sparkling Water', 'مياه غازية', 35, 10, '🫧', '330ml'],
  ['c6', 'Extra Shot', 'شوت إضافي', 20, 5, '➕', 'Add to any coffee'],
];
const items = rawItems.map((r, i) => ({
  id: 'i' + (i + 1), cat: r[0], name: r[1], name_ar: r[2], price: r[3], cost: r[4], emoji: r[5], desc: r[6], img: '',
}));

// Floor plan on a 12 x 8 grid
const layout = [
  [1, 1, 'round', 2], [3, 1, 'round', 2], [5, 1, 'square', 4], [8, 1, 'square', 4], [10, 1, 'round', 2],
  [1, 3, 'square', 4], [3, 3, 'square', 4], [5, 3, 'round', 2], [8, 3, 'long', 6], [10, 3, 'square', 4],
  [1, 5, 'long', 6], [4, 5, 'round', 2], [6, 5, 'round', 2], [8, 5, 'square', 4], [10, 5, 'square', 4],
  [2, 7, 'round', 2], [5, 7, 'long', 8], [9, 7, 'long', 6],
];
const tables = layout.map((l, i) => ({ id: 't' + (i + 1), number: i + 1, x: l[0], y: l[1], shape: l[2], seats: l[3] }));

function buildHistory() {
  const hist = [];
  const now = Date.now();
  const weights = { 10: 1, 11: 2, 12: 4, 13: 6, 14: 5, 15: 3, 16: 3, 17: 4, 18: 5, 19: 7, 20: 8, 21: 7, 22: 4, 23: 2 };
  const hours = Object.entries(weights).flatMap(([h, w]) => Array(w).fill(+h));
  const payments = ['cash', 'card', 'card', 'cash', 'card'];
  for (let d = 7; d >= 1; d--) {
    const day = new Date(now - d * 86400000); day.setHours(0, 0, 0, 0);
    const weekend = [5, 6].includes(day.getDay());
    tables.forEach((t) => {
      let cursor = 10 * 60;
      const n = rnd(weekend ? 4 : 3, weekend ? 8 : 6);
      for (let k = 0; k < n; k++) {
        const h = pick(hours);
        let start = Math.max(cursor, h * 60 + rnd(0, 50));
        const dur = rnd(35, 95);
        if (start + dur > 24 * 60 + 30) break;
        cursor = start + dur + rnd(5, 40);
        const guests = rnd(1, Math.min(t.seats, 5));
        const lines = [];
        const picks = rnd(Math.max(2, guests), guests * 3 + 1);
        for (let p = 0; p < picks; p++) {
          const it = pick(items);
          const ex = lines.find((l) => l.itemId === it.id);
          if (ex) ex.qty++; else lines.push({ itemId: it.id, cat: it.cat, name: it.name, qty: 1, price: it.price, cost: it.cost });
        }
        const sub = lines.reduce((s, l) => s + l.price * l.qty, 0);
        const service = +(sub * settings.service / 100).toFixed(2);
        const tax = +((sub + service) * settings.tax / 100).toFixed(2);
        const tip = Math.random() < 0.55 ? Math.round(sub * pick([0.05, 0.1, 0.1, 0.15])) : 0;
        const startedAt = day.getTime() + start * 60000;
        const closedAt = startedAt + dur * 60000;
        hist.push({
          id: 'h' + hist.length, tableId: t.id, tableNumber: t.number, startedAt,
          orderedAt: startedAt + rnd(4, 12) * 60000, checkAt: closedAt - rnd(3, 10) * 60000, closedAt,
          guests: guests, items: lines, sub, service, tax, tip, total: +(sub + service + tax + tip).toFixed(2),
          method: pick(payments), split: pick(['table', 'table', 'self', 'custom']),
        });
      }
    });
  }
  return hist;
}

module.exports = { settings, categories, items, tables, buildHistory, rnd, pick };
