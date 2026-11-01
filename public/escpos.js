/* Receipt printer + cash drawer for the Cashier screen.
   - ESC/POS thermal printers over WebUSB or WebSerial (Chrome / Edge, https or localhost).
   - The receipt is drawn on a canvas and sent as a raster image, so Arabic and any font prints correctly
     on every printer model without code pages.
   - The cash drawer hangs off the printer's RJ11 port: "ESC p" pulses it.
   - No printer paired -> falls back to the normal browser print dialog (80mm receipt). */
const ESCPOS = (() => {
  const W = 576;                      // 80mm paper at 203 dpi
  let link = null;                    // { kind, send(bytes), name, close() }
  const KEY = 'escpos:last';
  const B = (...a) => Uint8Array.from(a);
  const cat = (...p) => { const n = p.reduce((x, y) => x + y.length, 0), o = new Uint8Array(n); let i = 0; p.forEach((y) => { o.set(y, i); i += y.length; }); return o; };
  const INIT = B(0x1b, 0x40), CUT = B(0x1d, 0x56, 0x42, 0x00), KICK1 = B(0x1b, 0x70, 0x00, 0x19, 0xfa), KICK2 = B(0x1b, 0x70, 0x01, 0x19, 0xfa), FEED = (n) => B(0x1b, 0x64, n);

  /* ---------- drawing the receipt ---------- */
  function lines(r, cfg) {
    const st = cfg || {}, M = (n) => Number(n || 0).toFixed(2), out = [];
    const L = (t, o = {}) => out.push({ t: String(t), ...o });
    const rule = () => out.push({ rule: 1 });
    L(st.name || '', { size: 34, bold: 1, c: 1 });
    if (st.address) L(st.address, { c: 1 }); if (st.phone) L(st.phone, { c: 1 }); if (st.taxId) L('Tax ID: ' + st.taxId, { c: 1 });
    L(new Date(r.at || Date.now()).toLocaleString('en-GB'), { c: 1 });
    L((r.kind && r.kind !== 'table' ? r.kind + ' ' : 'Table ') + r.label + (r.by ? ' · ' + r.by : ''), { c: 1, bold: 1, size: 28 });
    if (r.customer && (r.customer.name || r.customer.phone || r.customer.address)) L([r.customer.name, r.customer.phone, r.customer.address].filter(Boolean).join(' · '), { c: 1 });
    rule();
    r.items.forEach((l) => { L(l.name, { bold: 1 }); if (l.opt) L('  ' + l.opt); L(l.qty + ' x ' + M(l.price), { r: M(l.qty * l.price) }); });
    rule();
    L('Subtotal', { r: M(r.gross) });
    if (r.discount) L('Discount' + (r.discountNote ? ' (' + r.discountNote + ')' : ''), { r: '-' + M(r.discount) });
    L('Service', { r: M(r.service) }); L('Tax', { r: M(r.tax) });
    if (r.tip) L('Tip', { r: M(r.tip) });
    L('TOTAL', { r: M(r.total) + ' ' + (st.currency || ''), bold: 1, size: 34 });
    rule();
    if (r.pre) L('— BILL · NOT A RECEIPT —', { c: 1, bold: 1 });
    else {
      const p = r.pay || {}; L('Paid by', { r: r.method || '' });
      if (p.cash) L('Cash', { r: M(p.cash) }); if (p.card) L('Card', { r: M(p.card) });
      if (p.tendered && p.cash) { L('Received', { r: M(p.tendered) }); L('Change', { r: M(p.change) }); }
    }
    rule(); L(st.receiptFooter || 'Thank you - see you soon!', { c: 1 });
    if (r.etaImg) { out.push({ img: r.etaImg, h: 190 }); L('E-receipt ' + (r.etaNo || ''), { c: 1, size: 18 }); }   // ETA e-receipt QR (only when the venue has e-receipts on)
    return out;
  }
  function raster(ls) {
    const cv = document.createElement('canvas'), pad = 8, g = cv.getContext('2d');
    const font = (o) => `${o.bold ? '700 ' : ''}${o.size || 24}px "Segoe UI", Tahoma, Arial, sans-serif`;
    let h = 12; ls.forEach((o) => (h += o.rule ? 16 : o.img ? o.h + 10 : (o.size || 24) + 10)); cv.width = W; cv.height = h + 40;
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000'; g.textBaseline = 'top';
    const rtl = (s) => /[֐-ࣿ]/.test(s); let y = 8;
    ls.forEach((o) => {
      if (o.rule) { g.fillRect(pad, y + 6, W - pad * 2, 2); y += 16; return; }
      if (o.img) { g.drawImage(o.img, (W - o.h) / 2, y, o.h, o.h); y += o.h + 10; return; }
      g.font = font(o); g.direction = rtl(o.t) ? 'rtl' : 'ltr';
      let t = o.t; while (g.measureText(t).width > W - pad * 2 - (o.r ? 150 : 0) && t.length > 4) t = t.slice(0, -2);
      if (o.c) { g.textAlign = 'center'; g.fillText(t, W / 2, y); }
      else { g.textAlign = rtl(t) ? 'right' : 'left'; g.fillText(t, rtl(t) ? W - pad : pad, y); }
      if (o.r) { g.direction = 'ltr'; g.textAlign = 'right'; g.fillText(o.r, W - pad, y); }
      y += (o.size || 24) + 10;
    });
    return g.getImageData(0, 0, cv.width, y + 10);
  }
  function toEscpos(img) {
    const w = img.width, h = img.height, bytes = w >> 3, d = new Uint8Array(bytes * h);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4, lum = img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11;
      if (lum < 150) d[yy * bytes + (xx >> 3)] |= 0x80 >> (xx & 7);
    }
    const parts = [INIT];
    for (let y0 = 0; y0 < h; y0 += 255) {      // GS v 0 in bands keeps cheap printers' buffers happy
      const n = Math.min(255, h - y0);
      parts.push(B(0x1d, 0x76, 0x30, 0x00, bytes & 255, bytes >> 8, n, 0), d.subarray(y0 * bytes, (y0 + n) * bytes));
    }
    return cat(...parts);
  }

  /* ---------- transports ---------- */
  async function chunked(send, data) { for (let i = 0; i < data.length; i += 4096) await send(data.subarray(i, i + 4096)); }
  async function openUSB(dev) {
    await dev.open(); if (!dev.configuration) await dev.selectConfiguration(1);
    let ep = null, ifc = null;
    for (const i of dev.configuration.interfaces) for (const a of i.alternates) if (a.interfaceClass === 7 || !ifc) { const e = a.endpoints.find((x) => x.direction === 'out'); if (e) { ep = e; ifc = i; if (a.interfaceClass === 7) break; } }
    if (!ep) throw new Error('No printer endpoint found on this USB device');
    await dev.claimInterface(ifc.interfaceNumber);
    return { kind: 'usb', name: dev.productName || 'USB printer', send: (b) => chunked((c) => dev.transferOut(ep.endpointNumber, c), b), close: () => dev.close().catch(() => {}) };
  }
  async function openSerial(port) {
    await port.open({ baudRate: 115200 });
    const wr = port.writable.getWriter();
    return { kind: 'serial', name: 'Serial / Bluetooth printer', send: (b) => chunked((c) => wr.write(c), b), close: async () => { try { wr.releaseLock(); await port.close(); } catch {} } };
  }
  const remember = (k) => { try { localStorage.setItem(KEY, k); } catch {} };
  async function pair(kind) {
    try {
      if (link) { await link.close(); link = null; }
      if (kind === 'usb') { if (!navigator.usb) throw new Error('WebUSB needs Chrome or Edge'); link = await openUSB(await navigator.usb.requestDevice({ filters: [{ classCode: 7 }, { vendorId: 0x04b8 }, { vendorId: 0x0519 }, { vendorId: 0x0fe6 }, { vendorId: 0x0dd4 }, { vendorId: 0x1fc9 }, { vendorId: 0x0483 }, { vendorId: 0x28e9 }, { vendorId: 0x0416 }] })); }
      else { if (!navigator.serial) throw new Error('WebSerial needs Chrome or Edge'); link = await openSerial(await navigator.serial.requestPort()); }
      remember(kind); return link;
    } catch (e) { link = null; throw e; }
  }
  // reconnect silently to a device the browser already has permission for
  async function auto() {
    try {
      const k = localStorage.getItem(KEY);
      if (k === 'usb' && navigator.usb) { const d = (await navigator.usb.getDevices())[0]; if (d) link = await openUSB(d); }
      if (k === 'serial' && navigator.serial) { const p = (await navigator.serial.getPorts())[0]; if (p) link = await openSerial(p); }
    } catch { link = null; }
    return link;
  }
  const sendRaw = async (bytes) => { if (!link) await auto(); if (!link) throw new Error('no printer'); await link.send(bytes); };

  /* ---------- public ---------- */
  async function print(r, opts = {}) {
    // opts.kick: pop the drawer after printing (cash sales); opts.cfg: restaurant settings for the header
    const cfg = opts.cfg || (App.config && App.config.settings) || {};
    try {
      await sendRaw(cat(toEscpos(raster(lines(r, cfg))), FEED(4), CUT, opts.kick ? KICK1 : new Uint8Array(0)));
      return 'printer';
    } catch (e) {
      if (e.message !== 'no printer') throw e;
      App.printHTML(App.receiptHTML(r));
      return 'browser';
    }
  }
  async function kick() { await sendRaw(cat(KICK1, KICK2)); }
  async function test() {
    const demo = { label: 'TEST', at: Date.now(), items: [{ name: 'Test line · سطر تجريبي', qty: 1, price: 10 }], gross: 10, service: 0, tax: 0, total: 10, method: 'test', pay: {}, pre: true };
    return print(demo, { kick: false });
  }
  return { pair, auto, print, kick, test, get linked() { return link ? link.name : ''; }, supported: () => !!(navigator.usb || navigator.serial) };
})();
