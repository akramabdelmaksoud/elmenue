// Item options sheet (size, milk, extras, sugar...) and item detail chips (allergens, calories, badge). Used by the guest table page and the online order page.
// Needs shared.js (App) loaded first. Nothing here trusts the browser: the server re-checks every choice and recomputes the price.
const Opts = (() => {
  const AR = () => App.lang === 'ar';
  const T = {
    en: { choose: 'Choose options', add: 'Add to order', req: 'Required', upTo: 'up to', pick: 'Please choose:', free: 'Free', cancel: 'Cancel', kcal: 'kcal', contains: 'Contains', chef: "Chef's pick", spicy: 'Spicy', vegan: 'Vegan', veg: 'Vegetarian', new: 'New', popular: 'Popular' },
    ar: { choose: 'اختر الخيارات', add: 'أضف للطلب', req: 'مطلوب', upTo: 'حتى', pick: 'من فضلك اختر:', free: 'مجاناً', cancel: 'إلغاء', kcal: 'سعرة', contains: 'يحتوي على', chef: 'اختيار الشيف', spicy: 'حار', vegan: 'نباتي', veg: 'خضري', new: 'جديد', popular: 'الأكثر طلباً' },
  };
  const AL = { en: { gluten: 'gluten', dairy: 'dairy', nuts: 'nuts', peanuts: 'peanuts', eggs: 'eggs', soy: 'soy', fish: 'fish', shellfish: 'shellfish', sesame: 'sesame' }, ar: { gluten: 'جلوتين', dairy: 'ألبان', nuts: 'مكسرات', peanuts: 'فول سوداني', eggs: 'بيض', soy: 'صويا', fish: 'سمك', shellfish: 'محار', sesame: 'سمسم' } };
  const t = (k) => (T[AR() ? 'ar' : 'en'][k] || T.en[k]);
  const E = (s) => App.esc(s);
  const nm = (o) => (AR() && o.name_ar ? o.name_ar : o.name);
  let cur = null;
  const has = (it) => !!(it && it.options && it.options.length && App.config && App.config.features && App.config.features.options);

  // small chips under an item: badge, calories, allergens
  function chips(i) {
    if (!(App.config && App.config.features && App.config.features.itemdetails)) return '';
    const out = [];
    if (i.badge && T.en[i.badge]) out.push(`<em class="tg">${E(t(i.badge))}</em>`);
    if (i.cal) out.push(`<em class="tg">🔥 ${E(i.cal)} ${E(t('kcal'))}</em>`);
    if ((i.allergens || []).length) out.push(`<em class="tg" title="${E(t('contains'))}">⚠ ${E(i.allergens.map((a) => AL[AR() ? 'ar' : 'en'][a] || a).join(', '))}</em>`);
    return out.length ? `<div class="tgs">${out.join('')}</div>` : '';
  }

  const total = () => {
    let add = 0; cur.it.options.forEach((g) => (cur.sel[g.id] || []).forEach((cid) => { const c = g.choices.find((x) => x.id === cid); if (c) add += c.price; }));
    return cur.it.price + add;
  };
  function paint() {
    const it = cur.it, el = document.getElementById('opsheet'); if (!el) return;
    const missing = it.options.find((g) => g.required && !(cur.sel[g.id] || []).length);
    el.querySelector('.ops-body').innerHTML = it.options.map((g) => {
      const many = g.type === 'many', sel = cur.sel[g.id] || [];
      return `<div class="ops-g"><div class="ops-h"><b>${E(nm(g))}</b><small>${g.required ? E(t('req')) : ''}${many && g.max < g.choices.length ? ` · ${E(t('upTo'))} ${g.max}` : ''}</small></div>
        ${g.choices.map((c) => `<label class="ops-c ${sel.includes(c.id) ? 'on' : ''}"><input type="${many ? 'checkbox' : 'radio'}" name="og_${E(g.id)}" ${sel.includes(c.id) ? 'checked' : ''} data-g="${E(g.id)}" data-c="${E(c.id)}"><span>${E(nm(c))}</span><i>${c.price ? '+' + App.money(c.price) : ''}</i></label>`).join('')}</div>`;
    }).join('');
    el.querySelector('.ops-go').disabled = !!missing; el.querySelector('.ops-go').textContent = `${t('add')} · ${App.money(total())}`;
    el.querySelector('.ops-hint').textContent = missing ? `${t('pick')} ${nm(missing)}` : '';
    el.querySelectorAll('input[data-g]').forEach((inp) => (inp.onchange = () => toggle(inp.dataset.g, inp.dataset.c)));
  }
  function toggle(gid, cid) {
    const g = cur.it.options.find((x) => x.id === gid), s = cur.sel[gid] || [];
    if (g.type === 'many') { const i = s.indexOf(cid); if (i >= 0) s.splice(i, 1); else if (s.length < g.max) s.push(cid); cur.sel[gid] = s; }
    else cur.sel[gid] = (s[0] === cid && !g.required) ? [] : [cid];
    paint();
  }
  function open(it, onAdd) {
    close(); cur = { it, onAdd, sel: {} };
    it.options.forEach((g) => { const d = g.choices.find((c) => c.def); if (d && g.type === 'one') cur.sel[g.id] = [d.id]; });
    if (!document.getElementById('opstyle')) { const s = document.createElement('style'); s.id = 'opstyle'; s.textContent = `
      #opsheet{position:fixed;inset:0;z-index:90;background:#0009;display:flex;align-items:flex-end;justify-content:center}#opsheet .ops-card{background:var(--card,#222);color:var(--text,#fff);width:100%;max-width:520px;max-height:88vh;overflow:auto;border-radius:24px 24px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));border:1px solid var(--line,#444)}
      .ops-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.ops-top b{font-size:19px}.ops-x{background:none;border:0;color:inherit;font-size:22px;cursor:pointer;padding:4px 8px}
      .ops-g{margin-top:14px}.ops-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}.ops-h small{color:var(--accent,#f60);font-weight:600}
      .ops-c{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line,#444);border-radius:14px;margin-bottom:7px;cursor:pointer}.ops-c.on{border-color:var(--accent,#f60);background:color-mix(in srgb,var(--accent,#f60) 12%,transparent)}
      .ops-c input{width:20px;height:20px;accent-color:var(--accent,#f60);margin:0}.ops-c span{flex:1}.ops-c i{font-style:normal;color:var(--muted,#aaa);font-size:14px}
      .ops-go{width:100%;margin-top:12px;padding:14px;border:0;border-radius:99px;background:var(--accent,#f60);color:#fff;font:inherit;font-weight:700;cursor:pointer}.ops-go:disabled{opacity:.45;cursor:not-allowed}.ops-hint{text-align:center;color:var(--muted,#aaa);font-size:13px;min-height:18px;margin-top:6px}`; document.head.appendChild(s); }
    const d = document.createElement('div'); d.id = 'opsheet'; d.dir = AR() ? 'rtl' : 'ltr';
    d.innerHTML = `<div class="ops-card" role="dialog" aria-modal="true"><div class="ops-top"><b>${E(nm(it))}</b><button class="ops-x" aria-label="${E(t('cancel'))}">✕</button></div><div class="ops-body"></div><div class="ops-hint"></div><button class="ops-go"></button></div>`;
    d.addEventListener('mousedown', (e) => { if (e.target === d) close(); });
    d.querySelector('.ops-x').onclick = close;
    d.querySelector('.ops-go').onclick = () => { const sel = {}; Object.keys(cur.sel).forEach((k) => { if (cur.sel[k].length) sel[k] = cur.it.options.find((g) => g.id === k).type === 'many' ? cur.sel[k] : cur.sel[k][0]; }); const cb = cur.onAdd; close(); cb(sel); };
    document.body.appendChild(d); paint();
  }
  function close() { const e = document.getElementById('opsheet'); if (e) e.remove(); cur = null; }
  // display-only price/label of a selection (the server recomputes both)
  function calc(it, sel) {
    let add = 0; const names = [];
    (it.options || []).forEach((g) => { let w = sel && sel[g.id]; w = w == null ? [] : Array.isArray(w) ? w : [w]; if (!w.length) { const d = g.choices.find((c) => c.def); if (g.type === 'one' && d) w = [d.id]; } w.forEach((cid) => { const c = g.choices.find((x) => x.id === cid); if (c) { add += c.price; names.push(nm(c)); } }); });
    return { add, label: names.join(' · ') };
  }
  return { has, open, close, chips, calc, AL };
})();
