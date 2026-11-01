# Spec coverage (master implementation prompt → this codebase)

The project already existed as a plain Node + Express app (no build step). The spec was built **on top of it** instead of rewriting it in Next.js, so the Vercel deploy, the in-browser demo and the existing POS/KDS/analytics keep working.

## Tiers and feature gating — `features.js`

| Tier | Plan id | Price (EGP / month) | Unlocks |
|---|---|---|---|
| 1 Starter QR Ordering | `basic` | 600–800 | QR menu, table ordering, one shared captain PIN screen, micro-service requests, basic admin. No kitchen screen or named staff. |
| 2 Operations & POS | `operations` | 1,200–1,500 | waiter view + KDS, pending/kitchen lock, party size, trilingual |
| 3 Enterprise VIP & AI | `vip` | 2,000+ | loyalty, EGP↔points ratios, AI photo OCR, admin copilot, Fasheekh themes, multi-branch analytics |

Higher tiers include the lower ones. Old plan names still work: `standard→operations`, `pro/enterprise/demo→vip`.
`featuresOf(plan)` is sent to every client as `config.features`; the engine (`tenant.js`) and the API (`server.js`, `402` + `upgrade`) both enforce it, the UIs only hide/lock.

## Multi-tenant + RBAC

* **Super Admin** `/super` — create cafés (slug = URL `/r/<slug>`, owner credentials, **custom domain**, **branch group**), change tier, suspend, reset logins, open any admin, platform analytics incl. subscription revenue (MRR) and cafés per tier.
* **Cafe owner** `/r/<slug>/admin` — isolated per tenant (tokens carry the slug; every route checks it).
* **Waiter** `/r/<slug>/captain` — floor map, orders, micro-service calls with sound + banner showing the table number. **Accept** an order → *In kitchen*.
* **KDS** `/r/<slug>/kitchen` — Tier 2+ (Pending → In kitchen → Ready).
* **Works on Vercel**: with Supabase configured and `SINGLE_RESTAURANT` **unset**, every café is its own row `r_<slug>` (stateless, polling, compare-and-swap). Set `SUPER_EMAIL`, `SUPER_PASSWORD`, `SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
  Custom domains: add the domain to the Vercel project, then enter it on the café in `/super`; `/` on that host redirects to the café.

## Guest flow (customer.html)

* Lands on **Home** (branding, promos, Wi-Fi tap-to-copy, language picker, **party size**, big **Show Menu / شوف المنيو** button). A **Home** button stays in the header on every other screen.
* **Micro-service bar** (always visible): 💧 Water · 🧻 Napkins · 🍴 Cutlery & covers · 🛎️ Call waiter.
* **Checkout → Review screen** → **+ Add more items** returns to the menu with the cart intact → **Proceed to Checkout** submits.
* **Pending** (`received`): banner *"masmo7lk terga3 f kalamk aw te3addel haga lehad mayeb2a in kitchen"* (Franco) / EN / Ammiya text; guest can change amounts, remove items or cancel the order.
* **In kitchen**: edits and cancel are refused **by the server** and the banner says to call the waiter.
* **Loyalty card** (Tier 3): join with a mobile number, see points, redeem on the Bill tab.

## Languages — `public/i18n.js`

`en` English · `ar` **Egyptian Ammiya** (RTL; replaces the old formal Arabic strings) · `fr` **Franco-Arabic**. Every key exists in all three. The café picks the default (Admin → Theme & settings or tell the copilot); guests switch on the Home/Profile screen. The Basic tier has one language (the default).

## Admin power features (Tier 3)

* **Loyalty** tab: earning ratio (EGP per point), redemption ratio (points → EGP), member list, manual ± points, today's numbers. Points are earned on `net` (after discounts, before service/tax) when the table is paid; unpaid clears earn nothing.
* **AI menu scan** tab: upload a photo → editable rows → import. With `ANTHROPIC_API_KEY` a vision model reads the photo (`ANTHROPIC_MODEL` optional); without it a sample menu is returned so the flow can be demoed.
* **AI Copilot** panel: answers redeemed points, best seller, revenue, open tables, low stock; can switch the default language, mark items sold out, set the points ratio. With `ANTHROPIC_API_KEY`, anything it doesn't understand is answered by the model from a data summary.
* **Themes**: Bean & Bloom, Espresso, Modern pink, Minimal white, Custom, plus **Dark Neon Glass**, **Minimalist Luxury**, **Vibrant Egyptian Café** (`public/fasheekh.css`, VIP only).
* **Branches** tab: revenue per branch for cafés sharing a group name.
* **Guest home screen** card: Wi-Fi and up to 3 promotions (EN/AR).

## Live demo for field sales

`/demo` runs the whole app in the browser (no database). The 🎭 Demo pill (bottom-right) has a **tier switcher** so you can show a café owner exactly what Tier 1, 2 and 3 look like.

## Known limits / next steps

* Loyalty identifies a member by phone number only (no SMS OTP). Anyone who knows a number can see that member's points at a table — add OTP before using real customer data.
* The copilot's built-in understanding is keyword-based (English + a few Arabic words); the model fallback needs an API key.
* Multi-branch groups are linked by a shared group name set by the platform owner; there is no cross-branch menu sync.
* Waiter "accept / reject guest modification" is covered by the pending-edit window + the Accept button; there is no per-change approval queue.
* `favicon.ico` is missing (404 in the console, harmless).

## Next release (8 features) — coverage

F1 upsell, F2 online payments (sandbox + Paymob adapter), F3 ETA e-receipts (mock + pre-production; production refused), F4 feedback + Google reviews, F5 coupons / timed offers / gift cards, F6 plan limits, F7 offline queue for staff apps, F8 shifts + Z-report are built, flagged, tier-gated and tested in both run modes. Items not built or not provable without the owner or a device are listed per test id in `RELEASE_VERIFICATION.md` and `NEEDS_FROM_OWNER.md`.
