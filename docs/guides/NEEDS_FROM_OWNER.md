# Needs from the owner

Written for: the owner. Everything here was skipped on purpose and is marked `BLOCKED: needs owner`. Nothing else is waiting on you.

| # | What | Why it is needed | Unblocks |
|---|---|---|---|
| 1 | **Paymob account**: API key, HMAC secret, card integration id, iframe id (per venue) | Real card / wallet payments. Enter them in Admin → Reports → Online payments, then paste the shown webhook URL into the Paymob integration | PAY: real transaction test |
| 2 | **ETA registration** for each venue: RIN, activity code, branch code, POS serial, client id / secret / pre-shared key, and a signing certificate or provider | E-receipts to ETA pre-production (production stays disabled in code). Receipts are currently sent unsigned (ETA says signature validation is not enforced yet) | ETA-03 |
| 3 | **Confirm ETA host names** (`api.preprod.invoicing.eta.gov.eg`, `id.preprod.eta.gov.eg`) and the receipt share-link format | The public SDK pages did not state them; they are in `eta.js` (`ENVS`, `shareUrl`) | ETA-03, ETA-07 |
| 4 | Each venue's **Google review link** | Shown to 4-5 star guests | F4 live use |
| 5 | A **separate staging Supabase project** | Safe place to test stateless mode with real data | pilot dry run |
| 6 | **Real devices**: an 80 mm thermal printer with drawer, an iPhone and an Android phone | Print layouts, WebUSB/Serial, QR on the receipt, the offline queue, push notifications, 375 px layouts | all NEEDS HUMAN items |
| 7 | **Business decisions**: refund policy for online payments and gift cards, gift-card expiry default, whether coupons need a per-phone limit or item scope, plan limits per tier | Not guessed in code | CPN-07, CPN-08 |
| 8 | **Rotate the secrets pasted in chat**: the Anthropic key and the earlier Supabase service key | They were visible in the conversation | security |
| 9 | Add a **Vercel Cron** hitting an ETA retry route (not built; needs item 2 first) | Unattended e-receipt retries in stateless mode | ETA-05 in production |
