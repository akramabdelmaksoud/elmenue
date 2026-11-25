/* Floor-plan editing on the captain screen, for the people the owner trusts with it (cafés with per-person access, e.g. السرايا).
   Same grid and pieces as the owner's editor in admin: drag a table to move it, pull the round handle to resize, tap to change shape, seats or zone,
   add or remove decor. Every change saves by itself and every screen (captains, owner, kitchen) redraws at once.
   Adding or removing tables stays with the owner, because each table has its own printed QR code. */
(function () {
  const ar = () => App.lang === 'ar';
  const T = (en, a) => (ar() ? a : en);
  const DEC = { bar: ['🍸', 'Counter', 'النصبة', 6, 2], wall: ['🧱', 'Wall', 'حيطة', 6, 1], plant: ['🪴', 'Plant', 'زرع', 2, 2], door: ['🚪', 'Door', 'الباب', 2, 2], kitchen: ['🍳', 'Kitchen', 'المطبخ', 4, 4] };
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (s) => document.querySelector(s);
  const CF = { can: null, asked: false, L: null, sel: null, dirty: false, drag: null, timer: null, v: 0, undo: [], on: false };

  const css = `#cfed{position:fixed;inset:0;z-index:90;background:var(--bg);display:flex;flex-direction:column;overflow:auto}
#cfed .cf-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:3}
#cfed .cf-top h2{margin:0;font-size:18px;flex:1;min-width:160px} #cfed .cf-st{font-size:13px;color:var(--muted)}
#cfed .cf-body{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:14px;padding:12px 14px 90px;align-items:start}
#cfed .cf-tools{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px} #cfed .cf-tools button{padding:8px 12px;font-size:13px}
#cfed .cf-hint{font-size:12.5px;color:var(--muted);margin:0 0 8px}
@media (max-width:820px){#cfed .cf-body{grid-template-columns:1fr} #cfed .fp-side{position:static}}`;

  function snapshot() { return JSON.stringify(CF.L); }
  function fromConfig() {
    const F = App.floor();
    CF.L = { tables: App.config.tables.map((t) => ({ id: t.id, number: t.number, shape: t.shape, seats: t.seats, zone: t.zone || '', ...App.tpos(t) })), decor: F.decor.map((d) => ({ ...d })) };
  }
  function item(kind, id) { return kind === 't' ? CF.L.tables.find((x) => x.id === id) : kind === 'd' ? CF.L.decor.find((x) => x.id === id) : null; }
  const cur = () => (CF.sel ? item(...CF.sel.split(':')) : null);

  async function ask() {
    CF.asked = true;
    try { const r = await fetch('/api/floor/can'); CF.can = r.ok && !!(await r.json()).edit; } catch { CF.can = false; }
    const b = $('#fledit'); if (b) b.style.display = CF.can ? '' : 'none';
    if (!CF.can && CF.on) close();
  }
  // called on every live update of the captain screen
  CF.sync = function () {
    if (!CF.asked) ask();
    if (CF.on && !CF.dirty && !CF.drag) { fromConfig(); draw(); }
  };
  // the owner may switch the permission on or off at any time: check again every minute and whenever the screen comes back into view
  setInterval(() => { if (CF.asked) ask(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && CF.asked) ask(); });

  CF.open = function () {
    if (!CF.can) return App.toast(T('The owner has not given you access to edit the floor', 'صاحب المكان مدّاكش صلاحية تعديل الصالة'));
    if (!document.getElementById('cf-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'cf-css', textContent: css }));
    fromConfig(); CF.sel = null; CF.undo = []; CF.on = true;
    let box = document.getElementById('cfed'); if (!box) { box = document.createElement('div'); box.id = 'cfed'; document.body.appendChild(box); }
    box.innerHTML = `<div class="cf-top"><h2>✏️ ${T('Arrange the floor', 'ترتيب الصالة')}</h2><span class="cf-st" id="cf-st"></span>
      <button class="ghost" id="cf-undo" onclick="CF.back()" disabled>↺ ${T('Undo', 'رجوع')}</button><button class="primary" onclick="CF.close()">✓ ${T('Done', 'خلصت')}</button></div>
      <div class="cf-body"><div><p class="cf-hint">${T('Drag a table to move it. Pull the round handle to resize. Tap a table to change its shape, seats or zone. Changes save by themselves and every screen updates at once.', 'اسحب الترابيزة عشان تنقلها، واسحب الدايرة الصغيرة عشان تكبّرها أو تصغّرها. دوس على الترابيزة عشان تغيّر شكلها أو عدد الكراسي أو مكانها. كل تعديل بيتحفظ لوحده وكل الشاشات بتتحدث على طول.')}</p>
      <div class="cf-tools">${Object.entries(DEC).map(([k, v]) => `<button class="ghost" onclick="CF.addDecor('${k}')">${v[0]} ${T(v[1], v[2])}</button>`).join('')}<button class="ghost" onclick="CF.arrange()">✨ ${T('Auto-arrange', 'رتّب لوحدك')}</button></div>
      <div class="fl-stage edit" id="cf"></div></div><div class="card fp-side" id="cf-side"></div></div>`;
    draw(); bind();
  };
  function close() { CF.on = false; clearTimeout(CF.timer); const box = document.getElementById('cfed'); if (box) box.remove(); }
  CF.close = async function () { if (CF.dirty) await save(); close(); };

  function draw() {
    const F = App.floor(), st = document.getElementById('cf'); if (!st) return;
    st.style.setProperty('--cols', F.cols); st.style.setProperty('--rows', F.rows); st.style.aspectRatio = `${F.cols} / ${F.rows}`;
    const pos = (p) => `left:${p.fx / F.cols * 100}%;top:${p.fy / F.rows * 100}%;width:${p.fw / F.cols * 100}%;height:${p.fh / F.rows * 100}%;--m:${Math.min(p.fw, p.fh)}`;
    st.innerHTML = CF.L.decor.map((d) => `<div class="fl-d ${d.type} fp-el ${CF.sel === 'd:' + d.id ? 'sel' : ''}" data-k="d:${d.id}" style="${pos(d)}"><div>${App.decorIcon[d.type] || '▬'}${d.label ? `<small>${App.esc(d.label)}</small>` : ''}</div><i class="rzh"></i></div>`).join('')
      + CF.L.tables.map((t) => `<div class="fl-t ${t.shape} fp-el ${CF.sel === 't:' + t.id ? 'sel' : ''}" data-k="t:${t.id}" style="${pos(t)}">${App.chairs(t.shape, t.seats)}<span class="n">${t.number}</span><span class="s">${t.seats} ${T('seats', 'كراسي')}</span><i class="rzh"></i></div>`).join('');
    side();
    const u = document.getElementById('cf-undo'); if (u) u.disabled = !CF.undo.length;
  }
  function side() {
    const box = document.getElementById('cf-side'); if (!box) return;
    const [kind] = (CF.sel || ':').split(':'), it = cur();
    const step = (label, key, min) => `<div class="fp-step"><span>${label}</span><div class="c"><button onclick="CF.adj('${key}',-1,${min})">−</button><b>${it[key]}</b><button onclick="CF.adj('${key}',1,${min})">+</button></div></div>`;
    if (!it) { box.innerHTML = `<h3>${T('Floor', 'الصالة')}</h3><p class="muted">${T('Tap a table or a piece of decor to change it.', 'دوس على ترابيزة أو أي حاجة في الصالة عشان تعدّلها.')}</p><p class="muted" style="font-size:13px">${CF.L.tables.length} ${T('tables', 'ترابيزة')} · ${CF.L.tables.reduce((n, t) => n + t.seats, 0)} ${T('seats', 'كرسي')}<br>${T('Adding or removing tables is done by the owner (each table has its own QR code).', 'إضافة أو شيل ترابيزات بيعملها صاحب المكان (كل ترابيزة ليها كود QR خاص بيها).')}</p>`; return; }
    if (kind === 't') {
      const zones = [...new Set(CF.L.tables.map((x) => x.zone).filter(Boolean))];
      box.innerHTML = `<h3>${T('Table', 'ترابيزة')} ${it.number}</h3><div class="muted" style="font-size:12px">${T('Shape', 'الشكل')}</div><div class="seg">${['round', 'square', 'long'].map((s) => `<button class="${it.shape === s ? 'on' : ''}" onclick="CF.shape('${s}')">${{ round: T('⚪ Round', '⚪ مدوّرة'), square: T('⬜ Square', '⬜ مربعة'), long: T('▭ Long', '▭ طويلة') }[s]}</button>`).join('')}</div>
      <div class="muted" style="font-size:12px;margin-top:10px">${T('Zone', 'المكان')}</div><input value="${App.esc(it.zone || '')}" maxlength="20" list="cfz" oninput="CF.zone(this.value)" style="margin:6px 0 4px"><datalist id="cfz">${zones.map((z) => `<option value="${App.esc(z)}">`).join('')}</datalist>
      ${step(T('Seats', 'الكراسي'), 'seats', 1)}${step(T('Width', 'العرض'), 'fw', 2)}${step(T('Height', 'الطول'), 'fh', 2)}`;
    } else {
      const d = DEC[it.type] || ['▬', it.type, it.type];
      box.innerHTML = `<h3>${d[0]} ${T(d[1], d[2])}</h3><div class="muted" style="font-size:12px">${T('Label', 'الاسم')}</div><input value="${App.esc(it.label || '')}" maxlength="20" oninput="CF.label(this.value)" style="margin:6px 0 10px">${step(T('Width', 'العرض'), 'fw', 1)}${step(T('Height', 'الطول'), 'fh', 1)}<button class="ghost" style="width:100%;margin-top:12px" onclick="CF.del()">🗑 ${T('Remove', 'شيل')}</button>`;
    }
  }
  function bind() {
    const st = document.getElementById('cf'); if (!st) return;
    st.onpointerdown = (e) => {
      const el = e.target.closest('.fp-el');
      if (!el) { CF.sel = null; st.querySelectorAll('.fp-el.sel').forEach((x) => x.classList.remove('sel')); side(); return; }
      const [kind, id] = el.dataset.k.split(':'), it = item(kind, id); if (!it) return;
      CF.sel = el.dataset.k; st.querySelectorAll('.fp-el').forEach((x) => x.classList.toggle('sel', x === el)); side();
      const F = App.floor();
      CF.drag = { el, it, kind, mode: e.target.classList.contains('rzh') ? 'resize' : 'move', x: e.clientX, y: e.clientY, o: { ...it }, cw: st.getBoundingClientRect().width / F.cols, F, moved: false, before: snapshot() };
      st.setPointerCapture(e.pointerId); e.preventDefault();
    };
    st.onpointermove = (e) => {
      const d = CF.drag; if (!d) return;
      const dx = Math.round(((e.clientX - d.x) / d.cw) * 2) / 2, dy = Math.round(((e.clientY - d.y) / d.cw) * 2) / 2, it = d.it, F = d.F, min = d.kind === 't' ? 2 : 1;
      if (!d.moved && !dx && !dy) return;
      d.moved = true;
      if (d.mode === 'move') { it.fx = clampN(d.o.fx + dx, 0, F.cols - it.fw); it.fy = clampN(d.o.fy + dy, 0, F.rows - it.fh); }
      else { it.fw = clampN(d.o.fw + dx, min, F.cols - it.fx); it.fh = clampN(d.o.fh + dy, min, F.rows - it.fy); if (d.kind === 't' && it.shape === 'round') { const sz = Math.min(Math.max(min, Math.max(d.o.fw + dx, d.o.fh + dy)), Math.min(F.cols - it.fx, F.rows - it.fy)); it.fw = it.fh = sz; } }
      d.el.style.left = it.fx / F.cols * 100 + '%'; d.el.style.top = it.fy / F.rows * 100 + '%'; d.el.style.width = it.fw / F.cols * 100 + '%'; d.el.style.height = it.fh / F.rows * 100 + '%'; d.el.style.setProperty('--m', Math.min(it.fw, it.fh));
    };
    st.onpointerup = st.onpointercancel = () => { const d = CF.drag; if (!d) return; CF.drag = null; if (d.moved) { pushUndo(d.before); touch(false); } draw(); };
  }
  function pushUndo(before) { CF.undo.push(before || snapshot()); if (CF.undo.length > 30) CF.undo.shift(); }
  function touch(redraw = true) { CF.dirty = true; CF.v++; if (redraw) draw(); saveSoon(); }
  function saveSoon() { const s = document.getElementById('cf-st'); if (s) s.textContent = T('Saving…', 'بيتحفظ…'); clearTimeout(CF.timer); CF.timer = setTimeout(save, 500); }
  async function save() {
    clearTimeout(CF.timer); const v = CF.v, s = document.getElementById('cf-st');
    let r; try { r = await fetch('/api/floor/layout', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tables: CF.L.tables, decor: CF.L.decor }) }); } catch { r = null; }
    if (!r || !r.ok) {
      const j = r ? await r.json().catch(() => ({})) : {};
      if (s) s.textContent = '⚠ ' + (j.error || T('Not saved, check the connection', 'متحفظش، اتأكد من النت'));
      if (r && r.status === 403) { CF.can = false; App.toast(j.error || T('Access removed', 'الصلاحية اتشالت')); close(); ask(); }
      return;
    }
    if (CF.v === v) CF.dirty = false; if (s) s.textContent = T('Saved ✓', 'اتحفظ ✓');
  }
  CF.back = function () { const prev = CF.undo.pop(); if (!prev) return; CF.L = JSON.parse(prev); if (CF.sel && !cur()) CF.sel = null; touch(); };
  CF.adj = function (key, d, min) { const it = cur(); if (!it) return; pushUndo(); const F = App.floor(); const lim = key === 'seats' ? 20 : key === 'fw' ? F.cols - it.fx : F.rows - it.fy; it[key] = clampN(it[key] + d, min, lim); if (it.shape === 'round' && (key === 'fw' || key === 'fh')) it.fw = it.fh = it[key]; touch(); };
  CF.shape = function (s) { const it = cur(); if (!it) return; pushUndo(); it.shape = s; if (s === 'round') it.fw = it.fh = Math.max(2, Math.round((it.fw + it.fh) / 2)); if (s === 'long' && it.fw <= it.fh) it.fw = Math.min(App.floor().cols - it.fx, it.fh + 2); touch(); };
  let typing = 0;
  const once = () => { if (Date.now() - typing > 1500) pushUndo(); typing = Date.now(); };
  CF.zone = function (v) { const it = cur(); if (!it) return; once(); it.zone = v; touch(false); };
  CF.label = function (v) { const it = cur(); if (!it) return; once(); it.label = v; touch(false); const el = document.querySelector(`#cf [data-k="${CF.sel}"] > div`); if (el) el.innerHTML = (App.decorIcon[it.type] || '▬') + (v ? `<small>${App.esc(v)}</small>` : ''); };
  function free(w, h) { const F = App.floor(), all = [...CF.L.tables, ...CF.L.decor]; for (let y = 0; y <= F.rows - h; y++) for (let x = 0; x <= F.cols - w; x++) if (!all.some((o) => x < o.fx + o.fw && x + w > o.fx && y < o.fy + o.fh && y + h > o.fy)) return { fx: x, fy: y }; return { fx: 0, fy: 0 }; }
  CF.addDecor = function (type) { const d = DEC[type]; pushUndo(); CF.L.decor.push({ id: 'd' + Date.now().toString(36), type, ...free(d[3], d[4]), fw: d[3], fh: d[4], label: type === 'plant' || type === 'wall' ? '' : T(d[1], d[2]) }); CF.sel = 'd:' + CF.L.decor[CF.L.decor.length - 1].id; touch(); };
  CF.del = function () { const [kind, id] = (CF.sel || ':').split(':'); if (kind !== 'd') return; pushUndo(); CF.L.decor = CF.L.decor.filter((x) => x.id !== id); CF.sel = null; touch(); };
  CF.arrange = function () {
    if (!confirm(T('Line up all tables in rows? You can undo it.', 'ترتّب كل الترابيزات صفوف؟ تقدر ترجع فيها.'))) return;
    pushUndo(); const F = App.floor(); let x = 0, y = 0, rowH = 0;
    CF.L.tables.slice().sort((a, b) => a.number - b.number).forEach((t) => { if (x + t.fw > F.cols - 2) { x = 0; y += rowH + 1; rowH = 0; } t.fx = x; t.fy = Math.min(y, F.rows - t.fh); x += t.fw + 2; rowH = Math.max(rowH, t.fh); });
    touch();
  };
  window.CF = CF;
})();
