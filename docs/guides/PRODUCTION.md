# Production architecture and how to change it

```
phone ──HTTPS──> Caddy (80/443, certificates) ──> app (node server.js, port 3000, WebSocket mode) ──> Supabase Postgres (Frankfurt)
                    └─ asks  GET /internal/tls-ask  before making a certificate for a new host
```
One app container only (live table state is in memory). Everything is configured by environment variables in `.env.production`; see `.env.example`.

## Where things live
| What | Where |
|---|---|
| Storage (Postgres / Supabase REST / local files), save queue, flush, health ping | `store.js` |
| Host → restaurant (subdomain + custom domain, reserved names, TLS "known host") | `hosts.js` (pure logic, unit tested) + middleware in `server.js` ("Host-based tenants") |
| Rate limits | `ratelimit.js`; numbers in `server.js` (`writeLimit`, `loginLimit`, `rpcLimit`, `upLimit`); scale all with `RATE_MULT` |
| Security headers / CSP | `security.js` (`CSP=report-only|on|off`) |
| Strict startup checks in production | `checkProdConfig()` in `server.js` |
| Graceful shutdown, WebSocket limits/heartbeat | bottom of `server.js` |
| Plans, prices, limits | `features.js` |
| Deploy, rollback | `deploy.sh`, `docker-compose.yml`, `Dockerfile`, `Caddyfile` |
| Server hardening, backup, restore test | `ops/*.sh` |
| Tests | `tests/` (`npm test`; `tests/load/loadtest.js` is a tool, not a test) |

## How restaurants are reached
- `https://<slug>.BASE_DOMAIN/` and any custom domain → the server **rewrites** to that restaurant's pages (`/`, `/t/5`, `/captain`, `/admin`, `/kitchen`, `/cashier`) and adds `<meta name="elm-slug">`; `public/shared.js` reads it. No redirect.
- `/r/<slug>/...` keeps working on every host (old QR codes, `?k=` table keys, demo mode `/r/live-demo`, `?demo=1`).
- `/api/...` and `/ws` are the same on every host. `/super` is never served on a restaurant's host.

## Changing things safely
- **A setting** → edit `.env.production`, `./deploy.sh`.
- **A better version of the code** → work on a git branch, `npm test`, push, on the server `./deploy.sh my-branch`; if it misbehaves `./deploy.sh rollback` (previous image is kept; the 5 newest are kept).
- **A different TLS approach** (e.g. wildcard certificate via Cloudflare DNS-01): only `Caddyfile` and `Dockerfile` (a Caddy build with the DNS plugin) change; the app is untouched. `/internal/tls-ask` keeps working for custom domains.
- **A different database host**: change `DATABASE_URL` (must be UTF8 Postgres; the app refuses to start otherwise).
- **Data shape changes**: keep old data working through `ensure()` in `tenant.js` (which must stay free of Node-only APIs because the browser demo runs it).

## Known limits / next steps
- **History grows inside each restaurant's JSON document** (WebSocket mode). Every closed check is appended, the whole document is saved on each change and loaded in RAM at start. Fine for months; plan an archive step (move old history to separate rows, as stateless mode already does with `store.appendHist`) before a busy café reaches tens of MB. Watch with `select id, pg_column_size(doc) from tenants order by 2 desc limit 10;`.
- Single process / single server: a server failure means downtime until rebuilt (restore: new server, `./deploy.sh`, same `.env.production`; data is in Supabase).
- Rate limits and login counters are in memory (reset on restart).
- Not testable on Windows (verified on Linux at first deploy): graceful `SIGTERM` flush — after `./deploy.sh`, `docker compose logs app | grep "data saved"` should show the line.
- `Caddyfile` is validated by `deploy.sh` inside the official Caddy image before every switch-over; it could not be validated on the development PC.
