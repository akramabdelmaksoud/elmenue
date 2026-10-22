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

### C) Vercel (serverless, no websockets)
Phones poll every ~2.5s instead of using websockets; all state lives in Supabase. The frontend picks polling automatically
when websockets are unavailable. In Vercel set: `SINGLE_RESTAURANT=1`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SECRET` (long random),
`OWNER_EMAIL`, `OWNER_PASSWORD`, `RESTAURANT_NAME` (optional `SETUP_KEY`, `DEMO_DATA=1`).
Run this once in Supabase's SQL editor:

    create table if not exists public.tenants (id text primary key, doc jsonb not null, ver bigint not null default 0, updated_at timestamptz default now());
    alter table public.tenants add column if not exists ver bigint not null default 0;
    alter table public.tenants enable row level security;

## Storage
- Default: JSON files in `DATA_DIR` (default `./data`) — mount it as a persistent disk/volume.
- Supabase: set `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (run the SQL printed at startup once).
- Postgres: set `DATABASE_URL`.

## Other settings
`SECRET` (token signing key — set a long random value in production), `PUBLIC_URL` (used in QR codes),
`SUPER_EMAIL` / `SUPER_PASSWORD` (multi-restaurant mode only).

Needs a long-running Node host (WebSockets) — not serverless platforms like Vercel.
