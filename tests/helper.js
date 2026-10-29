// Test harness: boots the real server on a random port with a throwaway DATA_DIR on drive A:.
// mode 'ws'   = local mode (in-memory tenants, websockets available)
// mode 'rpc'  = STATELESS=1 (Vercel-like: every request reloads the tenant, compare-and-swap commits, polling)
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const TMP = process.env.TEST_TMP || 'A:/Apps and Compilers/_work/tmp/elmenue-tests';

const freePort = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function start(mode = 'ws', opts = {}) {
  const port = await freePort(), dir = path.join(TMP, `${mode}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`);
  fs.mkdirSync(dir, { recursive: true });
  const env = { ...process.env, PORT: String(port), DATA_DIR: dir, SUPER_EMAIL: 'super@test.dev', SUPER_PASSWORD: 'SuperPass123!', NODE_ENV: '', ...(mode === 'rpc' ? { STATELESS: '1' } : {}), ...(opts.env || {}) };
  delete env.VERCEL; delete env.SUPABASE_URL; delete env.SUPABASE_KEY; delete env.DATABASE_URL;
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; proc.stdout.on('data', (d) => (log += d)); proc.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/health'); if (r.ok) break; } catch {} await wait(150); if (i === 79) throw new Error('server did not start:\n' + log); }
  const J = async (method, url, body, token, extra = {}) => {
    const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra }, body: body === undefined || body === null ? undefined : JSON.stringify(body) });
    const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { _text: text }; }
    return { s: r.status, j, h: r.headers };
  };
  const sup = (await J('POST', '/api/super/login', { email: 'super@test.dev', password: 'SuperPass123!' })).j.token;
  let n = 0;
  // creates a tenant of a plan; returns helpers bound to it
  async function tenant(plan = 'vip', o = {}) {
    const slug = (o.slug || `t${plan.slice(0, 3)}${Date.now().toString(36).slice(-4)}${n++}`).toLowerCase();
    const c = await J('POST', '/api/super/tenants', { name: o.name || 'Test ' + slug, slug, plan, email: `${slug}@test.dev`, password: 'Owner123!', demo: !!o.demo }, sup);
    if (c.s !== 200) throw new Error('tenant create failed ' + JSON.stringify(c.j));
    const admin = (await J('POST', `/api/r/${slug}/login`, { role: 'admin', email: `${slug}@test.dev`, password: 'Owner123!' })).j.token;
    const T = { slug, admin, pin: c.j.pin, u: (p) => `/api/r/${slug}${p}` };
    T.api = (m, p, b, tok) => J(m, T.u(p), b, tok === undefined ? admin : tok);
    await T.api('POST', '/settings', { requireKey: false });   // tests join tables without the printed key
    T.staff = async (role, name, pin) => { await T.api('POST', '/staff', { name, role, pin }); const r = await J('POST', T.u('/login'), { role, pin }); return r.j.token; };
    // one rpc call: role 'captain' | 'kitchen' | 'cashier' | 'admin' with its token, or a guest object
    T.rpc = (role, token, msg, extra = {}) => J('POST', T.u('/rpc'), { join: { role, token, ...extra }, msg, since: -1 }, token);
    T.guest = (tableNumber, name = 'Guest') => {
      const g = { role: 'customer', tableNumber, name, avatar: '🙂', guestId: null, key: '' };
      const call = async (msg) => { const r = await J('POST', T.u('/rpc'), { join: g, msg }); if (r.j.guestId) g.guestId = r.j.guestId; return r; };
      return { g, call, join: () => call(null) };
    };
    T.state = async (tok) => (await T.rpc('captain', tok, null)).j.state;
    return T;
  }
  const stop = async () => { proc.kill(); await wait(200); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  return { base, port, dir, J, sup, tenant, stop, log: () => log, mode };
}
module.exports = { start, wait, ROOT };
