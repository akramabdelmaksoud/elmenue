# Release audit — what existed before, what this release added

Written for: engineers taking over the code. Audit taken at the start of the Next Release work (baseline commit before `F6`).

| Feature | Before this release | Now | Rules relied on |
|---|---|---|---|
| F1 Upsell | **Missing** (only a best-seller badge idea) | Built: owner pairings, best-seller fallback by complementary category, metrics, CSV | `features.upsellFor` is pure and shared by browser + tests; flag `settings.upsell.enabled` |
| F2 Online payments | **Missing** (payments were cash/card recorded at the till) | Built: sandbox gateway + Paymob adapter, HMAC-verified idempotent webhook, split bills, `online` method in history/reports | Amount always computed server-side from `bill()`; card data never touches the server; flag `settings.onlinePay` |
| F3 ETA e-receipts | **Missing** | Built for the mock and ETA pre-production only: SC v1.2 builder, serialization + UUID chain, durable queue with back-off, export, receipt QR. Production refused in code | `eta.js`; flag `settings.eta`; queue lives in the venue record (`rec.eta`) |
| F4 Feedback + Google | **Partial** (a star form that stored comments) | Built: one rating per guest per visit, Google link for 4-5 stars, private + alert for 1-3, dashboard, CSV, handled flag | Google link never in public config |
| F5 Coupons / offers / gift cards | **Missing** (only a free-form staff discount and loyalty points) | Built: coupon codes, timed offers, gift cards (VIP), stacking switch, reports | Billing rule: discount off gross first, then service + tax on net (`bill()`); 2-decimal rounding |
| F6 Plan limits | **Missing** (tiers gated features, not counts) | Built: tables / staff / branches limits per tier, super override, usage bars | Existing venues over a limit keep everything working; only new additions are blocked |
| F7 Offline queue | **Missing** (the staff pages showed "Reconnecting…") | Built: IndexedDB queue for non-money staff actions, idempotency keys deduplicated by the engine, banner, conflict notices, staff app shell in `sw.js` | Payments, voids and discounts are never queued |
| F8 Shifts + Z-report | **Partial** (daily totals only) | Built: open with float, paid in/out, X report, Z report with sequential numbers, variance, CSV, immutable once closed | Unpaid clears excluded from revenue |

## Constraints honoured
No framework or bundler; `tenant.js`, `features.js`, `data.js` stay free of Node-only APIs (checked by test X-08); new fields are created in `ensure()` and none renamed or removed (X-01); no sales record is deleted anywhere; every new route authorises by slug (X-09); work ran in both modes; test output stayed on drive A:.

## Where things live
`features.js` (tiers, limits, pure rules) · `tenant.js` (engine: `bill`, `closeSession`, `applyOnline`, idempotency) · `server.js` (routes) · `payments.js` · `eta.js` · `public/*.html` (UIs) · `tests/` (31 checks).
