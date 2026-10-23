const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let SECRET = process.env.SECRET;
if (!SECRET) {
  const f = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), '.secret');
  try { SECRET = fs.readFileSync(f, 'utf8'); } catch { SECRET = crypto.randomBytes(32).toString('hex'); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, SECRET); }
}
const b64 = (b) => Buffer.from(b).toString('base64url');
const sig = (p) => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
exports.sign = (role, slug, days = 14, extra = {}) => { const p = b64(JSON.stringify({ r: role, s: slug, e: Date.now() + days * 864e5, ...extra })); return p + '.' + sig(p); };
exports.verify = (tok) => {
  if (!tok || typeof tok !== 'string') return null;
  const [p, s] = tok.split('.'); if (!p || !s) return null;
  const a = Buffer.from(sig(p)), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return d.e > Date.now() ? d : null; } catch { return null; }
};
exports.hash = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); };
exports.check = (pw, h) => { if (!h) return false; const [salt, hex] = h.split(':'); const x = crypto.scryptSync(String(pw), salt, 32); const y = Buffer.from(hex, 'hex'); return x.length === y.length && crypto.timingSafeEqual(x, y); };
exports.randomPassword = () => crypto.randomBytes(6).toString('base64url');
exports.pin = () => String(crypto.randomInt(1000, 9999));
// simple login throttling
const fails = {};
exports.throttled = (key) => { const f = fails[key]; return f && f.n >= 8 && Date.now() - f.t < 10 * 60000; };
exports.fail = (key) => { const f = (fails[key] ||= { n: 0, t: 0 }); f.n++; f.t = Date.now(); };
exports.ok = (key) => delete fails[key];
