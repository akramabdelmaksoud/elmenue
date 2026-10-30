#!/usr/bin/env node
// Move all restaurants from option B (Vercel / stateless, Supabase REST) to option C (own server, WebSocket mode, Postgres).
//
//   SRC_SUPABASE_URL=https://xxxx.supabase.co SRC_SUPABASE_SECRET_KEY=... \
//   DATABASE_URL=postgres://...   node scripts/migrate-b-to-c.js            # dry run: only reports what it would do
//                                 node scripts/migrate-b-to-c.js --commit   # writes into the target database
//
// What differs between the two modes: B keeps each restaurant's order history in separate "aux:hist-<id>" rows, C keeps it inside the
// restaurant record (data.history). Image blobs ("aux:blob-*") are identical in both and are copied as they are.
// Run it with the B site in maintenance (or at a quiet hour) and stop the B site before switching DNS: changes made after the copy are not carried over.
// The source is only READ. Rows already in the target are overwritten (same id), so a second run is safe.
const { Pool } = require('pg');

// Pure conversion, covered by tests/migrate.test.js
function transform(rec, histRows) {
  const out = JSON.parse(JSON.stringify(rec));
  delete out._ver;
  out.data = out.data || {};
  const have = Array.isArray(out.data.history) ? out.data.history : [];
  out.data.history = have.concat(histRows || []).sort((a, b) => (a.closedAt || 0) - (b.closedAt || 0));
  return out;
}

async function rest(url, key, qs) {
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/tenants${qs}`, { headers: { apikey: key } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  return r.json();
}

async function main() {
  const commit = process.argv.includes('--commit');
  const { SRC_SUPABASE_URL: url, SRC_SUPABASE_SECRET_KEY: key, DATABASE_URL: dst } = process.env;
  if (!url || !key || !dst) { console.error('Set SRC_SUPABASE_URL, SRC_SUPABASE_SECRET_KEY and DATABASE_URL (see the header of this file).'); process.exit(2); }

  const recs = (await rest(url, key, '?select=id,doc&id=not.like.aux:*')).map((r) => r.doc);
  const aux = await rest(url, key, '?select=id,doc&id=like.aux:*');
  const hist = new Map(aux.filter((a) => a.id.startsWith('aux:hist-')).map((a) => [a.id.slice(9), (a.doc && a.doc.rows) || []]));
  const blobs = aux.filter((a) => a.id.startsWith('aux:blob-'));
  console.log(`Source: ${recs.length} restaurants, ${hist.size} history sets, ${blobs.length} images`);
  for (const r of recs) console.log(`  ${r.slug.padEnd(24)} history rows: ${(hist.get(r.id) || []).length}`);
  if (!commit) { console.log('\nDry run only. Add --commit to write to the target database.'); return; }

  const pool = new Pool({ connectionString: dst, ssl: process.env.PGSSL === 'off' ? false : { rejectUnauthorized: false } });
  try {
    const enc = (await pool.query('show server_encoding')).rows[0].server_encoding;
    if (enc !== 'UTF8') throw new Error('target database must be UTF8, is ' + enc);
    await pool.query('create table if not exists tenants (id text primary key, doc jsonb not null, ver bigint not null default 0, updated_at timestamptz default now())');
    const up = (id, doc) => pool.query('insert into tenants (id, doc, updated_at) values ($1,$2,now()) on conflict (id) do update set doc=$2, updated_at=now()', [id, JSON.stringify(doc)]);
    for (const r of recs) await up(r.id, transform(r, hist.get(r.id)));
    for (const b of blobs) await up(b.id, b.doc);
    const n = (await pool.query("select count(*) from tenants where id not like 'aux:%'")).rows[0].count;
    console.log(`\nDone. Target now holds ${n} restaurants. Start the C server, check each restaurant, then switch DNS.`);
  } finally { await pool.end(); }
}

module.exports = { transform };
if (require.main === module) main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
