// Persistence: Postgres (DATABASE_URL) in production, JSON files locally. One JSON document per tenant.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, 'data', 'tenants');
let pool = null;

async function init() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false } });
    await pool.query('create table if not exists tenants (id text primary key, doc jsonb not null, updated_at timestamptz default now())');
  } else fs.mkdirSync(DIR, { recursive: true });
}
async function loadAll() {
  if (pool) return (await pool.query('select doc from tenants')).rows.map((r) => r.doc);
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; } }).filter(Boolean);
}
const timers = {};
function save(rec) {
  clearTimeout(timers[rec.id]);
  timers[rec.id] = setTimeout(() => {
    if (pool) pool.query('insert into tenants (id, doc, updated_at) values ($1,$2,now()) on conflict (id) do update set doc=$2, updated_at=now()', [rec.id, JSON.stringify(rec)]).catch((e) => console.error('save failed', e.message));
    else fs.writeFile(path.join(DIR, rec.id + '.json'), JSON.stringify(rec), () => {});
  }, 1000);
}
async function remove(id) {
  if (pool) await pool.query('delete from tenants where id=$1', [id]);
  else fs.rmSync(path.join(DIR, id + '.json'), { force: true });
}
module.exports = { init, loadAll, save, remove };
