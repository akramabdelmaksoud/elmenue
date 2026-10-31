// Tiny in-memory rate limiter (one process = one memory, which matches how elmenue runs).
// RATE_MULT scales every limit without code changes (e.g. RATE_MULT=0.5 stricter, RATE_MULT=10 for load tests).
const MULT = +process.env.RATE_MULT || 1;

function rateLimit({ windowMs = 60000, max = 60, key = (req) => req.ip, message = 'Too many requests, please slow down' } = {}) {
  const hits = new Map(), limit = Math.max(1, Math.round(max * MULT));
  setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset <= n) hits.delete(k); }, 60000).unref();
  return (req, res, next) => {
    const k = String(key(req)), n = Date.now();
    let h = hits.get(k); if (!h || h.reset <= n) { h = { n: 0, reset: n + windowMs }; hits.set(k, h); }
    if (++h.n > limit) { res.set('Retry-After', String(Math.ceil((h.reset - n) / 1000))); return res.status(429).json({ error: message }); }
    next();
  };
}

// For WebSocket messages: const ok = messageBudget(60, 10000); if (!ok()) ignore the message.
function messageBudget(max, windowMs) {
  let n = 0, reset = Date.now() + windowMs; const limit = Math.max(1, Math.round(max * MULT));
  return () => { const t = Date.now(); if (t >= reset) { n = 0; reset = t + windowMs; } return ++n <= limit; };
}
module.exports = { rateLimit, messageBudget };
