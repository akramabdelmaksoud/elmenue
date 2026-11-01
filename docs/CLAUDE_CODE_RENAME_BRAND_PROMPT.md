# Claude Code prompt: rename the product to Table Tab and apply the brand

Paste everything below the line into Claude Code, run from the repository root.

---

## Your role

You are a senior full-stack engineer and careful release manager. You are renaming a live multi-tenant SaaS and applying a new visual identity **without breaking any venue that is using it today**. Work on a new branch, test everything, and report honestly. Never claim something works unless a test or a real run shows it.

## Context

- The product was called **elmenue**. It is now called **Table Tab** (Arabic line: **تيبل تاب**), "A product of **Pixel**" (Pixel is the company). An earlier working name, مائدة, was dropped: remove any trace of it if found.
- The app is Node 22 + Express 5, no framework, no build step. Vercel (stateless, polling through `POST /api/r/:slug/rpc`) and local mode (WebSockets). Supabase for storage. Three tiers in `features.js`. Languages: English, Egyptian Arabic (`ar`), Franco (`fr`) in `public/i18n.js`.
- `tenant.js`, `features.js`, `data.js` run in both server and browser demo mode, so keep them environment-neutral.
- The eight release features (F1 to F8) are on `release/next`. Start from that branch, not `main`.
- Brand reference (read it first): `docs/tabletab_brand_exploration.html`. Locked direction: the TT monogram, palette Midnight Brass, grotesque type. The idea: Table is where guests sit; Tab is the running bill and the interface tab.
  - Palette (Midnight Brass): Night `#0E0E10`, Charcoal `#17171A`, Ivory `#F5F0E6`, Brass `#C9A45C`, Emerald `#0F4C3A`. Keep tokens switchable so Ink & Tomato (`#0B1220`, `#121A2C`, `#F2F5FB`, `#FF6B4A`, `#3DDC97`) or Paper & Rust can be adopted later by changing values only.
  - Type: Bricolage Grotesque 800 (wordmark and headings), Instrument Sans (body and UI), IBM Plex Sans Arabic (Arabic UI), JetBrains Mono (numbers, receipts, tags).
  - Mark: concept 1, "Twin T": two T letters side by side with a small gap, bar and legs reading as a table. Rounded 3 px corners. Single-colour and mark-only versions required.
  - Slogan: Your table. Your tab. Alternatives: Open a tab. Not a queue. / Sit. Scan. Settle.
  - Rules: one brass action per screen, thin 1 px lines, tab-shaped corners (rounded top, flat bottom) on navigation chips, no brass text on ivory, no fork-and-spoon icons, no soft-drink imagery or colours that echo any existing "Tab" brand.

## Hard rules

1. **No venue may break.** Existing QR codes, tokens, sessions, saved data, push subscriptions and installed PWAs must keep working after deploy. If a change might invalidate any of them, stop and write a migration.
2. **Do not rename these in this task:** the GitHub repository, the Vercel project, environment variable names, database tables and column names, JSON data keys inside tenant documents, API route paths, cookie and token names, and `localStorage` / `sessionStorage` keys. Rename only what a person reads or sees. If a storage key must change, read the old key first and migrate it once.
3. Work on branch `brand/maida` created from `release/next`. Commit in small steps. Do not merge or push to `main`.
4. Venue-facing guest menus keep each venue's own theme (the 27 themes). The brand applies to the platform surfaces and to a "Powered by" line. Do not repaint a venue's menu in Table Tab colours.
5. Keep everything environment-neutral where files are shared with the browser demo.
6. Keep all three languages complete. Any new string needs English, Egyptian Arabic and Franco.
7. Do not add dependencies or a build step. Fonts load from Google Fonts with a real fallback stack, or are self-hosted if you can do so without a build step (state which you chose and why).
8. Do not commit secrets, `.bak` or `.err` files. Do not add attribution text for tools.

## Step 0: discover and plan (write the plan to `docs/RENAME_PLAN.md` before changing anything)

1. Run `git status`, confirm the branch, run the whole existing test suite and record the baseline (it must pass in both modes, ws and rpc, before you start).
2. Search the whole repo, case-insensitively, for `elmenue`, `el menue`, `el-menue`, `elmenu`, `Digital Menu`, `DigitalMenu`. List every hit in a table with: file, line, what it is, and a decision: **change**, **keep (technical)**, or **migrate**. Include HTML titles, meta tags, manifest, service worker cache names, push notification titles, receipts and printed tickets, exports and filenames, backup JSON, email or SMS text, error messages, i18n strings, super admin, tenant page, demo showroom, README and docs, and tests.
3. List every place the old name is used as an identifier a browser may have stored (service worker cache key, `localStorage` keys, IndexedDB names, manifest id, push topic). These are **keep or migrate**, never silently changed.
4. Decide the plan for each and write it down. Show it before you proceed with the edits.

## Step 1: the rename

Apply the **change** decisions:

- Product name: **Table Tab** in English and in Franco text. In Arabic UI use **تيبل تاب** next to or instead of the Latin name, consistently, from one constant `PRODUCT_NAME` / `PRODUCT_NAME_AR`.
- Page titles, headers, footers, manifest `name` and `short_name`, app install prompts, push notification titles, login and super admin screens, tenant link page, demo showroom text, error pages, and `README` and `PROJECT_GUIDE`.
- Exported file names: new files start with `tabletab-`. Do not break parsers that read old exports. Importers must accept both old and new names.
- Receipts and ETA receipts: the **seller** is always the venue, never the product. Do not put the product name where the seller's legal name belongs. The product may appear only in a quiet footer line on non-ETA receipts.
- Service worker: bump the cache version so new assets load, delete only old caches that belong to this app, and confirm an installed PWA updates without a manual reinstall. Test the upgrade path from a page loaded with the old worker.
- Manifest: change the name and icons. Keep the `id` and `start_url` stable so installed apps remain the same app. If `id` is missing, add it equal to the current start URL so future changes do not reinstall.
- Redirects: the live address stays on the existing domain until the owner supplies a new one. Build the app so the public base URL comes from one configuration value. Do not hard-code a new domain.

## Step 2: apply the brand to platform surfaces

Surfaces that get the brand: public landing or home page, login, super admin, owner admin (shell only: header, navigation, buttons, colours of chrome), tenant link page, demo showroom, staff apps' header bar (cashier, captain, kitchen), error and empty states.

1. Create one small shared stylesheet, `public/brand.css`, that defines the tokens as CSS custom properties: colours, fonts, spacing, radii, line widths. Surfaces use the tokens only. No literal brand hex values elsewhere.
2. Provide light and dark values for owner tools. Midnight Brass (dark) is the default look for the landing page and login. Respect `prefers-color-scheme` where the existing app already does.
3. Add the logo as inline SVG or small SVG files, in three versions: full lockup (TT mark, "Table Tab" wordmark, Arabic line), mark only, and one-colour. Use the Twin T mark from the exploration page. Draw it cleanly with equal corner radii and optical balance of bar and legs. It must read at 16 px. Generate the PWA icons (192, 512, maskable) and a favicon from it.
4. Staff apps must stay fast and legible: keep contrast at or above 4.5:1 for text. Gold is never used for small body text. Do not slow first paint: no large images, fonts with `display=swap`, and no layout shift.
5. Arabic screens are right-to-left, with line height 1.7. English follows the existing language switch. Check the right-to-left layout of every changed screen. Western digits stay, as the product already does through `App.money()`.
6. Add a **tab-shape** motif: chips, navigation and section tabs use rounded-top corners with a flat bottom. Use it consistently on staff apps and the owner admin.
7. Add a printable **table card** page for each venue: venue name, table number, QR, the line "Your table. Your tab." (Arabic: "طاولتك. حسابك.") and "Scan to order". It prints cleanly at A6. It uses the brand, not the venue theme, unless the venue has chosen otherwise.

## Step 3: "Powered by Table Tab" on guest menus

- Add a small, quiet footer line on the guest menu: "Powered by Table Tab" with the mark, linking to the product page.
- Make it a plan feature in `features.js`, named `poweredBy`, shown on **Basic** and **Operations**, and hideable on **VIP** (white label). Give the super admin an override.
- It must not appear on receipts, ETA documents, tickets, or exports.
- Mark this as an open business decision in `docs/NEEDS_FROM_OWNER.md` so the owner can change which tiers hide it.

## Step 4: tests (add `tests/g1_rename.test.js` and `tests/g2_brand.test.js`, follow the existing test helpers, run in both ws and rpc modes where relevant)

Rename tests (R):
- R-01 Search every user-visible file (HTML, i18n, manifest, service worker, receipts, exports, push text) for the old name: zero hits except an allow-list of technical identifiers listed in `docs/RENAME_PLAN.md`. The test fails if a new hit appears.
- R-02 All three languages have every new or changed key. No empty strings, no untranslated English in `ar` or `fr`.
- R-03 Manifest has the new name and short name, a stable `id`, icons at 192, 512 and a maskable icon, and every referenced icon exists.
- R-04 Service worker upgrade: simulate an old cache present, run activation, assert the new cache exists, the old app cache is deleted, and unrelated caches are untouched.
- R-05 Storage keys: a stored value under the old key is read, migrated once, and not lost. Running the migration twice changes nothing.
- R-06 Existing QR link, staff token and customer cart from a fixture created before the change still load and work.
- R-07 Exports: new files use the new name; the importer still accepts an old-format backup and restores the same data.
- R-08 Receipt: the seller on a receipt and on an ETA payload is the venue. The product name never appears in the seller field.
- R-09 Push notification titles use the new name.
- R-10 The public base URL comes from one configuration value; changing it changes every generated link (QR, table card, share links).

Brand tests (B):
- B-01 `brand.css` defines every token; no brand hex literal appears outside it (except in SVG assets and the test allow-list).
- B-02 Contrast: for each text and background pair used on the platform surfaces, the ratio is at least 4.5:1 (3:1 for large text). Compute it in the test from the tokens.
- B-03 Logo files exist in the three versions; each is valid SVG; the mark renders at 16, 32 and 40 px without clipping and the gap between the two T letters stays at least 1 px at 16 px.
- B-04 Right-to-left: pages that changed set `dir="rtl"` for Arabic and Franco-Arabic text where appropriate and do not use physical left or right margins for layout (use logical properties) in new CSS.
- B-05 `poweredBy` is on for Basic and Operations, can be switched off for VIP, can be overridden by the super admin, and never appears on receipts, tickets or exports.
- B-06 The table card page renders for a sample venue and table, contains the QR URL built from the base URL, and has print CSS for A6.
- B-07 No new dependency was added to `package.json` and no build step was introduced.
- B-08 Performance guard: total size of new CSS and SVG assets on the login page is under 60 KB, and no new blocking script was added.

Also run the **entire existing suite** in both modes and confirm nothing regressed.

## Step 5: browser check (do not skip, say clearly if you cannot)

Start the app locally and open each changed screen in a real browser at phone width (about 400 px) and desktop width, in Arabic and English, in dark and light where available. For each screen, record: loads without console errors, no horizontal scroll, text readable, Arabic is right-to-left, the primary action is clear. Take screenshots into `docs/screens/` (small files). If you cannot run a browser, say so, and list these checks as **not done**. Do not claim them.

## Step 6: rollout safety

1. Write `docs/RENAME_ROLLBACK.md`: how to return to the previous version in under five minutes (revert the deploy, what the service worker does on rollback, which storage keys would be affected).
2. Everything visual ships behind the existing deploy flow. The rename of storage and the service worker is the only risky part; list exactly what a venue user will notice (nothing, or one refresh).
3. Add a short "What's new" notice in the owner admin that appears once: "We are now Table Tab. Your menu, QR codes and data are unchanged." Dismissible, stored once per owner.

## Step 7: documents (do these after each good step, not only at the end)

- Update `docs/RELEASE_VERIFICATION.md` with the R and B test results, counts and anything not run.
- Update `docs/NEEDS_FROM_OWNER.md` with the items below.
- Update `docs/elmenue_Luxury_Master_Plan.html`: add rows to the release log (rename, brand surfaces, table card, powered-by), set honest statuses (Built, Built with a limit, Blocked, Not done), then rebuild the PDF with:
  `msedge --headless=new --disable-gpu --no-pdf-header-footer --run-all-compositor-stages-before-draw --virtual-time-budget=15000 --user-data-dir="A:/Apps and Compilers/_work/tmp/edgeprof" --print-to-pdf=docs/elmenue_Luxury_Master_Plan.pdf "file:///<absolute path to the html>"`
  Keep all work, caches and temp files on drive A:.
- Do not rename the document files in `docs/` in this task.

## Needs from the owner (list, do not guess)

1. Final domain for Table Tab, and the redirect plan from `elmenue.vercel.app`.
2. Domain, social handles, app-store and trademark checks for "Table Tab" in Egypt and the Gulf. "Tab" is a crowded word; confirm the pair is available.
3. A designer's finished logo files to replace the sketch mark (the code must make this a drop-in swap).
4. Pixel's legal name, address, support email and phone for footers and terms.
5. Which tiers hide "Powered by Table Tab".
6. Whether fonts should be self-hosted for privacy and speed.
7. The Arabic and English wording the owner wants for the "What's new" notice.
8. Real-device checks: install the PWA before and after, and confirm it updates.

## Final report format

End with a table: each step, status (Done, Done with limits, Not done, Blocked), what proves it (test id or screenshot), and what the owner must do. List every old-name hit you intentionally kept and why. State plainly what you did not run. Do not use words like "robust" or "seamless" unless a test shows it.
