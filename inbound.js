// Mail that arrives at the domain (info@, support@, ...): Resend receives it and calls our webhook, we forward it to the owner's own inbox.
const crypto = require('crypto');

// Svix signature check (Resend signs webhooks with Svix): HMAC-SHA256 over "<id>.<timestamp>.<raw body>" with the base64 key after "whsec_".
function verifySvix(secret, h, raw, now = Date.now()) {
  const id = h['svix-id'], ts = h['svix-timestamp'], sig = h['svix-signature'];
  if (!secret || !id || !ts || !sig || !raw) return false;
  if (Math.abs(now / 1000 - Number(ts)) > 300) return false;   // replayed or very old
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const want = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest();
  return String(sig).split(' ').some((p) => { const [v, b] = p.split(','); if (v !== 'v1' || !b) return false; const got = Buffer.from(b, 'base64'); return got.length === want.length && crypto.timingSafeEqual(got, want); });
}

const api = (key, path, init) => fetch('https://api.resend.com' + path, { ...init, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...((init && init.headers) || {}) } });
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Fetch the full message and send it on. The forward comes from our own verified address, replies go to the real sender,
// and the subject carries the address it was sent to so Gmail filters can sort it.
async function forward(key, ev, { to, from }) {
  const d = ev.data || {}, r = await api(key, '/emails/receiving/' + encodeURIComponent(d.email_id));
  if (!r.ok) throw new Error('retrieve ' + r.status);
  const m = await r.json(), attachments = [];
  if ((m.attachments || []).length) {
    const l = await api(key, '/emails/receiving/' + encodeURIComponent(d.email_id) + '/attachments'); if (!l.ok) throw new Error('attachments ' + l.status);
    for (const a of (await l.json()).data || []) {
      const f = await fetch(a.download_url);
      if (f.ok) attachments.push({ filename: a.filename, content: Buffer.from(await f.arrayBuffer()).toString('base64'), ...(a.content_id ? { content_id: a.content_id } : {}), ...(a.content_type ? { content_type: a.content_type } : {}) });
    }
  }
  const rcpt = (m.received_for && m.received_for[0]) || (m.to && m.to[0]) || '', alias = String(rcpt).split('@')[0] || 'mail';
  const body = { from, to: [to], reply_to: m.from || d.from, subject: `[${alias}@] ${m.subject || d.subject || '(no subject)'}`, attachments };
  const note = `Sent to ${rcpt} by ${m.from || d.from}`;
  if (m.html) body.html = `<p style="color:#667;font:13px sans-serif;border-bottom:1px solid #ddd;padding-bottom:8px">${esc(note)}</p>` + m.html;
  else body.text = note + '\n\n' + (m.text || '');
  const s = await api(key, '/emails', { method: 'POST', body: JSON.stringify(body) });
  if (!s.ok) throw new Error('send ' + s.status + ' ' + (await s.text()).slice(0, 200));
  return true;
}
module.exports = { verifySvix, forward };
