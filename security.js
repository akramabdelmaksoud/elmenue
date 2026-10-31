// Security headers. Pure Express middleware; tune with env vars:
//   CSP=report-only (default) | on | off      Content-Security-Policy mode
//   HSTS=off to disable Strict-Transport-Security
// The pages use inline scripts and `new Function` (the in-browser engine), so the policy has to allow them.
const CSP = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com", "img-src 'self' data: blob: https:", "connect-src 'self' ws: wss:",
  "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", "form-action 'self' https:",
].join('; ');

function securityHeaders({ prod }) {
  const mode = (process.env.CSP || 'report-only').toLowerCase();
  return (req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)' });
    if (prod && process.env.HSTS !== 'off' && req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');   // 180 days, no includeSubDomains (custom domains are not ours)
    if (mode === 'on') res.set('Content-Security-Policy', CSP); else if (mode !== 'off') res.set('Content-Security-Policy-Report-Only', CSP);
    next();
  };
}
module.exports = { securityHeaders };
