# elmenue — Project Guide (for a new AI or developer)

A complete café / restaurant system: guests scan a QR code on the table and order from their phone; staff run the floor, kitchen, POS and reports. Repo: `akramabdelmaksoud/elmenue`. Live: https://elmenue.vercel.app (demo with no login: `/demo`).

Plain Node 22 + Express 5, **no front-end framework, no build step**. Pages are single HTML files with inline JS/CSS under `public/`.

---

## 1. Folder map

| Path | What it is |
|---|---|
| `server.js` (~620 lines) | Express app: auth, REST API, WebSocket (local mode), RPC endpoint (Vercel mode), uploads, reports, exports |
| `tenant.js` (~490 lines) | **The engine.** `createTenant()` holds all business logic: sessions, orders, billing, inventory, reservations, analytics, the message handler. Runs on the server **and in the browser** (demo mode) |
| `data.js` | Seed data: default settings, menu, tables, fake history |
| `store.js` | Persistence: local JSON files (`DATA_DIR`) or Supabase/Postgres (Vercel) |
| `auth.js`, `env.js` | Token signing / password + PIN hashing; env loading |
| `api/index.js` | Vercel serverless entry (wraps `server.js`) |
| `vercel.json` | Rewrites everything to `/api`; `includeFiles` ships `public/**`, `tenant.js`, `data.js` |
| `public/customer.html` | Guest app (phone): order page, My order, Bill, Home, Profile |
| `public/captain.html` | Waiter/captain: floor map/list, tickets, modal per table |
| `public/pos.js` | Captain POS module `PX`: staff ordering, pay dialog, void, move/merge, reservations |
| `public/kitchen.html` | Kitchen/bar board |
| `public/admin.html` | Owner dashboard: Analytics, Menu builder, Inventory, Orders, Floor, Staff, Reports, Theme, QR, Audit |
| `public/shared.js` / `shared.css` | Everything shared: `App` object (api, auth token, language, theme, toast, money, receipts, demo hooks), cursors, dropdown styling |
| `public/maison.css` | The "Maison" re-skin (dark/light) |
| `public/demo.js`, `demo.html` | In-browser demo: runs the engine locally with a fake REST layer |
| `public/auth.js`, `auth.css` | Login cards (with Back / switch-role links) |
| `public/platform.html`, `tenant.html`, `super.html`, `setup.html` | Multi-restaurant landing, restaurant landing, super-admin, first-run setup |
| `public/floor.css` | Floor-plan table styles |
| `public/sw.js`, `manifest.webmanifest` | PWA + push notifications |
| `docs/` | This guide + Claude prompt |

---

## 2. Run modes (important)

1. **Local / server mode** — `node server.js`. WebSockets for live updates. Data in `DATA_DIR` (JSON files). Multi-restaurant by slug (`/r/:slug/...`).
2. **Vercel / stateless mode** (`VERCEL` or `STATELESS` env) — Vercel free plan has **no WebSockets and no memory between requests**. Clients **poll** `POST /api/r/:slug/rpc` (join + optional message in one call). The server loads the tenant from Supabase, runs the message through the same engine, saves with **compare-and-swap** (retries up to 5×), returns the new state. History lives in separate "aux" rows.
3. **Single-restaurant mode** (`SINGLE_RESTAURANT=1`) — one restaurant with slug `main`; `/captain`, `/admin`, `/kitchen` redirect to `/r/main/...`. This is what production uses.
4. **Demo mode** — the browser runs `tenant.js` itself (`/engine/tenant.js`, `/engine/data.js`); `demo.js` intercepts `fetch('/api/...')`. Active when the path is `/r/live-demo/...` or `?demo=1`. Tabs sync through `localStorage` key `demo:v1`. Nothing touches the server.

### Environment variables
`SUPABASE_URL`, `SUPABASE_SECRET_KEY` (Vercel storage), `DATABASE_URL`/`PGSSL` (optional Postgres), `DATA_DIR`, `PORT`, `SECRET` (token signing), `OWNER_EMAIL`/`OWNER_PASSWORD` (first owner on Vercel), `SINGLE_RESTAURANT`, `RESTAURANT_NAME`, `PUBLIC_URL`, `SUPER_EMAIL`/`SUPER_PASSWORD`, `SETUP_KEY`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_CONTACT` (push), `STATELESS`, `NODE_ENV`.
**Gotcha:** `DEMO_DATA` is truthy for *any* non-empty string (even `"0"`). Omit it to avoid seeding demo sessions.

---

## 3. Data model (inside one tenant `db`)

- `settings` — name, name_ar, currency, tax, service, lang, theme, palette, tagline(s), `skin` (default look), `menuLayout` (default order-page layout), `heroImg` (cover photo), `discountCapPct` (captain discount cap, default 20), floor config.
- `categories[]` — `id, name, name_ar, emoji, station ('kitchen'|'bar'|'both'), hours{from,to}, layout, img`.
- `items[]` — `id, cat, name, name_ar, price, cost, emoji, desc, img, featured, soldOut, tags[], stock (null/undefined = unlimited), lowAt`.
- `tables[]` — number, seats, shape, floor position, zone, secret `key` (the QR carries `?k=`; guests without it get the "scan the table" screen).
- `sessions[tableId]` — one open table: `guests[]`, `host` (guest id), `cart[]`, `orders[]`, `requests[]`, `check`, `log[]`, `discount`, `voids`, plus for tickets `kind` ('takeaway'|'delivery'), `customer`. Takeaway/delivery use a pseudo table id `tk_xxxxxxxx`, label `TA-n` / `DL-n`.
- `history[]` — closed sessions: `kind, customer, items, sub, discount, service, tax, tip, total, pay{cash,card,tendered,change}, method ('cash'|'card'|'mixed'|'unpaid'), unpaid, voids, closedAt, closedBy`. Unpaid clears are excluded from revenue/analytics/reports.
- `reservations[]` — table state "reserved" from 45 min before to 20 min after.
- `statsReset{}` — per-block "clear" timestamps for Analytics (see §6).
- Staff (owner, captains with PIN, kitchen PIN) live in the tenant record.

**Billing rule (`bill()`):** discount comes off the gross first; service charge and tax apply to the net. Returns `{sub(=gross), gross, discount, net, service, tax, total, byGuest}`.

---

## 4. Live protocol

Message in (`handle(c, m)`), state out (`snapshotFor`). Roles: `customer`, `captain`, `kitchen`, `admin`.

- **Customer:** `join, profile, cart_add, cart_qty, cart_note, send_order, order_item_remove, request (waiter/water/urgent), check, check_cancel, host_set` (only the current host can hand the role over).
- **Captain:** `order_status, resolve_request, open_ticket, staff_order, void_item, discount, move_table, merge_tables, res_add/res_del/res_seat, close_table {method, pay:{tip,tendered,card}, unpaid}, seat_table, host_set` (captain can reassign any host), `sim`.
- Discounts: captains are capped by `discountCapPct`; the owner (`c.adm`) is unlimited; notices come back in the rpc `notices`.
- Auth: token per role in `localStorage` as `tok:${slug}:${role}`. `App.tok(role)` falls back to the admin token for captain/kitchen, so the owner can open every screen without a second login. `logout()` of captain/kitchen also clears the admin token.

### REST (all under `/api/r/:slug/…`, admin-protected unless noted)
`config` (public), `login`, `rpc`, `analytics?days=`, `stats/clear {key, restore}`, `orders?from&to`, `receipts`, `reports` (+xlsx), `items` CRUD, `items/:id/adjust`, `stock-log`, `items/:id/image` (POST/DELETE), `categories` CRUD + order, `categories/:id/image`, `hero-image`, `settings`, `img/:key` (serves uploaded images), menu import/template (xlsx/csv), staff, floor layout, QR codes. Uploads: png/jpeg/webp/gif, ≤700 KB (the admin shrinks photos to webp in the browser first). Images are stored as blobs via `store.putBlob`.

---

## 5. Guest app (customer.html)

- Opens on the **Order page**: cover banner (admin photo) → "How to order" 3-step strip (dismissible) → search → sticky category chips + dietary tag filters → **every category as its own section**.
- **Six layouts**, chosen per category (fallback `settings.menuLayout`, fallback `cards`): `cards` (2 columns; starred items become wide), `list`, `hero` (big photo cards), `feature` (one large + grid), `carousel`, `classic` (text menu with dotted price leaders). Optional category banner photo.
- `+ Add` turns into a − n + stepper; a floating **cart bar** shows count/total with **View order** and one-tap **Send to kitchen**.
- Tabs: Menu, My order (cart, people, **table host card 👑**, order tracking), Bill (split self/table/custom, tip, cash/card), Home, Profile (name, avatar, language, light/dark, look: House/Maison dark/Maison light).
- **Table host:** first guest to sit is the host by default; they can hand it to anyone at the table; the captain sees the host's name on the floor map and in the table dialog and can change it.
- **Languages:** English/Arabic (RTL). In Arabic, **numbers and prices stay in Western digits (0-9)**; EGP shows as "ج.م"; everything else is Arabic. All numeric formatting must use `App.money()` (`en-US` locale) — never `ar-EG`.
- Menu-themed cursors (☕ default, 🍴 on clickables) via SVG data-URIs in `shared.css`, `pointer: fine` only.

## 6. Staff apps

- **Captain:** floor map by zone or list toggle, tickets for takeaway/delivery, reservations, POS ordering, pay dialog (discount, tip, cash/card/mixed, change, unpaid clear), void items with reason, move/merge tables, "Switch role" menu, "Look" menu.
- **Kitchen:** order board by station (kitchen/bar); ready/served flow.
- **Admin tabs:** Analytics, Menu builder (categories, items, photos, bulk photo drop matched by file name, "Guest order page look"), Inventory (stock, low-stock, adjustments, stock log), Orders (date filter, expand, reprint 80 mm receipt, CSV), Floor editor (zones), Staff, Reports (xlsx/CSV, receipts, sales by staff), Theme & settings, QR codes, Audit.
- **Analytics blocks** (Summary, Revenue by day/hour, Sales by category, Best sellers, Details, Rush hours, Table usage): each has its own **Export (CSV)** and **Clear** (+ Restore); plus Export all / Clear all. Clearing only moves a per-block start timestamp (`db.statsReset`) — sales records, receipts and Orders history are **never deleted**.
- **Looks:** "House" theme (palette presets + custom) and **Maison** dark/light re-skin. Per-user choice remembered in `localStorage` key `skin:${slug}:${who}`; `settings.skin` is the default for new visitors.
- All `<select>` dropdowns are styled for readable options in light and dark (`shared.css`, end of file).

---

## 7. Deploying & testing

**Deploy (Vercel, production):** from the project folder: `npx vercel --prod --yes` (project `elmenue`, linked via `.vercel/project.json`). Push to GitHub with `git push` (branch `main`). Free plan = non-commercial use.

**Local run:** `DATA_DIR=<folder> SINGLE_RESTAURANT=1 PORT=3200 node server.js`, then `/r/main/admin`.

**Tests:** puppeteer-core + Edge driving a local server (scripts lived in a scratch folder, not the repo). Useful tips: use a **separate browser context per guest** (localStorage is shared per context), stub `window.confirm`, and expect owner login `owner@cafe.com / secret12` only in that local test data.

---

## 8. Known gotchas / decisions

- The engine must stay **pure and shared** (no Node-only APIs in `tenant.js`) because demo mode runs it in the browser.
- Anything that changes the data shape must tolerate old data (`ensure()` in `tenant.js` initialises missing fields).
- Vercel mode = polling; avoid adding anything that needs a long-lived connection or in-memory state.
- Real phone push delivery is untested.
- Not built yet / ideas: online payments, printer integration beyond browser print, delivery driver tracking, multi-branch reporting.

## 9. Security to-do before real use
- Rotate the Supabase secret key and any access tokens that were shared in chats.
- Change the live owner password and the captain PIN; keep secrets only in Vercel env vars.
- Live QR links need the table key (`?k=`).
