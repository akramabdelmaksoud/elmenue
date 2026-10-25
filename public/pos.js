/* Staff tools for the captain / cashier screen: take orders, takeaway & delivery tickets, discounts,
   cash / card / split payment with change, receipts, voids, move & merge tables, reservations.
   Uses the globals of captain.html (S = live state, closeM) and the shared App runtime. */
const PX = (() => {
  const E = (s) => App.esc(s), $ = (id) => document.getElementById(id), M = (n) => App.money(n);
  const r2 = (n) => Math.round(n * 100) / 100;
  let PO = null, PY = null;
  const host = () => $('dlg');
  const shell = (inner, wide) => { host().innerHTML = `<div class="modal" onclick="if(event.target===this)PX.close()"><div class="card" style="${wide ? 'width:min(980px,96vw)' : ''}">${inner}</div></div>`; };
  const close = () => { PO = null; PY = null; host().innerHTML = ''; };
  const head = (t) => `<div class="spread"><h2>${t}</h2><button onclick="PX.close()" aria-label="close">✕</button></div>`;
  const item = (id) => S.config.items.find((i) => i.id === id);
  const waitFor = (cond, fn) => { let n = 0; const t = setInterval(() => { if (cond()) { clearInterval(t); fn(); } else if (++n > 40) clearInterval(t); }, 150); };

  /* ---------- order taking ---------- */
  function beginPOS(tid, label, isNew) {
    const s = S.sessions[tid];
    PO = { tid, label, isNew: isNew || null, cat: 'all', q: '', cart: [], guestId: s && s.guests[0] ? s.guests[0].id : null };
    drawPOS();
  }
  function openPOS(tid) {
    const s = S.sessions[tid], t = S.config.tables.find((x) => x.id === tid);
    beginPOS(tid, s ? s.tableNumber : t.number);
  }
  function posGrid() {
    const q = PO.q.toLowerCase();
    const list = S.config.items.filter((i) => (PO.cat === 'all' || i.cat === PO.cat) && (!q || i.name.toLowerCase().includes(q) || (i.name_ar || '').includes(PO.q)));
    return list.map((i) => {
      const inCart = (PO.cart.find((c) => c.itemId === i.id) || {}).qty || 0, tr = i.stock != null && i.stock !== '';
      const out = i.soldOut || (tr && i.stock - inCart <= 0);
      return `<button class="pit ${out ? 'out' : ''}" ${out ? 'disabled' : ''} onclick="PX.add('${i.id}')"><span class="e">${E(i.emoji || '🍽️')}</span><b>${E(i.name)}</b><small>${M(i.price)}${tr ? ' · ' + i.stock + ' left' : ''}${i.soldOut ? ' · sold out' : ''}</small>${inCart ? `<i class="bd">${inCart}</i>` : ''}</button>`;
    }).join('') || '<p class="muted">No items</p>';
  }
  function cartHTML() {
    const s = S.sessions[PO.tid], total = PO.cart.reduce((n, c) => n + c.qty * (item(c.itemId) || { price: 0 }).price, 0);
    return `${PO.cart.map((c, i) => { const it = item(c.itemId) || {}; return `<div class="pcl"><div class="spread"><span>${E(it.emoji || '')} <b>${E(it.name)}</b></span><span class="step"><button onclick="PX.qty(${i},-1)">−</button><b>${c.qty}</b><button onclick="PX.qty(${i},1)">+</button></span></div><input placeholder="Note (no sugar, extra hot…)" value="${E(c.note)}" oninput="PX.note(${i},this.value)"></div>`; }).join('') || '<p class="muted">Tap items to add them.</p>'}
      ${s && s.guests.length > 1 ? `<label class="muted" style="font-size:12px">Charge to</label><select onchange="PX.guest(this.value)">${s.guests.map((g) => `<option value="${g.id}" ${g.id === PO.guestId ? 'selected' : ''}>${g.avatar} ${E(g.name)}</option>`).join('')}</select>` : ''}
      <div class="spread" style="margin:12px 0 8px"><b>Subtotal</b><b style="font-size:20px">${M(total)}</b></div>
      <div class="row wrap"><button class="primary" ${PO.cart.length ? '' : 'disabled'} onclick="PX.send(false)">🔥 Send to kitchen</button><button class="ghost" ${PO.cart.length ? '' : 'disabled'} onclick="PX.send(true)">💳 Send &amp; pay</button></div>`;
  }
  function drawPOS() {
    shell(`${head('🧾 Order · ' + E(PO.label))}<div class="posgrid"><div><input id="poq" placeholder="Search the menu…" value="${E(PO.q)}" oninput="PX.search(this.value)">
      <div class="pchips"><button class="${PO.cat === 'all' ? 'sel' : ''}" onclick="PX.cat('all')">All</button>${S.config.categories.map((c) => `<button class="${PO.cat === c.id ? 'sel' : ''}" onclick="PX.cat('${c.id}')">${E(c.emoji || '')} ${E(c.name)}</button>`).join('')}</div>
      <div class="pitems" id="pogrid">${posGrid()}</div></div><div class="pcart" id="pocart">${cartHTML()}</div></div>`, true);
  }
  function drawCart() { $('pocart').innerHTML = cartHTML(); $('pogrid').innerHTML = posGrid(); }
  function send(payNow) {
    if (!PO || !PO.cart.length) return;
    const tid = PO.tid, isNew = PO.isNew;
    if (isNew) App.send({ t: 'open_ticket', ...isNew, tid });
    App.send({ t: 'staff_order', tableId: tid, guestId: PO.guestId, items: PO.cart.map((c) => ({ itemId: c.itemId, qty: c.qty, note: c.note })) });
    App.toast('Sent to the kitchen 🔥'); close();
    if (payNow) waitFor(() => S.sessions[tid] && S.sessions[tid].orders.length, () => openPay(tid));
  }
  function newTicket(kind) {
    shell(`${head(kind === 'delivery' ? '🛵 New delivery' : '🛍️ New takeaway')}<div class="field"><label>Customer name</label><input id="tkn"></div><div class="field"><label>Phone</label><input id="tkp" type="tel"></div>
      ${kind === 'delivery' ? '<div class="field"><label>Address</label><input id="tka"></div>' : ''}<button class="primary" onclick="PX.startTicket('${kind}')">Start order →</button>`);
  }
  function startTicket(kind) {
    const v = (id) => ($(id) ? $(id).value.trim() : '');
    beginPOS('tk_' + Math.random().toString(36).slice(2, 10), kind === 'delivery' ? 'Delivery' : 'Takeaway', { kind, name: v('tkn'), phone: v('tkp'), address: v('tka') });
  }

  /* ---------- payment ---------- */
  function rcpt(s, x) {
    const m = {}; s.orders.forEach((o) => o.items.forEach((i) => { (m[i.name + '|' + i.price] ||= { name: i.name, qty: 0, price: i.price }).qty += i.qty; }));
    const b = s.bill;
    return { label: s.tableNumber, kind: s.kind || 'table', customer: s.customer, at: Date.now(), items: Object.values(m), gross: b.gross, discount: b.discount, discountNote: s.discount && s.discount.reason, service: b.service, tax: b.tax, by: App.who(), ...x };
  }
  function openPay(tid) {
    const s = S.sessions[tid]; if (!s) return;
    PY = { tid, method: s.check ? s.check.method : 'cash', tipPct: s.check ? (s.check.tipPct || 0) : 0, tipCustom: null, tendered: '', card: '', print: true, dtype: 'pct' };
    drawPay();
  }
  function calc() {
    const s = S.sessions[PY.tid], b = s.bill;
    const tip = PY.tipCustom !== null ? Math.max(0, +PY.tipCustom || 0) : Math.round(b.net * PY.tipPct / 100), total = r2(b.total + tip);
    let pay;
    if (PY.method === 'card') pay = { cash: 0, card: total, tendered: 0, change: 0 };
    else if (PY.method === 'mixed') { const card = r2(Math.min(total, Math.max(0, +PY.card || 0))), cash = r2(total - card), tendered = Math.max(cash, +PY.tendered || cash); pay = { cash, card, tendered, change: r2(tendered - cash) }; }
    else { const tendered = Math.max(total, +PY.tendered || total); pay = { cash: total, card: 0, tendered, change: r2(tendered - total) }; }
    const due = PY.method === 'card' ? 0 : pay.cash, short = PY.method !== 'card' && (+PY.tendered || 0) > 0 && +PY.tendered < due;
    return { s, b, tip, total, pay, short };
  }
  function totalsHTML() {
    const { s, b, tip, total, pay, short } = calc();
    return `<div class="card" style="margin:10px 0"><div class="line"><span>Subtotal</span><span>${M(b.gross)}</span></div>${b.discount ? `<div class="line" style="color:var(--ok)"><span>Discount${s.discount && s.discount.reason ? ' (' + E(s.discount.reason) + ')' : ''}</span><span>−${M(b.discount)}</span></div>` : ''}
      <div class="line"><span>Service</span><span>${M(b.service)}</span></div><div class="line"><span>Tax</span><span>${M(b.tax)}</span></div>${tip ? `<div class="line"><span>Tip</span><span>${M(tip)}</span></div>` : ''}
      <div class="line"><b>Total due</b><b style="font-size:22px">${M(total)}</b></div>${PY.method !== 'card' ? `<div class="line"><span>Received</span><span>${M(pay.tendered)}</span></div><div class="line"><b>Change</b><b style="color:${short ? 'var(--bad)' : 'var(--ok)'}">${short ? 'not enough' : M(pay.change)}</b></div>` : ''}
      ${PY.method === 'mixed' ? `<div class="line"><span>Cash part</span><span>${M(pay.cash)}</span></div><div class="line"><span>Card part</span><span>${M(pay.card)}</span></div>` : ''}</div>
      <button class="primary block" ${short ? 'disabled' : ''} onclick="PX.confirmPay()" style="width:100%">✅ Confirm payment${PY.method === 'mixed' ? ' (cash + card)' : ' · ' + PY.method}</button>`;
  }
  function drawPay() {
    const s = S.sessions[PY.tid]; if (!s) return close();
    const b = s.bill, quick = [...new Set([calc().total, Math.ceil(calc().total / 50) * 50, Math.ceil(calc().total / 100) * 100, Math.ceil(calc().total / 100) * 100 + 100, 500, 1000])].filter((x) => x >= calc().total).slice(0, 5);
    const chip = (on, fn, label) => `<button class="${on ? 'sel' : 'ghost'}" onclick="${fn}">${label}</button>`;
    shell(`${head('💳 Pay · ' + (s.kind ? E(s.kind) + ' ' : 'Table ') + E(s.tableNumber))}
      <h3>Discount</h3><div class="row wrap"><select id="pdt" style="width:auto" onchange="PX.dtype(this.value)"><option value="pct" ${PY.dtype === 'pct' ? 'selected' : ''}>% percent</option><option value="amt" ${PY.dtype === 'amt' ? 'selected' : ''}>Amount</option></select>
        <input id="pdv" type="number" min="0" step="any" placeholder="0" style="width:90px" value="${s.discount ? s.discount.value : ''}"><input id="pdr" placeholder="Reason (staff meal, regular…)" style="flex:1;min-width:120px" value="${E(s.discount ? s.discount.reason : '')}">
        <button class="ghost" onclick="PX.applyDisc()">Apply</button>${s.discount ? '<button class="ghost" onclick="PX.removeDisc()">Remove</button>' : ''}</div>
      <h3>Tip</h3><div class="row wrap">${[0, 5, 10, 15].map((p) => chip(PY.tipCustom === null && PY.tipPct === p, `PX.tip(${p})`, p + '%')).join('')}<input id="ptc" type="number" min="0" step="any" placeholder="Custom" style="width:100px" value="${PY.tipCustom === null ? '' : PY.tipCustom}" oninput="PX.tipC(this.value)"></div>
      <h3>Payment</h3><div class="row wrap">${chip(PY.method === 'cash', "PX.method('cash')", '💵 Cash')}${chip(PY.method === 'card', "PX.method('card')", '💳 Card')}${chip(PY.method === 'mixed', "PX.method('mixed')", '➗ Cash + card')}</div>
      ${PY.method === 'mixed' ? `<div class="field" style="margin-top:8px"><label>Card amount</label><input id="pcd" type="number" min="0" step="any" value="${PY.card}" oninput="PX.setv('card',this.value)"></div>` : ''}
      ${PY.method !== 'card' ? `<div class="field" style="margin-top:8px"><label>Cash received</label><input id="pcv" type="number" min="0" step="any" placeholder="exact" value="${PY.tendered}" oninput="PX.setv('tendered',this.value)"></div><div class="row wrap">${quick.map((q) => `<button class="ghost" onclick="PX.cash(${q})">${M(q)}</button>`).join('')}</div>` : ''}
      <div id="pytot">${totalsHTML()}</div>
      <div class="row wrap" style="margin-top:8px"><label class="row" style="gap:6px"><input type="checkbox" ${PY.print ? 'checked' : ''} onchange="PX.setv('print',this.checked)" style="width:auto"> Print receipt</label><button class="ghost" onclick="PX.printBill()">🖨 Print bill only</button></div>`);
  }
  function confirmPay() {
    const { s, tip, total, pay, short } = calc(); if (short) return;
    const method = PY.method, tid = PY.tid, doPrint = PY.print, data = rcpt(s, { tip, total, method, pay });
    App.send({ t: 'close_table', tableId: tid, method, pay: { tip, tendered: +PY.tendered || 0, card: +PY.card || 0 } });
    if (doPrint) App.printHTML(App.receiptHTML(data));
    App.toast('Paid ✓ ' + M(total)); close(); closeM();
  }
  function printBill() { const { s, tip, total } = calc(); App.printHTML(App.receiptHTML(rcpt(s, { tip, total, method: '— not paid yet —', pre: true }))); }

  /* ---------- voids, move, merge ---------- */
  function voidDlg(tid, itemId) {
    const s = S.sessions[tid]; let it; s.orders.forEach((o) => o.items.forEach((i) => { if (i.id === itemId) it = i; })); if (!it) return;
    shell(`${head('Remove item')}<p>${it.qty}× <b>${E(it.name)}</b> · ${M(it.qty * it.price)}</p>
      <div class="field"><label>How many?</label><input id="vq" type="number" min="1" max="${it.qty}" value="${it.qty}"></div>
      <div class="field"><label>Reason</label><select id="vr"><option>Customer changed their mind</option><option>Wrong order taken</option><option data-w="1">Kitchen mistake (wasted)</option><option data-w="1">Spoiled / dropped (wasted)</option><option>Other</option></select></div>
      <button class="primary" onclick="PX.doVoid('${tid}','${itemId}')">Remove from the bill</button>`);
  }
  function doVoid(tid, itemId) {
    const sel = $('vr'), o = sel.options[sel.selectedIndex];
    App.send({ t: 'void_item', tableId: tid, itemId, qty: +$('vq').value || 1, reason: o.text, waste: !!o.dataset.w }); close();
  }
  function moveDlg(tid) {
    const free = S.config.tables.filter((t) => !S.sessions[t.id]);
    shell(`${head('Move to another table')}<p class="muted">Pick a free table. The whole order moves with the guests.</p><div class="pitems">${free.map((t) => `<button class="pit" onclick="PX.doMove('${tid}','${t.id}')"><span class="e">🪑</span><b>Table ${t.number}</b><small>${t.seats} seats</small></button>`).join('') || '<p class="muted">No free tables</p>'}</div>`);
  }
  function doMove(a, b) { App.send({ t: 'move_table', from: a, to: b }); close(); closeM(); App.toast('Table moved'); }
  function mergeDlg(tid) {
    const others = Object.values(S.sessions).filter((s) => !s.kind && s.tableId !== tid);
    shell(`${head('Merge into another table')}<p class="muted">This table's orders and guests are added to the table you pick, and this table is freed.</p><div class="pitems">${others.map((s) => `<button class="pit" onclick="PX.doMerge('${tid}','${s.tableId}')"><span class="e">⧉</span><b>Table ${s.tableNumber}</b><small>${s.guests.length} guest(s) · ${M(s.bill.total)}</small></button>`).join('') || '<p class="muted">No other occupied tables</p>'}</div>`);
  }
  function doMerge(a, b) { App.send({ t: 'merge_tables', from: a, to: b }); close(); closeM(); App.toast('Tables merged'); }

  /* ---------- reservations ---------- */
  const fmtT = (at) => new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  function resDlg(tableId) {
    const list = (S.config.reservations || []).slice().sort((a, b) => a.at - b.at), d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    shell(`${head('📅 Reservations')}${list.map((r) => `<div class="ocard spread"><div><b>${fmtT(r.at)}</b> · Table ${r.tableNumber} · ${E(r.name)} (${r.guests})${r.phone ? ' · ' + E(r.phone) : ''}${r.note ? `<br><small class="muted">${E(r.note)}</small>` : ''}</div><div class="row"><button class="primary" onclick="PX.seatRes('${r.id}')">Seat</button><button class="ghost" onclick="PX.delRes('${r.id}')">✕</button></div></div>`).join('') || '<p class="muted">No upcoming reservations</p>'}
      <h3>New reservation</h3><div class="fgrid2"><div class="field"><label>Table</label><select id="rt">${S.config.tables.map((t) => `<option value="${t.id}" ${t.id === tableId ? 'selected' : ''}>Table ${t.number} (${t.seats})</option>`).join('')}</select></div>
      <div class="field"><label>When</label><input id="rw" type="datetime-local" value="${local}"></div><div class="field"><label>Name</label><input id="rn"></div><div class="field"><label>Phone</label><input id="rp" type="tel"></div>
      <div class="field"><label>Guests</label><input id="rg" type="number" min="1" value="2"></div><div class="field"><label>Note</label><input id="rm"></div></div><button class="primary" onclick="PX.addRes()">Save reservation</button>`);
  }
  function addRes() {
    const at = new Date($('rw').value).getTime(); if (!(at > 0)) return App.toast('Pick a date and time');
    App.send({ t: 'res_add', tableId: $('rt').value, at, name: $('rn').value.trim() || 'Guest', phone: $('rp').value.trim(), guests: +$('rg').value || 2, note: $('rm').value.trim() }); App.toast('Reserved ✓'); close();
  }

  return {
    close, openPOS, newTicket, startTicket, openPay, voidDlg, doVoid, moveDlg, doMove, mergeDlg, doMerge, resDlg, addRes, printBill, confirmPay,
    add(id) { const c = PO.cart.find((x) => x.itemId === id); if (c) { if (c.qty < 20) c.qty++; } else PO.cart.push({ itemId: id, qty: 1, note: '' }); drawCart(); },
    qty(i, d) { PO.cart[i].qty += d; if (PO.cart[i].qty <= 0) PO.cart.splice(i, 1); drawCart(); },
    note(i, v) { PO.cart[i].note = v; }, guest(v) { PO.guestId = v; }, search(v) { PO.q = v; $('pogrid').innerHTML = posGrid(); }, cat(c) { PO.cat = c; drawPOS(); },
    send, dtype(v) { PY.dtype = v; },
    applyDisc() { App.send({ t: 'discount', tableId: PY.tid, type: PY.dtype, value: +$('pdv').value || 0, reason: $('pdr').value.trim() }); },
    removeDisc() { App.send({ t: 'discount', tableId: PY.tid, value: 0 }); },
    tip(p) { PY.tipPct = p; PY.tipCustom = null; drawPay(); }, tipC(v) { PY.tipCustom = v === '' ? null : v; $('pytot').innerHTML = totalsHTML(); },
    method(m) { PY.method = m; drawPay(); }, cash(q) { PY.tendered = String(q); drawPay(); },
    setv(k, v) { PY[k] = v; if (k !== 'print') $('pytot').innerHTML = totalsHTML(); },
    seatRes(id) { App.send({ t: 'res_seat', id }); close(); }, delRes(id) { App.send({ t: 'res_del', id }); close(); },
    // called after every state redraw: keep an open payment dialog current (unless someone is typing in it)
    refresh() { if (PY && !(host().contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) { if (S.sessions[PY.tid]) drawPay(); else close(); } },
  };
})();
