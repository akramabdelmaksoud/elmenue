// Bridge to Sellbird (github.com/ethanplusai/sellbird), the open-source outreach agent that finds cafés and emails them.
//  - Sellbird -> TableTab: signed webhooks (lead.created, reply.received, meeting.booked, stage.changed). Stored for the super admin, and the owner is emailed on replies / meetings.
//  - TableTab -> Sellbird: a read-only feed of the website's contact-form leads (bearer token), pulled by scripts/tabletab_leads.py on the Sellbird side.
const crypto = require('crypto');

const TOL = 5 * 60;   // seconds a signature stays valid
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// Sellbird-Signature: t=<unix>,v1=<hex hmac-sha256 of "<t>.<raw body>">
function verify(secret, raw, header, now = Date.now()) {
  if (!secret || typeof raw !== 'string' || !header) return false;
  const p = {}; String(header).split(',').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) p[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); });
  const t = +p.t; if (!t || Math.abs(now / 1000 - t) > TOL || !p.v1) return false;
  return eq(crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex'), p.v1);
}

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const TYPES = ['lead.created', 'reply.received', 'meeting.booked', 'stage.changed', 'test.ping'];

// Keep what the super admin needs, not whatever a sender chose to include.
function slim(ev) {
  const d = ev.data || {}, p = d.person || {};
  return { id: clip(ev.id, 80), type: clip(ev.type, 30), at: Date.now(), sentAt: clip(ev.created_at, 40),
    person: { name: clip(p.name, 80), email: clip(p.email, 120), company: clip(p.company, 100), stage: clip(p.stage, 30), source: clip(p.source, 30) },
    note: clip(ev.type === 'reply.received' ? d.text : ev.type === 'meeting.booked' ? (d.meeting && d.meeting.starts_at) || '' : ev.type === 'stage.changed' ? (d.from || '') + ' -> ' + (d.to || '') + (d.reason ? ' (' + d.reason + ')' : '') : d.found_via || '', 600),
    intent: clip(d.intent, 30), needsYou: !!d.needs_you };
}

// Returns { code, body }. `store` has getAux/putAux, `notify(subject, text)` emails the owner (may be a no-op).
async function receive({ store, secret, raw, headers, notify }) {
  if (!secret) return { code: 503, body: { error: 'SELLBIRD_WEBHOOK_SECRET is not set' } };
  if (!verify(secret, raw, headers['sellbird-signature'])) return { code: 401, body: { error: 'bad signature' } };
  let ev; try { ev = JSON.parse(raw); } catch { return { code: 400, body: { error: 'bad json' } }; }
  if (!ev || !TYPES.includes(ev.type) || !ev.id) return { code: 200, body: { ok: true, ignored: true } };   // unknown event types are acknowledged so Sellbird does not retry them
  const cur = (await store.getAux('sellbird')) || { events: [], seen: [], counts: {} };
  if ((cur.seen || []).includes(ev.id)) return { code: 200, body: { ok: true, duplicate: true } };
  const s = slim(ev); cur.events = [s].concat(cur.events || []).slice(0, 200); cur.seen = (cur.seen || []).concat(ev.id).slice(-400);
  cur.counts = cur.counts || {}; cur.counts[ev.type] = (cur.counts[ev.type] || 0) + 1; cur.lastAt = s.at;
  await store.putAux('sellbird', cur);
  try {
    if (ev.type === 'meeting.booked') await notify('Sellbird: meeting booked with ' + (s.person.name || s.person.email), `${s.person.name} <${s.person.email}> ${s.person.company ? '(' + s.person.company + ')' : ''}\nMeeting: ${s.note || 'time not set'}`);
    else if (ev.type === 'reply.received' && (s.needsYou || /interest|positive|meeting|question/i.test(s.intent))) await notify('Sellbird: reply from ' + (s.person.name || s.person.email), `${s.person.name} <${s.person.email}> ${s.person.company ? '(' + s.person.company + ')' : ''}\nIntent: ${s.intent || 'unknown'}\n\n${s.note}`);
  } catch (e) { console.error('sellbird notify:', e.message); }
  return { code: 200, body: { ok: true } };
}

// Feed of website contact-form leads for Sellbird. `since` is a ms timestamp; oldest first, at most 100.
function feed(rows, since) {
  return (rows || []).filter((m) => m.at > (+since || 0)).sort((a, b) => a.at - b.at).slice(0, 100)
    .map((m) => ({ id: m.id, at: m.at, name: m.name, email: m.email, phone: m.phone || '', company: m.place || '', message: m.message || '', lang: m.lang || 'en' }));
}

module.exports = { verify, receive, feed, eq, TYPES };
