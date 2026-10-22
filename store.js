// Persistence: Supabase REST (SUPABASE_URL + SUPABASE_SECRET_KEY), Postgres (DATABASE_URL), or local JSON files.
// One JSON document per tenant.
const fs = require('fs');
const path = require('path');
const DIR = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'tenants');
let pool = null;
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SECRET_KEY || '';
const sb = !!(SB_URL && SB_KEY);

const SETUP_SQL = `create table if not exists public.tenants (id text primary key, doc jsonb not null, updated_at timestamptz default now());
alter table public.tenants enable row level security;`;

async function rest(method, qs, body, extra = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/tenants${qs}`, {
    method, headers: { apikey: SB_KEY, 'Content-Type': 'application/json', ...extra }, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) { const t = await r.text(); const e = new Error(`Supabase ${r.status}: ${t}`); e.status = r.status; throw e; }
  return r.status === 204 ? null : r.json().catch(() => null);
}

async function init() {
  if (sb) {
    try { await rest('GET', '?select=id&limit=1'); }
    catch (e) { throw new Error(`Supabase table missing or key invalid (${e.message}).\nRun this once in Supabase → SQL Editor:\n\n${SETUP_SQL}\n`); }
    console.log('  storage: Supabase');
  } else if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false } });
    await pool.query('create table if not exists tenants (id text primary key, doc jsonb not null, updated_at timestamptz default now())');
    console.log('  storage: Postgres');
  } else { fs.mkdirSync(DIR, { recursive: true }); console.log('  storage: local files (data/tenants) — not suitable for hosting'); }
}
async function loadAll() {
  if (sb) return ((await rest('GET', '?select=doc')) || []).map((r) => r.doc);
  if (pool) return (await pool.query('select doc from tenants')).rows.map((r) => r.doc);
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } }).filter(Boolean);
}
const timers = {};
function save(rec) {
  clearTimeout(timers[rec.id]);
  timers[rec.id] = setTimeout(() => {
    if (sb) rest('POST', '', { id: rec.id, doc: rec, updated_at: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates,return=minimal' }).catch((e) => console.error('save failed', e.message));
    else if (pool) pool.query('insert into tenants (id, doc, updated_at) values ($1,$2,now()) on conflict (id) do update set doc=$2, updated_at=now()', [rec.id, JSON.stringify(rec)]).catch((e) => console.error('save failed', e.message));
    else fs.writeFile(path.join(DIR, rec.id + '.json'), JSON.stringify(rec), () => {});
  }, 1500);
}
async function remove(id) {
  if (sb) return rest('DELETE', `?id=eq.${encodeURIComponent(id)}`, null, { Prefer: 'return=minimal' });
  if (pool) await pool.query('delete from tenants where id=$1', [id]);
  else fs.rmSync(path.join(DIR, id + '.json'), { force: true });
}
module.exports = { init, loadAll, save, remove };
