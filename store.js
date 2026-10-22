// Persistence: Supabase REST (SUPABASE_URL + SUPABASE_SECRET_KEY), Postgres (DATABASE_URL), or local JSON files.
// One JSON document per tenant.
const fs = require('fs');
const path = require('path');
const DIR = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'tenants');
let pool = null;
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SECRET_KEY || '';
const sb = !!(SB_URL && SB_KEY);

const SETUP_SQL = `create table if not exists public.tenants (id text primary key, doc jsonb not null, ver bigint not null default 0, updated_at timestamptz default now());
alter table public.tenants add column if not exists ver bigint not null default 0;
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

// ---------- Versioned records for stateless (serverless) mode ----------
const AUX = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'aux');
const safe = (k) => String(k).replace(/[^a-zA-Z0-9._-]/g, '_');
async function getRec(id) {
  if (sb) { const r = await rest('GET', `?id=eq.${encodeURIComponent(id)}&select=doc,ver`); return r && r[0] ? { rec: r[0].doc, ver: Number(r[0].ver) || 0 } : null; }
  try { const d = JSON.parse(fs.readFileSync(path.join(DIR, safe(id) + '.json'), 'utf8')); return { rec: d, ver: d._ver || 0 }; } catch { return null; }
}
// ver === null creates; otherwise compare-and-swap. Returns false on conflict.
async function putRec(rec, ver) {
  if (sb) {
    if (ver === null) { const r = await rest('POST', '', { id: rec.id, doc: rec, ver: 1 }, { Prefer: 'resolution=ignore-duplicates,return=representation' }); return !!(r && r.length); }
    const r = await rest('PATCH', `?id=eq.${encodeURIComponent(rec.id)}&ver=eq.${ver}`, { doc: rec, ver: ver + 1, updated_at: new Date().toISOString() }, { Prefer: 'return=representation' });
    return !!(r && r.length);
  }
  fs.mkdirSync(DIR, { recursive: true });
  const f = path.join(DIR, safe(rec.id) + '.json');
  const cur = (() => { try { return JSON.parse(fs.readFileSync(f, 'utf8'))._ver || 0; } catch { return null; } })();
  if (cur !== ver) return false;
  fs.writeFileSync(f, JSON.stringify({ ...rec, _ver: (ver || 0) + 1 }));
  return true;
}
async function getAux(key) {
  if (sb) { const r = await rest('GET', `?id=eq.${encodeURIComponent('aux:' + key)}&select=doc`); return r && r[0] ? r[0].doc : null; }
  try { return JSON.parse(fs.readFileSync(path.join(AUX, safe(key) + '.json'), 'utf8')); } catch { return null; }
}
async function putAux(key, doc) {
  if (sb) return rest('POST', '', { id: 'aux:' + key, doc }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
  fs.mkdirSync(AUX, { recursive: true }); fs.writeFileSync(path.join(AUX, safe(key) + '.json'), JSON.stringify(doc));
}
async function getHist(id) { const d = await getAux('hist-' + id); return (d && d.rows) || []; }
async function appendHist(id, rows) { if (!rows.length) return; const cur = await getHist(id); await putAux('hist-' + id, { rows: cur.concat(rows).slice(-5000) }); }
async function putBlob(key, dataUrl) { await putAux('blob-' + key, { d: dataUrl }); }
async function getBlob(key) { const d = await getAux('blob-' + key); return d ? d.d : null; }
module.exports = { init, loadAll, save, remove, getRec, putRec, getHist, appendHist, putBlob, getBlob };
