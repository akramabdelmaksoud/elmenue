// Who may do what. Three levels above the floor staff:
//   owner       (token role "admin")  everything, including billing of the plan, payment keys, the owner account and the team itself
//   manager     (branch manager)      runs ONE branch: menu, floor, staff, stock, billing, reports. Cannot touch payment keys, the plan, the owner account or other branches
//   opmanager   (operations manager)  inventory, billing, reports and loss controls, attendance; approves exceptional voids and discounts with an approval PIN
// Floor staff (captain, kitchen, cashier, driver) sign in with a PIN and only ever reach their own screen.
//
// Every admin route carries a permission. A route that is not listed below needs "owner", so a new route is closed to managers until someone opens it on purpose.
const crypto = require('crypto');

const TEAM = ['manager', 'opmanager'];
const PERMS = {
  manager: new Set(['ui', 'menu', 'tables', 'staff', 'team', 'inventory', 'billing', 'billing_admin', 'reports', 'attendance', 'offers', 'live']),
  opmanager: new Set(['ui', 'inventory', 'billing', 'reports', 'attendance', 'live']),
};
const can = (role, perm) => role === 'admin' || role === 'super' || (!!PERMS[role] && PERMS[role].has(perm));

// [pattern of "METHOD /path", permission]; the first match wins, no match means owner only
const POLICY = [
  [/^\S+ \/(ingredients|stocktake|stocktakes|food-cost|stock-log|suppliers|pos)(\/|$)/, 'inventory'],
  [/^POST \/items\/:id\/adjust$/, 'inventory'],
  [/^PUT \/items\/:id\/recipe$/, 'inventory'],
  [/^\S+ \/(invoice-brand|invoice-logo)$/, 'billing_admin'],
  [/^\S+ \/(invoices|invoice-source)(\/|$)/, 'billing'],
  [/^GET \/(orders|accounting|accounting\.csv|accounting\.xlsx|vat-summary)$/, 'billing'],
  [/^GET \/(report|report\.xlsx|analytics|insights|insights\/staff\.csv|feedback|feedback\/summary|feedback\/export\.csv|upsell\/stats|upsell\/export\.csv|promo\/report|loyalty|gifts|winback)$/, 'reports'],
  [/^PUT \/feedback\/:id$/, 'reports'],
  [/^GET \/ownerreport$/, 'owner'],
  [/^\S+ \/attendance(\.csv|\/|$)/, 'attendance'],
  [/^\S+ \/(staff|screens)(\/|$)/, 'staff'],
  [/^\S+ \/team(\/|$)/, 'team'],
  [/^GET \/limits$/, 'ui'],
  [/^GET \/controls$/, 'reports'],
  [/^GET \/calls$/, 'live'],
  [/^\S+ \/(coupons|offers)(\/|$)/, 'offers'],
  [/^POST \/settings$/, 'ui'],                       // managers may only save the dashboard refresh choice, see teamSettingsOk
  [/^\S+ \/(tables|tables-rekey|layout|qr|carqr)(\/|$)/, 'tables'],
  [/^\S+ \/(logo|bg-image|hero-image|pay-qr)$/, 'owner'],
  [/^\S+ \/(categories|items)(\/|$)/, 'menu'],
  [/^\S+ \/menu\/(ocr|import)/, 'menu'],
];
const permFor = (method, path) => { const k = String(method).toUpperCase() + ' ' + path; for (const [re, p] of POLICY) if (re.test(k)) return p; return 'owner'; };
// the only thing a manager may change through /settings (the owner decides brand, tax, payments and everything else)
const teamSettingsOk = (body) => Object.keys(body || {}).every((k) => k === 'refreshMin');

// ---- usernames, passwords, PINs ----
const RESERVED = ['admin', 'administrator', 'owner', 'root', 'manager', 'operations', 'support', 'system', 'tabletab', 'staff', 'cashier', 'captain', 'kitchen', 'driver', 'super'];
const userProblem = (u) => {
  u = String(u || '');
  if (!/^[a-z][a-z0-9._-]{3,31}$/.test(u)) return 'Username: 4-32 characters, lowercase letters, numbers, dot, dash or underscore, starting with a letter';
  if (RESERVED.includes(u)) return 'That username is reserved. Choose another.';
  return null;
};
const COMMON = ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'iloveyou', 'admin', 'tabletab', 'restaurant', 'cafe', 'coffee', 'monkey', 'dragon', 'football', 'abc123', 'master', 'login', 'egypt', 'cairo', 'dubai', 'emirates', 'ahmed', 'mohamed', 'mohammed'];
const seqRun = (s) => { for (let i = 0; i + 3 < s.length; i++) { const a = s.charCodeAt(i), b = s.charCodeAt(i + 1), c = s.charCodeAt(i + 2), d = s.charCodeAt(i + 3); if ((b - a === 1 && c - b === 1 && d - c === 1) || (a - b === 1 && b - c === 1 && c - d === 1)) return true; } return false; };
// returns a sentence saying what is wrong, or null when the password is strong enough for an account that can see money
const passwordProblem = (pw, ctx = {}) => {
  pw = String(pw == null ? '' : pw);
  if (pw.length < 10) return 'Password must be at least 10 characters';
  if (pw.length > 72) return 'Password is too long (72 characters at most)';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return 'Use both capital and small letters';
  if (!/\d/.test(pw)) return 'Add at least one number';
  if (/(.)\1\1/.test(pw)) return 'Avoid repeating the same character 3 times in a row';
  const low = pw.toLowerCase(), flat = low.replace(/[^a-z0-9]/g, '');
  if (seqRun(flat)) return 'Avoid runs like 1234 or abcd';
  if (COMMON.some((w) => flat.includes(w))) return 'That password contains a very common word. Choose something less guessable.';
  for (const x of [ctx.username, ctx.name, ctx.venue, ctx.email && String(ctx.email).split('@')[0]]) { const v = String(x || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (v.length >= 4 && flat.includes(v)) return 'The password must not contain the username, name or venue name';
  }
  return null;
};
const WORDS = ['coral', 'maple', 'tiger', 'olive', 'amber', 'river', 'lemon', 'falcon', 'cedar', 'pearl', 'sunset', 'harbor', 'violet', 'copper', 'meadow', 'jasmine', 'saffron', 'orchid', 'granite', 'breeze', 'walnut', 'cobalt', 'ember', 'willow', 'lotus', 'mango', 'desert', 'oasis', 'thunder', 'velvet', 'pepper', 'silver'];
// a readable strong password: three words, a number and dashes, for example "Coral-Maple-Tiger-4827"
const generatePassword = () => {
  const w = () => { const x = WORDS[crypto.randomInt(WORDS.length)]; return x[0].toUpperCase() + x.slice(1); };
  for (let i = 0; i < 20; i++) { const p = `${w()}-${w()}-${w()}-${crypto.randomInt(1000, 9999)}`; if (!passwordProblem(p)) return p; }
  return crypto.randomBytes(12).toString('base64url') + 'aA1';
};
// PINs for floor staff: 6 to 10 digits, nothing guessable
const pinProblem = (pin, strict = true) => {
  pin = String(pin == null ? '' : pin);
  if (!/^\d{6,10}$/.test(pin)) return 'PIN must be 6 to 10 digits';
  if (!strict) return null;
  if (/^(\d)\1+$/.test(pin)) return 'That PIN is too easy to guess (all the same digit)';
  if (seqRun(pin)) return 'That PIN is too easy to guess (a run like 1234 or 9876)';
  if (/^(\d{2,4})\1+\d*$/.test(pin) && pin.length >= 6) return 'That PIN repeats a pattern (like 121212 or 123123). Choose another.';
  if (['000000', '123456', '654321', '112233', '121212', '123123', '159753', '147258', '258369', '696969', '202020', '101010', '111222', '123321', '987654', '135790', '246810', '2580258', '1234567890', '0123456789'].includes(pin) || /^(19[5-9]\d|20[0-3]\d)(19[5-9]\d|20[0-3]\d)$/.test(pin)) return 'That PIN is too easy to guess. Choose another.';
  return null;
};

// ---- authenticator-app codes (TOTP, RFC 6238: 6 digits, 30 s) so a stolen password alone is not enough ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (buf) => { let bits = 0, v = 0, o = ''; for (const x of buf) { v = (v << 8) | x; bits += 8; while (bits >= 5) { o += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) o += B32[(v << (5 - bits)) & 31]; return o; };
const unb32 = (str) => { let bits = 0, v = 0; const out = []; for (const ch of String(str).toUpperCase().replace(/[^A-Z2-7]/g, '')) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
const newTotpSecret = () => b32(crypto.randomBytes(20));
const hotp = (secret, step) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', unb32(secret)).update(c).digest(), o = h[19] & 15; return String(((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000).padStart(6, '0'); };
// returns the accepted time step (store it as "last" so a code cannot be used twice) or null
const totpCheck = (secret, code, lastStep = 0, now = Date.now()) => {
  code = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(code) || !secret) return null;
  const cur = Math.floor(now / 30000);
  for (const st of [cur, cur - 1, cur + 1]) if (st > lastStep && crypto.timingSafeEqual(Buffer.from(hotp(secret, st)), Buffer.from(code))) return st;
  return null;
};
const totpUri = (secret, label, issuer = 'TableTab') => `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;

// A fixed hash to compare against when the username does not exist, so a wrong username takes as long as a wrong password
const DUMMY_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90:' + '0'.repeat(64);

module.exports = { newTotpSecret, totpCheck, totpUri, hotp, TEAM, PERMS, can, permFor, teamSettingsOk, userProblem, passwordProblem, generatePassword, pinProblem, DUMMY_HASH, POLICY };
