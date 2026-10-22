# QR Menu — waiterless ordering for cafés & restaurants

Guests scan a table QR, join the table, and order from their phones (shared cart, split bills, call-waiter buttons).
The captain gets a live floor map and order stream. The owner manages menu, themes, QR codes and analytics.

## Two ways to run it

### A) One restaurant per install (sell it to a client)
Set `SINGLE_RESTAURANT=1`. Clean URLs: `/` (setup on first run), `/admin`, `/captain`, `/t/<table>`.

    npm install
    SINGLE_RESTAURANT=1 npm start       # open http://localhost:3000 → setup wizard

Or skip the wizard: `OWNER_EMAIL`, `OWNER_PASSWORD`, `RESTAURANT_NAME` (and optionally `DEMO_DATA=1`).
Docker: `docker build -t qrmenu . && docker run -p 3000:3000 -v qrdata:/app/data qrmenu`

### B) Many restaurants on one server (SaaS)
Leave `SINGLE_RESTAURANT` unset. `/super` is the platform owner console; each restaurant lives at `/r/<slug>/…`.

## Storage
- Default: JSON files in `DATA_DIR` (default `./data`) — mount it as a persistent disk/volume.
- Supabase: set `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (run the SQL printed at startup once).
- Postgres: set `DATABASE_URL`.

## Other settings
`SECRET` (token signing key — set a long random value in production), `PUBLIC_URL` (used in QR codes),
`SUPER_EMAIL` / `SUPER_PASSWORD` (multi-restaurant mode only).

Needs a long-running Node host (WebSockets) — not serverless platforms like Vercel.
