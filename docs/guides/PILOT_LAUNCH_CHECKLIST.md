# Pilot launch checklist (production on the Pro accounts)

Written for: the owner. Do these in order. Steps marked **YOU** need your Pro logins; everything else is already in the code.

## 1. New Supabase project (Pro account)
1. **YOU** Sign in to the Pro Supabase account → New project. Region: **Frankfurt (eu-central-1)**: the closest to Egypt. Compute: leave the default (Micro).
2. **YOU** SQL editor → run this once:

       create table if not exists public.tenants (id text primary key, doc jsonb not null, ver bigint not null default 0, updated_at timestamptz default now());
       alter table public.tenants add column if not exists ver bigint not null default 0;
       alter table public.tenants enable row level security;

3. **YOU** Project Settings → API → copy the **Project URL** and the **secret key** (never the anon key, never in chat or git).
4. Nothing else to migrate: the old project only had dummy data.

## 2. Vercel (Pro account)
1. **YOU** Import the repo into the Pro Vercel account (or `npx vercel --prod` from the project folder logged in as the Pro account).
2. **YOU** Project Settings → Functions → Region: **Frankfurt (fra1)** so the app sits next to the database.
3. **YOU** Environment variables (Production). Use new values for every secret:

   | Name | Value |
   |---|---|
   | `SINGLE_RESTAURANT` | `1` for one cafe per deployment, or leave it unset to host many cafes from `/super` |
   | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | from step 1.3 |
   | `SECRET` | a new long random string (40+ characters) |
   | `OWNER_EMAIL`, `OWNER_PASSWORD`, `RESTAURANT_NAME` | the first cafe's owner login (single mode) |
   | `SUPER_EMAIL`, `SUPER_PASSWORD` | your platform login (multi-cafe mode) |
   | `PUBLIC_URL` | `https://tabletab-tt.com` |
   | `APP_TZ` | optional, defaults to `Africa/Cairo` |
   | `ANTHROPIC_API_KEY` | optional: turns on the written AI briefing (VIP plan). Create a **new** key |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT` | optional: phone push alerts |

   Do **not** set `DEMO_DATA` (any value, even `0`, seeds demo sessions).
4. **YOU** Settings → Domains → add `tabletab-tt.com` and `www.tabletab-tt.com`, then set the DNS records Vercel shows at your domain registrar.
5. **YOU** Billing → set a **spend limit** so a traffic spike cannot surprise you.

## 3. First cafe (about 20 minutes with the cafe owner)
1. Open `https://tabletab-tt.com/super` (multi-cafe) or `/admin` (single) and create the cafe. Plan: **Operations** includes online ordering, reviews and the Insights tab; **VIP** adds the written AI briefing.
2. Admin → Menu builder: real menu and photos. Admin → Floor plan: real tables. Admin → Staff: one PIN per captain (needed so the captain logs and performance are per person).
3. Admin → Table QR codes: print them. The QR carries the secret table key.
4. Admin → Reports → **Online ordering**: switch on, choose pickup/delivery, minimum order, optional delivery fee item. Share the link `https://tabletab-tt.com/r/<slug>/order` (QR at the door, Instagram, Google profile).
5. Admin → Reports → **Location, delivery zones & in-cafe ordering**: stand inside the cafe, press **Use my current location**, Save. Then switch on **Guests can only open a table from inside the cafe** (150 m is a good start) and add delivery zones (for example up to 3 km = 20 EGP, up to 8 km = 40 EGP).
6. Admin → Reports → **Guest feedback**: switch on and paste the cafe's Google review link (4-5 star guests are offered it).

## 4. Before the first real customer
- [ ] Place one test pickup order and one delivery order from your own phone; confirm the captain and kitchen screens show it and you can take payment and close it.
- [ ] Scan a real QR on an iPhone **and** an Android phone, inside the cafe; allow location, order, call the waiter, pay, rate. Then try from outside (or with location denied) and check the "away from the cafe" screen appears and the waiter can seat the table.
- [ ] Print one receipt on the real 80 mm printer.
- [ ] Rotate every secret that was ever pasted in chat (old Supabase key, old Anthropic key) and change the demo owner password.
- [ ] Take a backup: Admin → Reports → **Backup all data**.

## 5. During the pilot
- Look at **Admin → Insights** after about a week: it needs roughly 15+ paid orders over 3+ days before it gives reliable peak/drop advice.
- **Captain log (CSV)** in Insights exports every captain's activity per hour, in Cairo time.
- Check Vercel and Supabase usage once a week for the first month; upgrade Supabase compute only if CPU or memory stays above 70-80%.

## Known limits
- Online ordering is **pay on receipt**. Card payment needs a Paymob account (see `NEEDS_FROM_OWNER.md`).
- Delivery fees follow the distance zones you set (straight-line distance from the cafe, not road distance); there is no driver tracking.
- The in-cafe lock relies on the phone's location. Indoor GPS is rough, a determined person can fake it, and a guest who refuses location is blocked until the waiter seats the table from the captain screen. It stops someone using a photo of the QR from home; it is not bank-grade security.
- Location works only over HTTPS (your domain is).
- Timed menu categories (e.g. breakfast) are respected on the online page; the venue's open/closed hours are not yet enforced (turn online ordering off when closed).
- Captain activity is logged from the day this version goes live; earlier history has no hourly breakdown.
- The browser checks I ran live outside the repo; `npm run test:ui` still points to a folder that does not exist.

## Sites and addresses (production)

One Vercel deployment serves four addresses, chosen by `ROOT_DOMAIN=tabletab-tt.com`:

| Address | Shows | Who |
|---|---|---|
| tabletab-tt.com / www | Marketing site (`public/site.html`: features, what's new, plans, about, FAQ) | Everyone |
| app.tabletab-tt.com | Cafe login and every cafe (`/r/<slug>/...`, QR codes use this via `PUBLIC_URL`) | Cafes and guests |
| admin.tabletab-tt.com | Platform console (`/super`) - answers 404 on every other host | Owner only |
| demo.tabletab-tt.com | Live showroom (separate flagged cafe `showroom`) | Prospects |

Subdomains cost nothing; they are domains added to the same Vercel project. Plan prices and contact email on the marketing site are edited at the top of `site.html` (`TXT.plans`, `CONTACT_EMAIL`).

## Security measures in place

- Output escaping on every page; a hostile-payload browser probe (names, notes, addresses, reviews, menu text) found no script execution. CSP is enforced (`CSP=on`).
- Bad JSON is a 400, oversized bodies a 413, all 103 routes fuzzed with hostile bodies without a 5xx or prototype pollution.
- Admin routes refuse anonymous, cross-café and tampered tokens. The platform console exists only on `admin.<ROOT_DOMAIN>`.
- Menu import runs the spreadsheet reader in a time-limited worker (the `xlsx` package has unpatched read bugs), 1 MB, 500 rows, clamped fields.
- The public showroom's admin token cannot upload files, call AI, or change staff, payments or accounts, and demo reset is rate limited.
- Café creation validates slug (reserved names), name, email and password length (8+).
- Known limit: rate-limit counters live in each serverless instance's memory, so they slow abuse but are not a hard global cap. Cloudflare in front of the domain would add one.
- Keep rotating: Supabase secret key, SECRET, super password. Never paste them in chat.
