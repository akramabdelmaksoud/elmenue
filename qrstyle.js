// Restaurant-style table QR: rounded dots, glass-icon finder squares, a table-and-chairs badge in the middle,
// forks and glasses down the sides and a caption above and below. Drawn as SVG from the raw QR matrix.
// Error correction H (30%) so the centre badge can cover modules and phones still read it.
const QRCode = require('qrcode');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const f = (n, d = 3) => +n.toFixed(d);

// finder square: rounded ring plus a solid glass for the 3x3 centre. Kept close to the square shape scanners look for:
// gentle corners, a glass barely tapered, and only a thin waterline of white (an outlined, open glass stops phones finding the corner).
const FT = { ro: 1.5, ri: 0.85, taper: 0.28, water: 0 };
function finder(x, y, ink) {
  const { ro, ri, taper, water } = FT, rr = (X, Y, w, r) => `M${f(X + r)} ${f(Y)}h${f(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${f(w - 2 * r)}a${r} ${r} 0 0 1-${r} ${r}h${f(2 * r - w)}a${r} ${r} 0 0 1-${r}-${r}v${f(2 * r - w)}a${r} ${r} 0 0 1 ${r}-${r}z`;
  const ring = `<path fill="${ink}" fill-rule="evenodd" d="${rr(x, y, 7, ro)}${rr(x + 1, y + 1, 5, ri)}"/>`;
  const gx = x + 2, gy = y + 2;
  const glass = `<path fill="${ink}" stroke="${ink}" stroke-width=".16" stroke-linejoin="round" d="M${f(gx + 0.08)} ${f(gy + 0.08)}L${f(gx + 2.92)} ${f(gy + 0.08)}L${f(gx + 2.92 - taper)} ${f(gy + 2.92)}L${f(gx + 0.08 + taper)} ${f(gy + 2.92)}Z"/>`
    + (water ? `<path fill="none" stroke="#fff" stroke-width="${water}" stroke-linecap="round" d="M${f(gx + 0.4)} ${f(gy + 0.62)}Q${f(gx + 1.5)} ${f(gy + 0.47)} ${f(gx + 2.6)} ${f(gy + 0.62)}"/>` : '');
  return ring + glass;
}

// side decorations, drawn in a 1x1 box at (x,y) scaled by s
const fork = (x, y, s, ink) => `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})" fill="none" stroke="${ink}" stroke-width=".09" stroke-linecap="round"><path d="M.5 .45V1M.3 0V.3Q.3 .45 .5 .45Q.7 .45 .7 .3V0M.5 0V.3"/></g>`;
const glassIcon = (x, y, s, ink) => `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})"><path fill="none" stroke="${ink}" stroke-width=".08" stroke-linejoin="round" d="M.12 .05H.88L.8 .95H.2Z"/><path fill="${ink}" d="M.15 .45H.85L.8 .95H.2Z"/></g>`;

// centre badge, traced from the reference artwork: a table (thick top, a bar under it, two hollow T legs) with fork,
// plate and glass on it and a curved-back chair either side. Drawn in the artwork's own units: circle radius 468,
// centred on (465, 490); the right chair is the left one mirrored.
const BADGE_R = 468;
const chair = (ink) => `<g fill="none" stroke="${ink}" stroke-linejoin="round">`
  + `<path stroke-width="28" stroke-linecap="round" d="M116 356Q124 468 160 540Q170 560 196 560H286"/>`   // back + seat
  + `<path stroke-width="16" stroke-linecap="round" d="M142 368Q150 462 182 508Q192 521 214 521H276Q297 521 297 541"/>`   // cushion line
  + `<path stroke-width="26" d="M287 560V695M168 570L136 695"/></g>`;   // front and back legs
const badgeIcon = (ink) => `<g fill="${ink}">`
  + `<rect x="212" y="397" width="506" height="22"/>`   // table top
  + `<rect x="212" y="440" width="248" height="22"/><rect x="470" y="440" width="248" height="22"/>`   // bar under the top
  + `<path fill-rule="evenodd" d="M323 462H397V695H323ZM350 462H372V672H350Z"/><path fill-rule="evenodd" d="M533 462H607V695H533ZM558 462H580V672H558Z"/>`   // hollow T legs
  + `<path d="M354 322h5v24h4v-24h5v24h4v-24h5v28q0 7-7 8v30h-8v-30q-8-1-8-8z"/>`   // fork
  + `<path d="M383 361H548Q533 384 506 387H425Q398 384 383 361Z"/>`   // plate
  + `<path fill="none" stroke="${ink}" stroke-width="7" stroke-linejoin="round" d="M564 325H611L606 384H569Z"/><path d="M567 350H608L606 384H569Z"/>`   // glass: the drink fills it to the walls (a ring around a dark centre would look like a QR corner to a scanner)
  + `</g>${chair(ink)}<g transform="translate(930 0) scale(-1 1)">${chair(ink)}</g>`;

function tableQrSvg(text, opts = {}) {
  const ink = opts.ink || '#111111', bg = opts.bg || '#ffffff';
  const top = esc(String(opts.top == null ? 'SCAN TO ORDER' : opts.top).slice(0, 40));
  const bottom = esc(String(opts.bottom == null ? 'VIEW MENU' : opts.bottom).slice(0, 40));
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' }), N = qr.modules.size, M = qr.modules.data;
  const PX = 9, PY = 8, W = N + PX * 2, H = N + PY * 2;   // quiet zone 4+ modules, decorations beyond it
  const cx = N / 2, cy = N / 2, R = Math.max(4.2, N * 0.165);   // badge radius in modules
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  // dark module that is drawn as a dot (finder squares are drawn separately, the badge clears the middle)
  const on = (r, c) => r >= 0 && c >= 0 && r < N && c < N && M[r * N + c] && !inFinder(r, c) && Math.hypot(c + 0.5 - cx, r + 0.5 - cy) >= R + 0.6;
  // rounded dots; neighbours are joined into bars so the dark runs stay unbroken (separate dots with gaps make scanners misread)
  const g = 0.06, s = 1 - 2 * g, k0 = 0.24;
  let dots = '';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (!on(r, c)) continue;
    const x = PX + c, y = PY + r;
    dots += `M${f(x + g + k0)} ${f(y + g)}h${f(s - 2 * k0)}a${k0} ${k0} 0 0 1 ${k0} ${k0}v${f(s - 2 * k0)}a${k0} ${k0} 0 0 1-${k0} ${k0}h${f(2 * k0 - s)}a${k0} ${k0} 0 0 1-${k0}-${k0}v${f(2 * k0 - s)}a${k0} ${k0} 0 0 1 ${k0}-${k0}z`;
    const rt = on(r, c + 1), dn = on(r + 1, c);
    if (rt) dots += `M${f(x + 0.5)} ${f(y + g)}h1v${f(s)}h-1z`;
    if (dn) dots += `M${f(x + g)} ${f(y + 0.5)}h${f(s)}v1h${f(-s)}z`;
    if (rt && dn && on(r + 1, c + 1)) dots += `M${f(x + 0.5)} ${f(y + 0.5)}h1v1h-1z`;
  }
  const finders = finder(PX, PY, ink) + finder(PX + N - 7, PY, ink) + finder(PX, PY + N - 7, ink);
  const k = R / BADGE_R, ringW = 28 * k;
  const badge = `<circle cx="${f(PX + cx)}" cy="${f(PY + cy)}" r="${f(R - ringW / 2)}" fill="${bg}" stroke="${ink}" stroke-width="${f(ringW)}"/>`
    + `<g transform="translate(${f(PX + cx)} ${f(PY + cy)}) scale(${f(k, 5)}) translate(-465 -490)">${badgeIcon(ink)}</g>`;
  // side lanes: fork / glass alternating, sitting well outside the quiet zone
  let deco = '';
  const n = Math.max(3, Math.round(N / 7)), lx = PX - 5.6, rx = PX + N + 4.1;
  for (let i = 0; i < n; i++) {
    const y = PY + 9 + (i * (N - 16)) / Math.max(1, n - 1);
    deco += (i % 2 ? glassIcon(lx + 0.1, y, 1.3, ink) : fork(lx, y - 0.4, 2.2, ink));
    deco += (i % 2 ? fork(rx, y - 0.4, 2.2, ink) : glassIcon(rx + 0.1, y, 1.3, ink));
  }
  const font = `font-family="Georgia,'Times New Roman',serif" font-weight="700" font-style="italic" text-anchor="middle" fill="${ink}"`;
  const fs = Math.max(2.2, N * 0.068);
  const txt = (top ? `<text x="${f(W / 2)}" y="${f(PY - 3.2)}" font-size="${f(fs)}" letter-spacing=".12" ${font}>${top}</text>` : '')
    + (bottom ? `<text x="${f(W / 2)}" y="${f(PY + N + 3.2 + fs * 0.75)}" font-size="${f(fs)}" letter-spacing=".12" ${font}>${bottom}</text>` : '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 20}" height="${H * 20}" shape-rendering="geometricPrecision">`
    + `<rect width="${W}" height="${H}" fill="${bg}"/><path fill="${ink}" d="${dots}"/>${finders}${badge}${deco}${txt}</svg>`;
}

module.exports = { tableQrSvg, _FT: FT };
