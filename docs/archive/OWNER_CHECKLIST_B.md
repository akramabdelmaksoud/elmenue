# elmenue — Owner checklist for option B (Vercel Pro + Supabase Pro)

Same style as OWNER_CHECKLIST.md (which is option C, your own server). Here there is no server to run: Vercel runs the app, Supabase keeps the data. Phones ask the server for news every few seconds (adaptive: fast when something happens, slow when idle).

Do steps in order. **YOU** = needs your hands (buying, clicking, pasting secrets). Never paste passwords or keys into a chat.

---

## 0. New secrets first (YOU)
Make NEW values and save them in a password manager: `SECRET` (64 random hex characters), `SUPER_PASSWORD` (long), Supabase database password. Old tokens that were ever shared (old Supabase key, old Vercel token) must not be reused.
Random value: on Windows PowerShell `-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })`.

## 1. Domain (YOU)
Buy one name, e.g. `elmenue.com`. **Printed QR codes will contain it, so choose once.** Turn on auto-renew and 2-step login.

## 2. Supabase (YOU)
1. supabase.com → **New project** `elmenue-prod`, region **Central EU (Frankfurt)**, plan **Pro**, strong database password.
2. **SQL Editor** → New query → paste and run once:
```
create table if not exists public.tenants (id text primary key, doc jsonb not null, ver bigint not null default 0, updated_at timestamptz default now());
alter table public.tenants add column if not exists ver bigint not null default 0;
alter table public.tenants enable row level security;
```
3. **Project Settings → API Keys**: copy the **Project URL** (`https://xxxx.supabase.co`) and the **secret** key (server-only key, never put it in a web page). Keep both for step 4.
4. **Database → Backups**: confirm daily backups are listed.

## 3. Vercel Pro (YOU)
1. vercel.com → create/choose your team → **upgrade to Pro** (1 seat). Hobby may not be used for paying customers.
2. **Add New → Project → Import** the GitHub repo `Abdelrahman-Reda312/TableTab` (approve access). Framework preset: **Other**. Leave build settings empty.
3. The region is set by `vercel.json` (`fra1`, Frankfurt). Check later in the deployment's Functions tab.
4. **Settings → Environment Variables** (Production). Do **not** add `SINGLE_RESTAURANT`:
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SECRET`, `SUPER_EMAIL`, `SUPER_PASSWORD`, `BASE_DOMAIN` (e.g. `elmenue.com`), `PUBLIC_URL` (`https://elmenue.com`), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (new pair: `npx web-push generate-vapid-keys`), `VAPID_CONTACT` (`mailto:you@…`).
5. **Settings → Billing → Spend Management**: set a monthly budget with email alerts (suggest $100 at first) so a surprise is visible.

## 4. Domain on Vercel (YOU)
1. Project → **Settings → Domains** → add `elmenue.com` and `*.elmenue.com` (the wildcard needs Vercel's DNS).
2. At your registrar change the domain's **nameservers** to the two Vercel shows (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`). Wait until Vercel shows both domains as valid (minutes to hours).
3. Deploy: push to `main` on GitHub (Vercel deploys automatically). Open `https://elmenue.com/health` → must show `"ok":true`.

## 5. First test restaurant
1. `https://elmenue.com/super` → sign in with `SUPER_EMAIL` / `SUPER_PASSWORD`.
2. New restaurant: name, slug `test`, owner email, plan. Save the shown password and PIN.
3. Open `https://test.elmenue.com` → café page. Admin → QR codes; scan one with a phone, order, watch it on the captain screen.

## 6. Add a new restaurant (every time)
1. `/super` → New restaurant (slug = its subdomain).
2. Send the owner: address, email, password, captain PIN. Tell them not to print QR codes until the final address is agreed.

## 7. A restaurant's own domain
1. In Vercel: Project → Settings → Domains → **add** `menu.theircafe.com` (one by one; Vercel shows the exact record to create).
2. The café creates a **CNAME** `menu` → `cname.vercel-dns.com` at their domain provider (use a subdomain; a bare domain cannot be a CNAME).
3. `/super` → that restaurant → domain → `menu.theircafe.com` → save.
4. Wait for Vercel to mark the domain valid (certificate is automatic). Admin → QR codes then shows the new address. **Print QR codes only now.**
5. If they use Paymob later, give Paymob the webhook with the stable `slug.elmenue.com` address, not their own domain.

## 8. Monitoring and the load test
- UptimeRobot: monitor `https://elmenue.com/health` (keyword `"ok":true`) and one restaurant page.
- Supabase: Organization → Billing → keep the spend cap on; watch **Reports → Database / API egress** monthly.
- Vercel: **Usage** tab weekly for the first month (requests, function time). Compare with the report (about 15M requests/month for 10 busy cafés).
- Load test on a TEST restaurant with table keys turned off:
  `node tests/load/loadtest.js https://test.elmenue.com --slug test --poll --guests 30 --tables 6 --seconds 120`
  Pass = no errors and p95 round trip under 1.5 s.

## 9. Updating and going back
- Update: push to GitHub `main` → Vercel builds and switches over by itself, no downtime.
- Go back: Vercel → Deployments → pick the previous one → **Promote to Production** (instant).

## 10. Later move to your own server (option C)
When you pass about 15–20 busy cafés: follow OWNER_CHECKLIST.md to build the server, then run `node scripts/migrate-b-to-c.js` (dry run first, then `--commit`), start the new server, test, switch DNS. The script copies restaurants, history and images; read its header first.

## Differences from option C you should know
- No firewall/SSH/backup scripts of your own: Vercel and Supabase run those. Supabase Pro backups are daily (7 days).
- The rate limits are per Vercel instance (weaker than on one server); the sign-in throttle is stored per restaurant and works everywhere.
- No graceful-shutdown or WebSocket features are used. Updates reach a screen within about 2–6 s.
