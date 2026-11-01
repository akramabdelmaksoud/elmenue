// Admin: edit one item's options (size, milk, sugar, extras) and details (allergens, calories, badge). Needs admin.html's api() and App.
const ItemDlg = (() => {
  const E = (s) => App.esc(s);
  const ALG = ['gluten', 'dairy', 'nuts', 'peanuts', 'eggs', 'soy', 'fish', 'shellfish', 'sesame'], BADGES = [['', 'None'], ['new', 'New'], ['spicy', 'Spicy'], ['vegan', 'Vegan'], ['veg', 'Vegetarian'], ['chef', "Chef's pick"], ['popular', 'Popular']];
  const PRESETS = {
    size: { name: 'Size', name_ar: 'الحجم', type: 'one', required: true, choices: [{ name: 'Small', name_ar: 'صغير', price: 0 }, { name: 'Medium', name_ar: 'وسط', price: 10, def: true }, { name: 'Large', name_ar: 'كبير', price: 20 }] },
    milk: { name: 'Milk', name_ar: 'نوع اللبن', type: 'one', required: false, choices: [{ name: 'Regular milk', name_ar: 'لبن عادي', price: 0, def: true }, { name: 'Oat milk', name_ar: 'لبن الشوفان', price: 15 }, { name: 'Almond milk', name_ar: 'لبن اللوز', price: 15 }, { name: 'Lactose free', name_ar: 'خالي اللاكتوز', price: 10 }] },
    sugar: { name: 'Sugar', name_ar: 'السكر', type: 'one', required: false, choices: [{ name: 'No sugar', name_ar: 'بدون سكر', price: 0 }, { name: 'Light', name_ar: 'خفيف', price: 0 }, { name: 'Medium', name_ar: 'مظبوط', price: 0, def: true }, { name: 'Sweet', name_ar: 'زيادة', price: 0 }] },
    extras: { name: 'Extras', name_ar: 'إضافات', type: 'many', required: false, max: 3, choices: [{ name: 'Extra shot', name_ar: 'شوت إضافي', price: 15 }, { name: 'Syrup', name_ar: 'سيرب', price: 8 }, { name: 'Whipped cream', name_ar: 'كريمة', price: 8 }] },
  };
  let st = null;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function open(id) {
    const it = App.config.items.find((x) => x.id === id); if (!it) return;
    st = { id, name: it.name, opts: clone(it.options || []), allergens: (it.allergens || []).slice(), cal: it.cal || '', badge: it.badge || '' };
    const d = document.createElement('div'); d.id = 'itemdlg'; d.className = 'ov';
    d.style.cssText = 'position:fixed;inset:0;background:#000a;z-index:60;overflow:auto;padding:20px;display:grid;place-items:start center';
    d.addEventListener('mousedown', (e) => { if (e.target === d) close(); });
    document.body.appendChild(d); paint();
  }
  function close() { const e = document.getElementById('itemdlg'); if (e) e.remove(); st = null; }
  const field = (label, html) => `<label class="muted" style="font-size:12px;display:block">${label}${html}</label>`;
  function paint() {
    const d = document.getElementById('itemdlg'); if (!d) return;
    const f = App.config.features || {};
    const lockOpt = f.options === false, lockDet = f.itemdetails === false;
    d.innerHTML = `<div class="card" style="max-width:760px;width:100%"><div class="spread"><h2 style="margin:0">${E(st.name)}</h2><button class="ghost" onclick="ItemDlg.close()">✕</button></div>
    <h3 style="margin:14px 0 4px">Details</h3>${lockDet ? '<p class="muted">Item details are locked for this café.</p>' : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px"><div>${field('Calories (kcal)', `<input type="number" min="0" max="5000" value="${E(st.cal)}" oninput="ItemDlg.set('cal',this.value)">`)}</div>
      <div>${field('Badge', `<select onchange="ItemDlg.set('badge',this.value)">${BADGES.map(([v, l]) => `<option value="${v}" ${st.badge === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div></div>
    <p class="muted" style="margin:10px 0 4px;font-size:12px">Contains (guests with allergies see this)</p><div class="row" style="flex-wrap:wrap;gap:8px">${ALG.map((a) => `<label class="row" style="gap:5px"><input type="checkbox" style="width:auto" ${st.allergens.includes(a) ? 'checked' : ''} onchange="ItemDlg.alg('${a}',this.checked)"> ${a}</label>`).join('')}</div>
    <h3 style="margin:18px 0 4px">Options</h3>${lockOpt ? '<p class="muted">Item options are locked for this café.</p>' : ''}
    <p class="muted" style="margin:0 0 8px;font-size:13px">Guests choose these when they add the item. A price above 0 is added to the item's price.</p>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-bottom:10px"><span class="muted">Quick add:</span>${Object.keys(PRESETS).map((k) => `<button class="ghost" onclick="ItemDlg.preset('${k}')">+ ${PRESETS[k].name}</button>`).join('')}<button class="ghost" onclick="ItemDlg.addGroup()">+ Custom group</button></div>
    ${st.opts.map((g, gi) => `<div class="card" style="margin-bottom:10px;background:var(--card2,transparent)"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;align-items:end">
      <div>${field('Group name', `<input value="${E(g.name)}" oninput="ItemDlg.g(${gi},'name',this.value)">`)}</div><div>${field('الاسم', `<input dir="rtl" value="${E(g.name_ar || '')}" oninput="ItemDlg.g(${gi},'name_ar',this.value)">`)}</div>
      <div>${field('Pick', `<select onchange="ItemDlg.g(${gi},'type',this.value);ItemDlg.redraw()"><option value="one" ${g.type !== 'many' ? 'selected' : ''}>One</option><option value="many" ${g.type === 'many' ? 'selected' : ''}>Several</option></select>`)}</div>
      ${g.type === 'many' ? `<div>${field('Max picks', `<input type="number" min="1" max="16" value="${g.max || g.choices.length}" oninput="ItemDlg.g(${gi},'max',this.value)">`)}</div>` : ''}
      <label class="row" style="gap:5px"><input type="checkbox" style="width:auto" ${g.required ? 'checked' : ''} onchange="ItemDlg.g(${gi},'required',this.checked)"> Required</label><button class="ghost" onclick="ItemDlg.delGroup(${gi})">🗑 Group</button></div>
      ${g.choices.map((c, ci) => `<div style="display:grid;grid-template-columns:2fr 2fr 1fr auto auto;gap:6px;margin-top:6px;align-items:center"><input placeholder="Choice" value="${E(c.name)}" oninput="ItemDlg.c(${gi},${ci},'name',this.value)"><input dir="rtl" placeholder="الاسم" value="${E(c.name_ar || '')}" oninput="ItemDlg.c(${gi},${ci},'name_ar',this.value)"><input type="number" min="0" step="0.5" placeholder="+EGP" value="${c.price || 0}" oninput="ItemDlg.c(${gi},${ci},'price',this.value)">
        <label class="row" style="gap:4px" title="Selected by default"><input type="checkbox" style="width:auto" ${c.def ? 'checked' : ''} onchange="ItemDlg.def(${gi},${ci},this.checked)">default</label><button class="ghost" onclick="ItemDlg.delChoice(${gi},${ci})">✕</button></div>`).join('')}
      <button class="ghost" style="margin-top:8px" onclick="ItemDlg.addChoice(${gi})">+ Choice</button></div>`).join('') || '<p class="muted">No options yet.</p>'}
    <div class="row" style="margin-top:14px"><button class="primary" onclick="ItemDlg.save()">Save</button><span id="idmsg" class="muted"></span></div></div>`;
  }
  async function save() {
    const body = { options: st.opts, allergens: st.allergens, cal: st.cal, badge: st.badge };
    try { await api('PUT', `/api/items/${st.id}`, body); document.getElementById('idmsg').textContent = 'Saved ✓'; setTimeout(close, 500); } catch (e) { document.getElementById('idmsg').textContent = e.message || 'Could not save'; }
  }
  return {
    open, close, save, redraw: paint,
    set(k, v) { st[k] = v; },
    alg(a, on) { st.allergens = st.allergens.filter((x) => x !== a); if (on) st.allergens.push(a); },
    g(gi, k, v) { st.opts[gi][k] = k === 'max' ? Math.max(1, Math.floor(+v) || 1) : v; },
    c(gi, ci, k, v) { st.opts[gi].choices[ci][k] = k === 'price' ? Math.max(0, +v || 0) : v; },
    def(gi, ci, on) { const g = st.opts[gi]; if (g.type !== 'many' && on) g.choices.forEach((c, i) => { if (i !== ci) delete c.def; }); if (on) g.choices[ci].def = 1; else delete g.choices[ci].def; paint(); },
    preset(k) { st.opts.push(clone(PRESETS[k])); paint(); },
    addGroup() { st.opts.push({ name: '', name_ar: '', type: 'one', required: false, choices: [{ name: '', name_ar: '', price: 0 }] }); paint(); },
    delGroup(gi) { st.opts.splice(gi, 1); paint(); },
    addChoice(gi) { st.opts[gi].choices.push({ name: '', name_ar: '', price: 0 }); paint(); },
    delChoice(gi, ci) { st.opts[gi].choices.splice(ci, 1); paint(); },
  };
})();
