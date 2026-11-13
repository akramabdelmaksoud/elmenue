# QR Menu — waiterless ordering for cafés & restaurants

Guests scan a table QR, join the table, and order from their phones (shared cart, split bills, call-waiter buttons).
The captain gets a live floor map and order stream. The owner manages menu, themes, QR codes and analytics.

## Two ways to run it

### A) One restaurant per install (sell it to a client)
Set `SINGLE_RESTAURANT=1`. Clean URLs: `/` (setup on first run), `/admin`, `/captain`, `/t/<table>`.

    npm install
    SINGLE_RESTAURANT=1 npm start       # open http://localhost:3000 → setup wizard

Or skip the wizard: `OWNER_EMAIL`, `OWNER_PASSWORD`, `RESTAURANT_NAME` (and optionally `DEMO_DATA=1`).
Docker: `docker build -t qrmenu . && docker run -p 3000:3000 -e SINGLE_RESTAURANT=1 -v qrdata:/app/data qrmenu`

### B) Many restaurants on one server (SaaS)
Leave `SINGLE_RESTAURANT` unset. `/super` is the platform owner console; each restaurant lives at `/r/<slug>/…`.

### B2) Many restaurants on Vercel (SaaS, free demo hosting)
Leave `SINGLE_RESTAURANT` unset and set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SECRET`, `SUPER_EMAIL`, `SUPER_PASSWORD`. `/super` creates cafés (each is a Supabase row `r_<slug>`), assigns tiers (Basic / Operations / VIP), branch groups and custom domains. Optional: `ANTHROPIC_API_KEY` for real photo-OCR and a smarter admin copilot. See `docs/archive/SPEC_COVERAGE.md`.

### B3) Production SaaS on your own server (recommended)
Hetzner VPS + Caddy (automatic HTTPS) + Supabase Postgres, WebSocket mode, `<slug>.yourdomain.com` and custom domains. Option C steps: `docs/guides/OWNER_CHECKLIST.md`; option B (Vercel) steps: `docs/archive/OWNER_CHECKLIST_B.md`. See `docs/guides/OWNER_CHECKLIST.md`, `docs/guides/GO_LIVE.md` and `docs/guides/PRODUCTION.md`. Deploy with `./deploy.sh`, undo with `./deploy.sh rollback`. Config template: `.env.example`. Run the tests with `npm test`.

### C) Vercel, one restaurant (serverless, no websockets)
Phones poll every ~2.5s instead of using websockets; all state lives in Supabase. The frontend picks polling automatically
when websockets are unavailable. In Vercel set: `SINGLE_RESTAURANT=1`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SECRET` (long random),
`OWNER_EMAIL`, `OWNER_PASSWORD`, `RESTAURANT_NAME` (optional `SETUP_KEY`, `DEMO_DATA=1`).
Run this once in Supabase's SQL editor:

    create table if not exists public.tenants (id text primary key, doc jsonb not null, ver bigint not null default 0, updated_at timestamptz default now());
    alter table public.tenants add column if not exists ver bigint not null default 0;
    alter table public.tenants enable row level security;

## What's included
- **Call from the table (the headline feature).** The guest taps one button on their phone: call the waiter, water, napkins, cutlery, the bill or speed up the order. The call lands on every captain screen with the table number and a live timer that turns amber then red. The guest sees "your captain has been called" with a timer, then who answered. A call nobody answers within `settings.callEscalateMin` minutes (default 3, 0 = off) alerts every captain again. The owner's Live floor tab shows calls answered today, average and slowest answer time and who is waiting (`GET /calls`).
- **Guests** scan the table QR (it carries a secret table key, so fake orders from a bare web address are rejected), join the table, share a cart, order, split the bill, call the waiter, rate the visit.
- **Captain** (`/captain`): live floor map (drag-built in Admin → Floor plan), alerts, order stream. On phones the whole café shows as a mini-map. Phone push alerts + installable app (PWA).
- **Kitchen** (`/kitchen`): ticket screen with timers, Kitchen/Bar stations, one-tap "sold out", "order ready" alert to the captain and guest.
- **Admin** (`/admin`): menu (sold-out, dietary tags, timed categories, stations), floor plan, staff PIN accounts + performance, reports with Excel export and full backup, theme, QR printing, security settings.
- **Staff ordering / cashier** (captain screen): take orders for any table, takeaway and delivery tickets, per-item notes, discounts (captains are capped, owner is not), tip, cash / card / cash+card with change, printable 80 mm receipt or bill, remove items with a reason (waste is tracked), move or merge tables, reservations shown on the floor map.
- **Inventory** (Admin → Inventory): optional portion counts per item; orders take from the count, items go sold-out at zero, restock / waste / count with a movement log, low-stock alerts. Reports add discounts, voids, estimated profit, sales by staff and by order type, and receipt reprints.
- **Looks**: the restaurant theme plus **Maison** (dark / light: Playfair + Inter, glass panels, gold accents, animated orbs and charts). The 🎨 button switches it on every screen and the choice is remembered per signed-in user; Admin → Theme sets the default for new visitors. Maison tokens live on `html[data-theme="maison"]` / `"maison-light"` in `public/maison.css`, so the other themes are untouched.
- **Insights & orders**: Admin → Analytics starts with revenue / orders / average ticket / profit against the previous period, an area chart, category donut, best sellers and low stock; Admin → Orders is the day-by-day ticket history with reprint and CSV export. Captain screen can switch between the floor map and a list grouped by table zone (set zones in the floor-plan editor).
- **Live demo**: open `/demo` — the whole app runs in your browser on sample data (same engine, nothing saved, tabs share it), so you can show it to a client without a database.
- Empty tables are freed automatically; tables with orders but no activity are flagged 💤.

## Team, roles and security

Seven kinds of people, each reaching only what they need (`roles.js` holds the rules; the server enforces them, the pages only hide what a role cannot open):

| Who | Signs in with | Reaches |
|---|---|---|
| Owner | email + password (+ optional authenticator code) | everything, including plan, payment keys, branding, team |
| Branch manager | username + password (10+ chars, mixed case, a number; optional authenticator code) | one branch: menu, floor, staff, stock, billing, reports, attendance, offers, live floor |
| Operations manager | username + password | live floor, inventory, billing, reports and loss controls, attendance |
| Captain / cashier / kitchen / driver | personal PIN, 6 to 10 digits | their own screen only |
| Guest | scans the table QR | their own table |
| Platform owner (you) | `/super` with email + password only | all venues, plans, prices |

- **Closed by default.** A new admin route needs the owner until it is listed in `roles.js` (`POLICY`). Branches are separate venues, a token only works in its own branch.
- **Accounts.** Owner creates managers, a branch manager may create operations managers. First sign-in forces a new password. 5 wrong passwords lock the username for 15 minutes (unknown names too). Optional end date for temporary staff. Switching a person off ends their open session at once.
- **Manager PIN approval.** `settings.approvals` = `{ voidOver, discountOverPct }`. A captain or cashier going over those limits (or over their discount cap) is asked for an approval PIN; owner, branch manager and operations manager each set one under Sign-in & security. The server checks it before the order logic, stores the approver on the void or discount, and throttles wrong PINs. A discount approved this way may go up to 50%.
- **Audit and alerts.** Every sign-in, failure, lockout, account change and manager action is logged (last 400). The owner sees an alert badge for new-place sign-ins, lockouts, resets and two-step turned off, with "Mark as seen".
- **Loss controls** (`GET /controls`): voids, discounts and tables closed without payment per person, voids after the bill was asked for, and purchase orders created and received by the same person.
- **Kitchen void alert.** Voiding an item the kitchen already has adds an entry to `db.kitchenAlerts` (20 minutes); the kitchen screen shows a red banner with sound until someone taps "Got it".
- **Live floor** (admin tab, read only) for owner, branch manager and operations manager. The owner's Branches tab starts with a "Live now" strip for every branch in the group.
- **Guest extras.** Goodbye screen after rating or table close (`settings.farewell`: seconds 5-30, message en/ar, auto close, fallback), allergen filter bar on the menu (hides dishes that contain the picked allergens, remembered per venue), win-back list of loyalty members not seen for 14-90 days with a WhatsApp link.
- **Countries.** The site has an Egypt / UAE switch (prices, wording, Gulf Arabic, AED + 5% VAT note). Venues can use `settings.dialect = 'gulf'`.

## Push notifications
Generate keys once (`npx web-push generate-vapid-keys`) and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT` (mailto:...).
On iPhone the staff page must be added to the Home Screen first (iOS 16.4+).

## Storage
- Default: JSON files in `DATA_DIR` (default `./data`) — mount it as a persistent disk/volume.
- Supabase: set `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (run the SQL printed at startup once).
- Postgres: set `DATABASE_URL`.

## Other settings
`SECRET` (token signing key — set a long random value in production), `PUBLIC_URL` (used in QR codes),
`SUPER_EMAIL` / `SUPER_PASSWORD` (multi-restaurant mode only).

Runs on a long-running Node host with WebSockets, or on Vercel in polling mode (see B2 and C above).

## Next release (branch `release/next`)

Eight opt-in features, all off by default and tier-gated: upsell, online payments (Paymob), ETA e-receipts (pre-production only), feedback + Google reviews, coupons / offers / gift cards, plan limits, offline queue for staff apps, shifts + Z-report. Run `npm test` (158 checks, both run modes). See `docs/archive/RELEASE_VERIFICATION.md` for what is proven and `docs/guides/NEEDS_FROM_OWNER.md` for what is waiting on you.
