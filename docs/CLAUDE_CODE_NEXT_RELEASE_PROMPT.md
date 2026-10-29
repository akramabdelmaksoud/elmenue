# elmenue — Next Release: build, verify, document

Paste everything below the line into Claude Code, started in `A:\Apps and Compilers\DigitalMenuApp`.

---

You are the senior engineer on **elmenue**, a café/restaurant system already running in production at https://elmenue.vercel.app and being sold to real venues in Egypt. Your job is to ship the **Next Release**: eight features, each built, **proven working by automated tests**, and recorded in the master plan PDF. Real service must never be harmed, so work safely and report honestly.

## 0. Read first, in this order

1. `docs/PROJECT_GUIDE.md` (architecture, protocol, gotchas) and `docs/SPEC_COVERAGE.md` (tiers, gating).
2. `features.js` (tiers, gating, loyalty maths), `tenant.js` (engine and message handler), `server.js` (REST, rpc, auth), `store.js`.
3. `public/customer.html`, `public/captain.html`, `public/cashier.html`, `public/pos.js`, `public/kitchen.html`, `public/admin.html`, `public/super.html`, `public/shared.js`, `public/demo.js`, `public/escpos.js`.
4. `docs/elmenue_Luxury_Master_Plan.html` (the master plan; you will update it) and `docs/build_master_pdf.ps1` (builds the PDF).

## 1. Hard rules (break none)

- **Stack:** Node 22 + Express 5, plain HTML/JS, **no framework, no build step**. Do not add a bundler. New npm packages only if truly needed; justify each in the report.
- **`tenant.js`, `features.js`, `data.js` stay environment-neutral** (no Node-only APIs): they run in the browser demo.
- **Vercel runs stateless** (no WebSockets, no memory between requests): live updates are polling through `POST /api/r/:slug/rpc` with compare-and-swap saves. Everything you add must work in **both** local WebSocket mode **and** stateless mode. Never keep state in server memory.
- **Old data must still load.** Initialise new fields in `ensure()` in `tenant.js`. Never rename or remove existing fields. Never delete sales records (statistics "Clear" only moves a timestamp).
- **Arabic/RTL:** English + Egyptian Ammiya (`ar`) + Franco (`fr`). Every new string goes into `public/i18n.js` for **all three** languages. Numbers and prices stay Western digits, formatted through `App.money()` (`en-US`), never `ar-EG`.
- **Tier gating** lives in `features.js` and is enforced **on the server** (`402` + `upgrade`) and in the engine; the UI only hides or locks. Higher tiers include lower ones.
- **Every new feature ships behind a per-tenant flag, default OFF** for existing venues, so nothing changes for a live café until the owner enables it.
- **Money correctness:** billing rule is discount off the gross first, then service charge and tax on the net (`bill()`). Never change that rule; build on it. Round to 2 decimals consistently.
- **Security:** no secrets in the repo or logs. Provider keys come from env or tenant secret storage, never sent to a browser. Rate-limit new public endpoints. Never store card numbers. Validate every payment webhook signature. Authorise by tenant slug on every route.
- **Disk:** drive C: is full. All test data, temp files, caches, logs and build output go on **A:** (use `A:\Apps and Compilers\_work\tmp\...`, set `DATA_DIR` there). Never write to C:.
- **The working tree already has uncommitted changes.** Do not discard, reset or overwrite them. Create a branch `release/next` and make **one commit per feature, only after its tests pass**. Do **not** push, deploy, or touch production Vercel/Supabase data without asking me.
- **WhatsApp is out of scope.** Do not build anything for it.
- If something needs a credential, account or decision only I can provide, **do not fake it and do not stop the whole release**: build everything up to that line against a **sandbox/mock provider**, test that fully, mark the remainder `BLOCKED: needs owner`, and list exactly what you need (section 5).

## 2. Step 0: audit before you build

The docs are older than the code. Before writing code, inspect the repo and produce `docs/RELEASE_AUDIT.md` with, for each of the 8 features, one of **Exists / Partial / Missing**, the files and functions involved, and what is left. Known hints, verify them yourself:

- Shift routes (`/shift`, `/shift/open`, `/shift/move`, `/shift/close`, `/shifts`), `public/cashier.html` with a Z-report, and `public/escpos.js` appear to exist.
- `POST /feedback` (rate limited) and `GET /feedback` exist, with a feedback UI in `customer.html` and `admin.html`.
- `body.offline` is only a visual state in `shared.js`; there is no queue.
- No coupons, upsell, online payment, e-receipt, or plan limits found.

Build only what is missing or incomplete, and **test everything**, including features that already exist.

## 3. The eight features

Each feature: goal, scope, data, gating, acceptance. Follow existing code style and file layout.

### F1. Upsell and add-on suggestions (tier: Operations and up)
- Admin: per item, optional `pairs[]` of item ids ("goes well with"). Fallback when empty: best sellers from the last 30 days in complementary categories (drink with food, dessert after main), excluding sold-out and already-in-cart items.
- Guest: on the cart/review screen, a "Add something?" strip, max 3 suggestions, one-tap add, respects timed categories and stock. Never block checkout; dismissible.
- Metrics (admin Analytics block with CSV export and the usual non-destructive Clear): suggestions shown, accepted, acceptance rate, extra revenue attributed, per item.
- Settings: on/off per venue, max suggestions.
- Acceptance: suggestion never shows sold-out or hidden items; accepted add updates cart total exactly; metrics match the orders; works Arabic RTL and on a 375 px phone.

### F2. Online card and wallet payment at the table (tier: Operations and up, flag `onlinePay`)
- Provider adapter interface with **two implementations**: `sandbox` (built-in mock that behaves like a real gateway: init, hosted-page redirect, success/failure/delayed webhook) and `paymob` (Paymob Accept for Egypt: cards and mobile wallets). Read Paymob's current official docs to implement init, return URL and **HMAC webhook verification** correctly; do not guess endpoints.
- Flow: guest on the Bill tab taps "Pay by card / wallet" → server creates a payment for the exact amount owed (including tip) → guest completes on the provider page → webhook confirms → engine records the payment on the session (`method: 'online'`, provider reference, amount) → captain/cashier see it paid and the table can close. Return URL page polls status so a delayed webhook still resolves.
- **Idempotent:** the same webhook delivered twice, or out of order, records exactly one payment. A payment for an amount different from the live bill (items added meanwhile) must be rejected or reconciled, never silently under-pay.
- Split bills: each guest can pay their own share; the table closes only when fully paid.
- Never store card data. Keys per tenant, server-side only. Admin screen shows connection state and a "send test payment" button in sandbox.
- Reports: online payments appear as their own method in receipts, Orders, Analytics, shift totals and exports.
- Acceptance: all of the above against the sandbox provider with no real keys; Paymob adapter unit-tested with recorded fixtures and signature tests; real-money test marked `BLOCKED: needs owner`.

### F3. ETA e-receipts (tier: Operations and up, flag `eta`)
- This is the compliance gate for selling to covered venues. Read the **official ETA e-receipt SDK/portal documentation** before designing; requirements and dates in secondary sources conflict, so use only the official spec. State in the audit exactly which rules you relied on.
- Build: tenant settings for tax registration number, activity code, branch/POS identifiers; a compliant receipt builder from a closed session (line items, discounts, tax, totals, unique receipt id); a **durable submission queue** (statuses: pending, submitted, accepted, rejected, retrying) with back-off retries that survive restarts and work in stateless mode; QR/reference on the printed 80 mm receipt; an owner screen listing receipts and failures with a "retry" button; an export for the accountant.
- Target the **ETA pre-production/sandbox** environment. Production submission stays disabled until the owner completes ETA onboarding.
- Acceptance: receipts validate against the official schema/pre-production; a rejected receipt is visible and retryable; offline or API outage never blocks closing a table (queue and retry); totals match `bill()` to the cent. Production credentials and ETA registration: `BLOCKED: needs owner`.

### F4. Guest feedback and Google reviews (tier: Operations and up)
- Extend the existing feedback. After payment, ask for a 1-5 rating plus optional comment. **4-5 stars:** offer a "Share on Google" button that opens the venue's Google review link (admin setting `googleReviewUrl`). **1-3 stars:** stay private, notify the owner (push + admin badge), never show the Google prompt.
- Admin: feedback dashboard (average, trend by week, distribution, latest comments, by waiter/table zone), CSV export, mark as handled.
- Do not gate or incentivise reviews by rating in any way that breaks Google's policy: show the Google link only as an option and never hide it based on a stored private score in a way that cannot be explained; keep wording neutral. Flag any policy concern you see in the report.
- Acceptance: rating saved once per visit per guest; rate limit holds; Arabic comments store and display correctly; Google link only appears for 4-5 stars and only when configured.

### F5. Coupons, timed offers, gift cards
- **Coupons** (Operations and up): code, percent or fixed amount, minimum spend, validity dates, weekday/hour window ("happy hour"), usage limit total and per phone, scope (whole bill / category / item), stackable or not. Guest enters on the Bill tab; staff can apply at the POS. Validated **server-side** every time.
- **Timed offers** (Operations and up): automatic discounts for a category or item in a time window, shown on the menu with a badge, no code needed.
- **Gift cards** (VIP): cashier sells a card for a fixed amount, gets a printable code (long, unguessable); balance ledger; partial redemption; cannot go negative; every movement logged. Redemption endpoint rate-limited against guessing.
- Interaction with billing: discounts follow the rule "off the gross first", captain discount cap still applies to staff-entered discounts, loyalty points and coupons stack only as the owner configures, a bill can never go below zero.
- Reports: discounts by coupon/offer, gift card liability (sold minus redeemed), exports.
- Acceptance: every limit enforced; expired, wrong-hour, over-limit, wrong-scope codes rejected with clear localized messages; totals match `bill()`; gift card ledger always balances.

### F6. Plan limits on tables, staff and branches (all tiers)
- Add `limits` to each plan in `features.js`: Basic 1 branch, 10 tables, 1 owner login; Operations 1 branch, 30 tables, 10 staff accounts; VIP 3 branches, unlimited tables and staff. Extra branch at 50% stays a billing matter, not code.
- Enforce **only on creating new** tables, staff accounts and branches (server `402` + upgrade info). **Existing venues over a limit keep working** (grandfathered): show a warning, never disable anything that already exists.
- Show usage vs limit in the owner admin and in `/super`; super admin can set a per-tenant override.
- Acceptance: new add at the limit is blocked with an upgrade message; an existing over-limit tenant is untouched; changing tier changes limits immediately; legacy plan names (`standard`, `pro`, `enterprise`, `demo`) still map correctly.

### F7. Offline order queue (staff apps first)
- Captain and cashier apps keep working through short internet drops: queue `staff_order`, `order_status`, `close_table`, `void_item`, `discount`, payments, etc. in IndexedDB with a client-generated **idempotency key** per operation; replay in order on reconnect; the server **deduplicates by key** so a retry never double-orders or double-closes.
- Clear UI: banner "Offline: N actions waiting", per-action state, a manual "retry now", and a conflict screen when the table changed meanwhile (for example paid elsewhere).
- Guests: the cart survives reloads and drops; **do not** silently queue a guest order. Show "No connection, order not sent yet" and let them retry.
- Works with the service worker (`public/sw.js`) without breaking push notifications or caching of the app shell; the app shell loads offline after first visit.
- Acceptance: simulate offline with the browser's network emulation: place orders, close a table, reconnect, and verify exactly-once results and correct totals; kill the tab mid-queue and verify the queue persists.

### F8. Shift close and Z-report (all tiers with POS)
- Audit what exists, then complete: open with float, cash in/out with reasons, X-report (mid-shift, does not close), Z-report (closes the shift): expected cash vs counted cash, variance, totals per method (cash, card, online, gift card), discounts, voids with reasons, tips, tax, service, takeaway/delivery split, items sold, sequential Z number per venue, who opened/closed.
- A closed shift is **immutable**. Printable on 80 mm via `escpos.js` and exportable (CSV/Excel). Owner report of all shifts with variance highlighted.
- Acceptance: numbers equal the sum of closed sessions in the period; closing with open tables warns and lists them; unpaid clears excluded from revenue as elsewhere; Z numbers never repeat or skip.

## 4. How to verify (this is mandatory)

### 4.1 Build a test harness first, on A:
Create `tests/` (Node's built-in `node:test`, no new test framework) with:
- A helper that starts the server on a **random free port** with a **fresh throwaway `DATA_DIR`** under `A:\Apps and Compilers\_work\tmp\elmenue-tests\<run-id>`, creates a tenant per tier (basic, operations, vip), logs in as owner/captain/kitchen, joins as guests, and tears everything down.
- A second run mode with `STATELESS=1` and an in-memory fake of the Supabase store so the **rpc/polling path** is tested too (every functional test below must pass in both modes).
- `tests/ui/` browser tests with `puppeteer-core` + Edge (separate browser context per guest because `localStorage` is shared per context; stub `window.confirm`), on a 375 px phone viewport and a desktop viewport, in English and Arabic.
- `npm test` runs API tests; `npm run test:ui` runs browser tests. Add both scripts to `package.json`.

### 4.2 Test catalogue (implement all; add more if you find gaps)

**Cross-cutting (X)**
- X-01 Old data: load a tenant file saved by the previous release; it opens, shows existing orders and history, and all new flags are off.
- X-02 Every new flag is OFF by default for existing tenants and has no visible effect when off.
- X-03 Tier gating: for each feature, a tenant below the required tier gets `402` + upgrade info from the API and a locked/hidden UI; at or above, it works.
- X-04 Tenant isolation: tenant A's token cannot read or change tenant B's coupons, payments, receipts, feedback, shifts or limits.
- X-05 i18n: every new key exists in `en`, `ar`, `fr`; no key renders as a raw id; Arabic shows Western digits and RTL layout without overflow at 375 px.
- X-06 Both run modes (WebSocket and stateless rpc) give identical results for every functional test.
- X-07 Concurrency: two clients mutating the same table at once never lose an update (compare-and-swap retries).
- X-08 Demo mode (`/demo`, in-browser engine) still loads and the new engine code runs there without Node-only APIs.
- X-09 Security sweep: unauthenticated calls to every new endpoint are rejected; rate limits trigger; no secret appears in any response, log or page source.

**F1 Upsell (UP)** UP-01 pairs configured show first; UP-02 fallback by best sellers; UP-03 never shows sold-out, hidden, out-of-hours or in-cart items; UP-04 accept adds exactly one line and the total updates; UP-05 dismiss persists for the visit; UP-06 metrics counts match; UP-07 off by default; UP-08 Basic tier cannot use it.

**F2 Payments (PAY)** PAY-01 sandbox success closes the share and records `online`; PAY-02 failure leaves the bill open; PAY-03 duplicate webhook records one payment; PAY-04 webhook with bad signature rejected and logged; PAY-05 delayed webhook resolved by the return-page poll; PAY-06 bill changed after init is detected; PAY-07 split bill, each pays a share, table closes only when fully paid; PAY-08 tip included in the charged amount; PAY-09 reports, receipt, Orders and shift totals show the online method; PAY-10 no card data anywhere in stored files; PAY-11 Paymob adapter signature test vectors pass; PAY-12 captain can still settle by cash while an online payment is pending without double-charging.

**F3 ETA (ETA)** ETA-01 receipt built from a closed session matches `bill()` totals to the cent; ETA-02 schema validation passes; ETA-03 submission to pre-production accepted; ETA-04 rejection shows in admin and can be retried; ETA-05 API down: table still closes, receipt queued, retried with back-off, queue survives a server restart; ETA-06 same receipt is never submitted twice; ETA-07 QR/reference prints on the receipt; ETA-08 accountant export complete; ETA-09 off by default and no behavior change when off.

**F4 Feedback (FB)** FB-01 one rating per guest per visit; FB-02 4-5 stars shows the Google button only when a link is configured; FB-03 1-3 stars stays private and notifies the owner; FB-04 dashboard average, trend and distribution correct against seeded data; FB-05 CSV export; FB-06 rate limit; FB-07 Arabic comment round-trips.

**F5 Coupons/offers/gift cards (CPN)** CPN-01 valid percent coupon; CPN-02 fixed coupon never exceeds the bill; CPN-03 minimum spend; CPN-04 expired; CPN-05 outside weekday/hour window; CPN-06 total usage limit; CPN-07 per-phone limit; CPN-08 wrong scope; CPN-09 stacking rules respected with loyalty and captain discounts; CPN-10 timed offer applies automatically inside its window and not outside; CPN-11 gift card sell, partial redeem, exact balance, cannot overspend; CPN-12 gift card codes unguessable and redemption rate-limited; CPN-13 liability report equals sold minus redeemed; CPN-14 totals always equal `bill()`.

**F6 Limits (LIM)** LIM-01 new table blocked at the limit with an upgrade message; LIM-02 same for staff and branches; LIM-03 over-limit existing tenant keeps every existing table/staff working; LIM-04 tier change updates limits immediately; LIM-05 super override works; LIM-06 legacy plan names map correctly; LIM-07 usage shown in admin and `/super`.

**F7 Offline (OFF)** OFF-01 offline order is queued and replayed once; OFF-02 duplicate replay deduplicated by idempotency key; OFF-03 queue survives tab close and browser restart; OFF-04 ordering preserved; OFF-05 conflict (table paid elsewhere) shown to the waiter, nothing double-applied; OFF-06 app shell loads offline after first visit; OFF-07 push notifications still work; OFF-08 guest cart survives reload, guest submit is not silently queued; OFF-09 banner shows the pending count and clears on success.

**F8 Shifts (SHF)** SHF-01 open with float; SHF-02 cash in/out; SHF-03 X-report does not close; SHF-04 Z-report totals equal the sum of closed sessions; SHF-05 variance computed correctly (expected vs counted); SHF-06 closing with open tables warns; SHF-07 closed shift immutable; SHF-08 Z numbers sequential with no gaps or repeats; SHF-09 80 mm print layout and export; SHF-10 methods include online and gift card.

### 4.3 Manual checks you cannot automate
List them in the report as `NEEDS HUMAN` with exact steps: printing on a real 80 mm printer, real iPhone Safari and Android Chrome run through the guest flow, push notifications on a real phone, one real low-value Paymob transaction, one real ETA pre-production receipt.

### 4.4 Definition of done (per feature)
1. All its tests pass in **both** run modes. 2. Old-data test passes. 3. Flag defaults OFF. 4. English, Ammiya and Franco strings complete. 5. Works at 375 px and desktop. 6. `docs/PROJECT_GUIDE.md`, `docs/SPEC_COVERAGE.md` and `README.md` updated. 7. Master plan updated and PDF rebuilt (section 6). 8. One commit on `release/next` with a clear message. Only then start the next feature.

## 5. Things you need from me (list them, do not guess)

Maintain `docs/NEEDS_FROM_OWNER.md` and keep it current. Expected entries:
- **Paymob:** merchant account, sandbox and live API keys, HMAC secret, integration ids for card and wallet, iframe id, webhook URL registration. Optionally Fawry merchant code and security key.
- **ETA:** business registration, POS registration with the tax authority, client id/secret, and any signing credential the official spec requires; which environment (pre-production first).
- **Google review link** for each pilot venue.
- A **separate staging** Supabase project (never test against production data).
- Real devices: an 80 mm thermal printer, an iPhone, an Android phone, a tablet.
- Business decisions: gift card denominations and expiry policy, coupon stacking defaults, whether online payment fees are passed to the venue.

## 6. Keep the master plan PDF current (every time)

After each feature is **done** (4.4), update the master plan:
1. In `docs/elmenue_Luxury_Master_Plan.html`, add a row to the **Release log** table (chapter "Release log and next release"): date, feature, tier, status (Shipped to branch / Verified / Blocked: needs owner), what changed in one sentence, test result (counts passed/total in both modes).
2. Move the feature from **Planned** to the tier feature lists (`F_OPS` / `F_VIP` arrays in the page's script) and the Product chapter's Planned tab, with accurate wording. Update pricing or limits text only if the code changed it.
3. Rebuild the PDF: `powershell -ExecutionPolicy Bypass -File docs\build_master_pdf.ps1`. Open the resulting `docs\elmenue_Luxury_Master_Plan.pdf` and check the new rows rendered.
4. Never invent results. If a test is blocked, say so in the log.

## 7. Order of work and final report

Order: audit → harness → F6 limits → F8 shifts → F4 feedback → F1 upsell → F5 coupons and gift cards → F7 offline → F2 payments → F3 ETA (largest and most dependent on me, so last, but start the official-spec reading early).

Finish with `docs/RELEASE_VERIFICATION.md`: a table of every test id with PASS / FAIL / BLOCKED (needs owner) / NEEDS HUMAN, counts per feature and per run mode, known limitations, risks for production rollout, the exact steps to enable each flag for one pilot venue, and rollback steps. If anything failed, say so plainly and do not mark the feature done.
