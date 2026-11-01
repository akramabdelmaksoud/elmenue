# Release verification — `release/next`

Written for: the owner and any engineer deciding whether to switch these features on for a pilot venue.

**Run:** `npm test` (31 automated checks, 0 failing). Every functional test runs twice — local WebSocket mode (`ws`) and stateless Vercel-style polling mode (`rpc`). Browser-level checks were **not** run in this session (see "Not verified").

Status words: **PASS** = an automated test proves it · **PARTIAL** = built, only part is proven · **NOT BUILT** · **BLOCKED** = needs something from the owner (see `NEEDS_FROM_OWNER.md`) · **NEEDS HUMAN** = needs a real device, printer or eyes.

## Counts

| Feature | Test file | Automated checks | ws | rpc |
|---|---|---|---|---|
| F6 plan limits | `f6_limits.test.js` | 3 | pass | pass |
| F8 shifts / Z-report | `f8_shifts.test.js` | 2 | pass | pass |
| F4 feedback + Google | `f4_feedback.test.js` | 2 | pass | pass |
| F1 upsell | `f1_upsell.test.js` | 2 | pass | pass |
| F5 coupons / offers / gift cards | `f5_coupons.test.js` | 3 (1 pure + 2 modes) | pass | pass |
| F7 offline queue (server side) | `f7_offline.test.js` | 3 | pass | pass |
| F2 online payments | `f2_payments.test.js` | 4 (HMAC vectors, mocked Paymob calls, 2 modes) | pass | pass |
| F3 ETA e-receipts | `f3_eta.test.js` | 4 (serialization/UUID, client vs fake gateway, 2 modes) | pass | pass |
| Cross-cutting X | `x_cross.test.js` | 6 | pass | pass |
| Smoke | `smoke.test.js` | 2 | pass | pass |

## Per catalogue id

**X** — X-01 PASS (a record stripped of every new field loads, bills unchanged) · X-02 PASS · X-03 PASS (tier table here; 402 per route inside each feature test) · X-04 PARTIAL (cross-venue calls refused on every new admin route; shifts/feedback isolation covered in their own tests, limits not separately) · X-05 PASS for the release's keys (en/ar/fr present, ar Arabic script, fr Latin script); 375 px layout NEEDS HUMAN · X-06 PASS (all feature tests run in both modes) · X-07 PARTIAL (6 simultaneous cart adds: all kept in `ws`; `rpc` keeps a consistent cart but compare-and-swap may drop concurrent taps — clients retry on 409) · X-08 PASS for engine loading without Node APIs; clicking through `/demo-local` NEEDS HUMAN · X-09 PASS (anonymous / wrong-role / other-venue refused on 16 new routes, gift lookups throttle with 429, secrets absent from guest config) — "page source / logs" not scanned.

**F1 UP-01..08** covered by `f1_upsell.test.js` (UP-05 dismiss is browser localStorage: NEEDS HUMAN).
**F4 FB-01..07** covered by `f4_feedback.test.js`.
**F6 LIM-01..07** covered by `f6_limits.test.js`.
**F8 SHF-01..08, 10** covered by `f8_shifts.test.js`; SHF-09 (80 mm layout) NEEDS HUMAN.

**F2** PAY-01 PASS · PAY-02 PASS · PAY-03 PASS (replay and two simultaneous webhooks → one sale) · PAY-04 PASS for rejection (401); "logged" PARTIAL (not written to a log) · PAY-05 NOT BUILT (the status endpoint `/pay/intent/:id` exists; the guest page does not poll it) · PAY-06 PARTIAL (a webhook whose amount differs from the intent is marked `mismatch` and not applied; a bill that grows after the intent is not re-checked) · PAY-07 PASS · PAY-08 PASS · PAY-09 PARTIAL (analytics, Orders, shift totals and the till show `online`; the printed receipt does not list the online amount separately) · PAY-10 not tested; by design no card data ever reaches the server · PAY-11 PASS against the documented algorithm (our own reading of Paymob's docs, not Paymob's published vectors) · PAY-12 PASS (late payment after the cashier cleared the table → `paid_unmatched`, no second sale). Real Paymob transaction: **BLOCKED**.

**F3** ETA-01 PARTIAL (receipt totals match the bill within ±0.05; not "to the cent" because ETA VAT is computed per line to 5 decimals) · ETA-02 NOT BUILT (no formal schema validator; field names and types follow the SDK pages) · ETA-03 **BLOCKED** (needs ETA pre-production credentials) · ETA-04 PASS · ETA-05 PARTIAL (down → retained with back-off and recovers; durable in the venue record; a server restart was not exercised) · ETA-06 PASS (accepted receipts are not re-sent; rejected ones are re-issued as a correction) · ETA-07 PARTIAL (API returns link + QR; printed layout NEEDS HUMAN) · ETA-08 PASS (JSON export of unsent receipts) · ETA-09 PASS.

**F5** CPN-01..04 PASS · CPN-05 PASS (pure window rules incl. overnight) · CPN-06 PASS · CPN-07 NOT BUILT (per-phone limit) · CPN-08 NOT BUILT (item/category scope) · CPN-09 PARTIAL (coupon vs captain discount vs timed offer, both stacking modes; loyalty redemption unchanged and applied after, not tested together) · CPN-10 PASS · CPN-11 PASS · CPN-12 PASS · CPN-13 PASS · CPN-14 PASS.

**F7** OFF-01 PARTIAL (server idempotent replay proven; the browser queue itself not exercised) · OFF-02 PASS · OFF-03 NEEDS HUMAN · OFF-04 PARTIAL (the queue is flushed in order; not tested) · OFF-05 PARTIAL (sold-out conflict reported to the waiter; "table paid elsewhere" reopens a session instead of warning) · OFF-06 NEEDS HUMAN · OFF-07 NEEDS HUMAN (push code untouched) · OFF-08 PARTIAL (carts live on the server so reload keeps them; guest sees a notice when offline; nothing is queued) · OFF-09 NEEDS HUMAN.

## Not verified in this session
* Any browser UI (375 px layouts, admin cards, guest coupon / pay boxes, cashier gift sale, QR on the receipt). The scripts of all pages pass a syntax check only.
* Real printer, drawer, phones, push, a real Paymob payment, a real ETA submission.

## Known limitations and risks
* Stateless mode has no background worker: ETA retries run when an owner presses *Send now*, when an admin opens the queue, or (local mode) every 60 s. Add a Vercel Cron call before relying on unattended retries.
* Two simultaneous ETA submissions in stateless mode could both send a receipt; ETA rejects the second as a duplicate.
* The sandbox payment gateway and the mock ETA mode are refused on production venues (allowed on the `showroom` venue and non-production runs).
* Coupons are not tied to a phone number or menu scope yet.
* Gift cards are not refunded on a voided sale; online payments are not refunded automatically (refund in the Paymob dashboard).

## Pilot venue: enabling steps (one feature at a time)
1. Super → set the venue on Operations (VIP for gift cards).
2. Admin → Reports (shifts, feedback, upsell, offline, online payments, e-receipts cards) or *Offers & gift cards* tab: tick the feature on.
3. Online payments: save Paymob keys, copy the webhook URL into the Paymob integration, make a 1 EGP real payment and check it appears as `online`.
4. E-receipts: pre-production only; save registration details and ETA credentials, use *Send now*, read the queue.
5. Watch one service; keep paper receipts running in parallel.

## Rollback
Every feature has its own switch: untick it and behaviour returns to the previous release at once; no data is deleted (history, coupons, queues stay). To roll the code back, redeploy the commit before `F6` on branch `release/next`.
