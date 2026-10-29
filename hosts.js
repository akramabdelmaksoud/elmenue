// Host-based tenant resolution: <slug>.<BASE_DOMAIN> and custom domains -> restaurant slug.
// Pure logic (no Express, no storage) so it is easy to test and to replace.
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'super', 'cname', 'mail', 'smtp', 'ftp', 'static', 'vendor', 'uploads', 'dev', 'staging', 'status', 'health']);
const HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// "https://Menu.Cafe.com:443/x" -> "menu.cafe.com"; '' for empty input; null when it is not a valid hostname.
function normalizeDomain(input) {
  let s = String(input == null ? '' : input).trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  return HOSTNAME.test(s) ? s : null;
}

// load: async () => [{ slug, domain, status }]. Results are cached for ttlMs; clear() forces a reload (call after any change).
function createHostIndex({ base, load, ttlMs = 5000 }) {
  base = normalizeDomain(base) || '';
  let cache = null, at = 0, pending = null;
  async function index() {
    if (cache && Date.now() - at < ttlMs) return cache;
    if (!pending) pending = load().then((recs) => {
      const slugs = new Set(), domains = new Map();
      for (const r of recs) { if (!r || !r.slug) continue; slugs.add(r.slug); const d = normalizeDomain(r.domain); if (d) domains.set(d, r.slug); }
      cache = { slugs, domains }; at = Date.now(); return cache;
    }).finally(() => { pending = null; });
    return pending;
  }
  const label = (host) => (base && host.endsWith('.' + base) ? host.slice(0, -base.length - 1) : null);
  return {
    base,
    clear() { cache = null; },
    // -> { slug } for a restaurant host, { unknown: true } for an unclaimed *.BASE name, null for the platform itself / anything else
    async resolve(host) {
      host = String(host || '').toLowerCase();
      if (!host || host === base) return null;
      const sub = label(host);
      if (sub !== null) {
        if (sub.includes('.') || RESERVED.has(sub)) return null;
        return (await index()).slugs.has(sub) ? { slug: sub } : { unknown: true };
      }
      const slug = (await index()).domains.get(host);
      return slug ? { slug } : null;
    },
    // Should we have a certificate for this host? (Caddy on-demand TLS "ask")
    async known(host) {
      host = String(host || '').toLowerCase();
      if (!normalizeDomain(host)) return false;
      if (host === base || (base && host === 'www.' + base)) return true;
      const r = await this.resolve(host);
      return !!(r && r.slug);
    },
    async domainOwner(domain) { return (await index()).domains.get(domain) || null; },
  };
}
module.exports = { RESERVED, normalizeDomain, createHostIndex };
