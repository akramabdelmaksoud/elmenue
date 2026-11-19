// Item options sheet (size, milk, extras, sugar...) and item detail chips (allergens, calories, badge). Used by the guest table page and the online order page.
// Needs shared.js (App) loaded first. Nothing here trusts the browser: the server re-checks every choice and recomputes the price.
const Opts = (() => {
  const AR = () => App.lang === 'ar';
  const T = {
    en: { choose: 'Choose options', add: 'Add to order', req: 'Required', upTo: 'up to', pick: 'Please choose:', free: 'Free', cancel: 'Cancel', kcal: 'kcal', contains: 'Contains', chef: "Chef's pick", spicy: 'Spicy', vegan: 'Vegan', veg: 'Vegetarian', new: 'New', popular: 'Popular', next: 'Next', back: 'Back', review: 'Your order', exact: 'Exact amount' },
    ar: { choose: 'اختر الخيارات', add: 'أضف للطلب', req: 'مطلوب', upTo: 'حتى', pick: 'من فضلك اختر:', free: 'مجاناً', cancel: 'إلغاء', kcal: 'سعرة', contains: 'يحتوي على', chef: 'اختيار الشيف', spicy: 'حار', vegan: 'نباتي', veg: 'خضري', new: 'جديد', popular: 'الأكثر طلباً', next: 'التالي', back: 'رجوع', review: 'طلبك', exact: 'الكمية بالظبط' },
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

  const cnt = (g) => (cur.n[g.id] || 0);
  const total = () => {
    let add = 0; cur.it.options.forEach((g) => { (cur.sel[g.id] || []).forEach((cid) => { const c = g.choices.find((x) => x.id === cid); if (c) add += c.price; }); if (g.count) add += cnt(g) * g.count.price; });
    return cur.it.price + add;
  };
  const missingGroup = () => cur.it.options.find((g) => g.required && !(cur.sel[g.id] || []).length && !cnt(g));
  const stepped = () => !!cur.it.steps && cur.it.options.length > 1;
  const unitOf = (g) => (AR() ? g.count.unit_ar || g.count.unit : g.count.unit) || '×';
  function groupHTML(g) {
    const many = g.type === 'many', sel = cur.sel[g.id] || [];
    const choices = g.choices.map((c) => `<label class="ops-c ${sel.includes(c.id) ? 'on' : ''}"><input type="${many ? 'checkbox' : 'radio'}" name="og_${E(g.id)}" ${sel.includes(c.id) ? 'checked' : ''} data-g="${E(g.id)}" data-c="${E(c.id)}"><span class="ops-mk"></span><span class="ops-nm">${E(nm(c))}</span><i>${c.price ? '+' + App.money(c.price) : ''}</i></label>`).join('');
    const counter = g.count ? `<div class="ops-cnt"><div class="ops-ch"><span>${E(t('exact'))}</span><small>${g.count.price ? '+' + App.money(g.count.price) + ' / ' + E(unitOf(g)) : ''}</small></div>
      <div class="ops-cr"><button type="button" class="ops-b" data-cm="${E(g.id)}" aria-label="-">−</button><input type="range" min="0" max="${g.count.max}" step="1" value="${cnt(g)}" data-cs="${E(g.id)}"><button type="button" class="ops-b" data-cp="${E(g.id)}" aria-label="+">+</button><b class="ops-cv" id="cv_${E(g.id)}">${cnt(g)} <small>${E(unitOf(g))}</small></b></div></div>` : '';
    return `<div class="ops-g"><div class="ops-h"><b>${E(nm(g))}</b><small>${g.required ? E(t('req')) : ''}${many && g.max < g.choices.length ? ` · ${E(t('upTo'))} ${g.max}` : ''}</small></div>${choices}${counter}</div>`;
  }
  function summaryHTML() {
    const r = calc(cur.it, cur.sel, cur.n);
    const rows = cur.it.options.map((g) => { const w = (cur.sel[g.id] || []).map((cid) => g.choices.find((c) => c.id === cid)).filter(Boolean).map((c) => nm(c)); if (cnt(g)) w.push(cnt(g) + ' ' + unitOf(g)); return w.length ? `<div class="ops-sr"><span>${E(nm(g))}</span><b>${E(w.join(' · '))}</b></div>` : ''; }).join('');
    return `<div class="ops-g ops-sum"><div class="ops-h"><b>${E(t('review'))}</b></div><div class="ops-sr"><span>${E(nm(cur.it))}</span><b>${App.money(cur.it.price)}</b></div>${rows}${r.add ? `<div class="ops-sr"><span>+</span><b>${App.money(r.add)}</b></div>` : ''}</div>`;
  }
  function paint(dir) {
    const it = cur.it, el = document.getElementById('opsheet'); if (!el) return;
    const st = stepped(), last = st ? it.options.length : 0, onSum = st && cur.step >= last, g = st && !onSum ? it.options[cur.step] : null;
    const missing = st ? (g && g.required && !(cur.sel[g.id] || []).length && !cnt(g) ? g : null) : missingGroup();
    const body = el.querySelector('.ops-body');
    body.innerHTML = st ? (onSum ? summaryHTML() : groupHTML(g)) : it.options.map(groupHTML).join('');
    body.classList.remove('fw', 'bk'); void body.offsetWidth; if (st && dir) body.classList.add(dir > 0 ? 'fw' : 'bk');
    el.querySelector('.ops-dots').innerHTML = st ? it.options.concat([0]).map((_, i) => `<i class="${i === cur.step ? 'on' : i < cur.step ? 'dn' : ''}"></i>`).join('') : '';
    const go = el.querySelector('.ops-go'), bk = el.querySelector('.ops-bk'), tot = total();
    go.disabled = st ? !!missing || (onSum && !!missingGroup()) : !!missing; go.textContent = st && !onSum ? `${t('next')} →` : `${t('add')}`; bk.style.display = st && cur.step > 0 ? '' : 'none';
    el.querySelector('.ops-hint').textContent = missing ? `${t('pick')} ${nm(missing)}` : '';
    const tl = el.querySelector('.ops-tot'); if (tl.dataset.v !== String(tot)) { tl.dataset.v = tot; tl.textContent = App.money(tot); tl.classList.remove('pop'); void tl.offsetWidth; tl.classList.add('pop'); }
    el.querySelectorAll('input[data-g]').forEach((inp) => (inp.onchange = () => toggle(inp.dataset.g, inp.dataset.c)));
    const setN = (id, v) => { const q = it.options.find((x) => x.id === id); cur.n[id] = Math.max(0, Math.min(q.count.max, Math.round(+v) || 0)); paint(); };
    el.querySelectorAll('[data-cm]').forEach((b) => (b.onclick = () => setN(b.dataset.cm, (cur.n[b.dataset.cm] || 0) - 1)));
    el.querySelectorAll('[data-cp]').forEach((b) => (b.onclick = () => setN(b.dataset.cp, (cur.n[b.dataset.cp] || 0) + 1)));
    el.querySelectorAll('[data-cs]').forEach((r) => { r.oninput = () => { const q = it.options.find((x) => x.id === r.dataset.cs); cur.n[q.id] = +r.value; const v = document.getElementById('cv_' + q.id); if (v) v.innerHTML = r.value + ' <small>' + E(unitOf(q)) + '</small>'; }; r.onchange = () => setN(r.dataset.cs, r.value); });
  }
  function toggle(gid, cid) {
    const g = cur.it.options.find((x) => x.id === gid), s = cur.sel[gid] || [];
    if (g.type === 'many') { const i = s.indexOf(cid); if (i >= 0) s.splice(i, 1); else if (s.length < g.max) s.push(cid); cur.sel[gid] = s; }
    else cur.sel[gid] = (s[0] === cid && !g.required) ? [] : [cid];
    const keep = document.querySelector('#opsheet .ops-body'), y = keep ? keep.scrollTop : 0; paint(); if (keep) keep.scrollTop = y;
  }
  function submit() {
    const sel = {}; Object.keys(cur.sel).forEach((k) => { if (cur.sel[k].length) sel[k] = cur.it.options.find((g) => g.id === k).type === 'many' ? cur.sel[k] : cur.sel[k][0]; });
    Object.keys(cur.n).forEach((k) => { if (cur.n[k]) sel[k + '~n'] = cur.n[k]; });
    const cb = cur.onAdd; close(); cb(sel);
  }
  function open(it, onAdd) {
    close(); cur = { it, onAdd, sel: {}, n: {}, step: 0 };
    it.options.forEach((g) => { const d = g.choices.find((c) => c.def); if (d && g.type === 'one') cur.sel[g.id] = [d.id]; });
    if (!document.getElementById('opstyle')) { const s = document.createElement('style'); s.id = 'opstyle'; s.textContent = `
      #opsheet{position:fixed;inset:0;z-index:90;background:#0000;display:flex;align-items:flex-end;justify-content:center;animation:opsbg .3s forwards}@keyframes opsbg{to{background:#0009}}
      #opsheet .ops-card{background:var(--card,#222);color:var(--text,#fff);width:100%;max-width:520px;max-height:90vh;display:flex;flex-direction:column;border-radius:26px 26px 0 0;padding:10px 18px calc(16px + env(safe-area-inset-bottom));animation:opsup .5s cubic-bezier(.2,.9,.25,1.05) both;box-shadow:0 -20px 60px #0007}
      @keyframes opsup{from{transform:translateY(105%)}}#opsheet.out{animation:opsbg .25s reverse forwards}#opsheet.out .ops-card{animation:none;transition:transform .25s ease-in;transform:translateY(105%)}
      .ops-grab{width:42px;height:5px;border-radius:9px;background:var(--line,#555);margin:0 auto 10px}
      .ops-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.ops-top b{font-size:19px}.ops-x{background:none;border:0;color:inherit;font-size:22px;cursor:pointer;padding:4px 8px}
      .ops-dots{display:flex;gap:6px;justify-content:center;margin:8px 0 0;min-height:5px}.ops-dots i{width:22px;height:5px;border-radius:9px;background:var(--line,#555);transition:background .3s,width .3s}.ops-dots i.dn{background:color-mix(in srgb,var(--accent,#f60) 55%,transparent)}.ops-dots i.on{background:var(--accent,#f60);width:34px}
      .ops-body{overflow:auto;padding-bottom:4px;flex:1}.ops-body.fw{animation:opsfw .35s ease both}.ops-body.bk{animation:opsbk .35s ease both}@keyframes opsfw{from{opacity:0;transform:translateX(26px)}}@keyframes opsbk{from{opacity:0;transform:translateX(-26px)}}
      [dir=rtl] .ops-body.fw{animation-name:opsbk}[dir=rtl] .ops-body.bk{animation-name:opsfw}
      .ops-g{margin-top:14px}.ops-h{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px}.ops-h small{color:var(--accent,#f60);font-weight:600}
      .ops-c{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid var(--line,#444);border-radius:14px;margin-bottom:7px;cursor:pointer;transition:transform .2s,border-color .2s,background .2s}.ops-c:active{transform:scale(.97)}.ops-c.on{border-color:var(--accent,#f60);background:color-mix(in srgb,var(--accent,#f60) 14%,transparent)}
      .ops-c input{position:absolute;opacity:0;pointer-events:none}.ops-mk{flex:none;width:22px;height:22px;border-radius:50%;border:2px solid var(--line,#666);display:grid;place-items:center;transition:all .25s cubic-bezier(.3,1.6,.5,1)}.ops-c input[type=checkbox]+.ops-mk{border-radius:7px}
      .ops-c.on .ops-mk{border-color:var(--accent,#f60);background:var(--accent,#f60);transform:scale(1.12)}.ops-c.on .ops-mk:after{content:"✓";color:#fff;font-size:13px;font-weight:900;line-height:1}
      .ops-nm{flex:1}.ops-c i{font-style:normal;color:var(--muted,#aaa);font-size:14px}
      .ops-cnt{margin-top:8px;padding:12px;border:1px dashed var(--line,#555);border-radius:14px}.ops-ch{display:flex;justify-content:space-between;font-weight:700;margin-bottom:8px}.ops-ch small{color:var(--muted,#aaa);font-weight:600}
      .ops-cr{display:flex;align-items:center;gap:10px}.ops-cr input[type=range]{flex:1;accent-color:var(--accent,#f60);height:28px}.ops-b{width:36px;height:36px;border-radius:50%;border:1px solid var(--line,#555);background:transparent;color:inherit;font-size:20px;font-weight:900;cursor:pointer;transition:transform .2s}.ops-b:active{transform:scale(.8)}
      .ops-cv{min-width:64px;text-align:center;font-size:20px}.ops-cv small{font-size:12px;color:var(--muted,#aaa);font-weight:600}
      .ops-sum .ops-sr{display:flex;justify-content:space-between;gap:12px;padding:9px 2px;border-bottom:1px solid var(--line,#444)}.ops-sr span{color:var(--muted,#aaa)}.ops-sr b{text-align:end}
      .ops-ft{display:flex;gap:8px;align-items:center;margin-top:10px}.ops-ft .ops-tot{font-weight:900;font-size:18px;min-width:84px;color:var(--accent,#f60)}.ops-tot.pop{animation:opspop .4s}@keyframes opspop{40%{transform:scale(1.25)}}
      .ops-go{flex:1;padding:14px;border:0;border-radius:99px;background:var(--accent,#f60);color:#fff;font:inherit;font-weight:700;cursor:pointer;transition:transform .2s,opacity .2s}.ops-go:active{transform:scale(.97)}.ops-go:disabled{opacity:.45;cursor:not-allowed}
      .ops-bk{padding:13px 16px;border-radius:99px;border:1px solid var(--line,#555);background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}.ops-hint{text-align:center;color:var(--muted,#aaa);font-size:13px;min-height:18px;margin-top:6px}
      @media(prefers-reduced-motion:reduce){#opsheet,#opsheet *{animation-duration:.01ms!important;transition-duration:.01ms!important}}`; document.head.appendChild(s); }
    const d = document.createElement('div'); d.id = 'opsheet'; d.dir = AR() ? 'rtl' : 'ltr';
    d.innerHTML = `<div class="ops-card" role="dialog" aria-modal="true"><div class="ops-grab"></div><div class="ops-top"><b>${E(nm(it))}</b><button class="ops-x" aria-label="${E(t('cancel'))}">✕</button></div><div class="ops-dots"></div><div class="ops-body"></div><div class="ops-hint"></div><div class="ops-ft"><button class="ops-bk" type="button">${E(t('back'))}</button><span class="ops-tot"></span><button class="ops-go"></button></div></div>`;
    d.addEventListener('mousedown', (e) => { if (e.target === d) close(); });
    d.querySelector('.ops-x').onclick = close;
    d.querySelector('.ops-bk').onclick = () => { if (cur.step > 0) { cur.step--; paint(-1); } };
    d.querySelector('.ops-go').onclick = () => { if (stepped() && cur.step < cur.it.options.length) { cur.step++; paint(1); } else submit(); };
    document.body.appendChild(d); paint();
  }
  function close() { const e = document.getElementById('opsheet'); cur = null; if (!e) return; e.classList.add('out'); setTimeout(() => e.remove(), 240); }
  // display-only price/label of a selection (the server recomputes both)
  function calc(it, sel, nn) {
    let add = 0; const names = [];
    (it.options || []).forEach((g) => {
      let w = sel && sel[g.id]; w = w == null ? [] : Array.isArray(w) ? w : [w]; if (!w.length) { const d = g.choices.find((c) => c.def); if (g.type === 'one' && d) w = [d.id]; }
      w.forEach((cid) => { const c = g.choices.find((x) => x.id === cid); if (c) { add += c.price; names.push(nm(c)); } });
      const n = g.count ? (nn ? nn[g.id] : sel && sel[g.id + '~n']) || 0 : 0; if (n) { add += n * g.count.price; names.push(n + ' ' + ((AR() ? g.count.unit_ar || g.count.unit : g.count.unit) || '×')); }
    });
    return { add, label: names.join(' · ') };
  }
  return { has, open, close, chips, calc, AL };
})();
