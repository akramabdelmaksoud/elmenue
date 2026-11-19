# Integration Hub (Super Admin > café row > 🔌 POS)

Connect a café that already has its own POS or database, with no code change per customer.

## What it does
1. **Menu sync**: TableTab calls the café's *Menu Sync URL* (GET, JSON), finds the list of items, maps its keys to ours and
   creates / updates items. Items are matched on the POS item id (`item.ext`). Photos, options, recipes and costs are never touched.
   Items that disappear from the POS are marked sold out, not deleted. Runs on the schedule you pick, or press **Sync menu now**.
2. **Order push**: every new order (table, online, captain) is queued with the order itself and POSTed to the *Order Push URL*,
   signed, retried with growing pauses (8 attempts). A 4xx answer other than 408/429 is a final rejection and shows under
   "Orders that could not be delivered".

## Set up a café
1. Open `/super`, press **🔌 POS** on the café.
2. Enter the Menu Sync URL and / or Order Push URL (HTTPS only), pick the login (none, API key header, Bearer token, Basic).
3. **Test menu connection**: shows status, speed, a sample response and the keys found. **Auto-detect** fills the mapper; fix any field
   by hand (dot paths such as `pricing.amount` work; "Divide price by 100" for piasters / cents). Name and price are required.
4. **Test order endpoint** sends a `test.ping` (no real order).
5. Tick **Integration is on** and **Save**.

## Order payload
```
POST <Order Push URL>
X-TableTab-Event: order.created
X-TableTab-Delivery: <unique id, use it to de-duplicate>
X-TableTab-Signature: sha256=<hex HMAC-SHA256 of the raw body, key = the café's signing secret>

{ "event": "order.created", "restaurant": "<slug>", "delivery_id": "...", "sent_at": "...",
  "order": { "id", "table", "type": "table|takeaway|delivery|car", "source": "guest|online|staff", "created_at",
    "items": [ { "ext_id": "<POS item id or null>", "item_id", "name", "qty", "unit_price", "options", "note" } ], "total" } }
```
Verify on the POS side (Node):
```js
const sig = 'sha256=' + require('crypto').createHmac('sha256', SIGNING_SECRET).update(rawBody).digest('hex');
if (!require('crypto').timingSafeEqual(Buffer.from(sig), Buffer.from(req.headers['x-tabletab-signature']))) reject();
```
The signing secret is shown (and can be regenerated) in the modal, super admin only.

## Security
- API keys, tokens and passwords are stored sealed (AES-256-GCM keyed from `SECRET`) and are never sent back to the browser (masks only).
  Changing `SECRET` makes them unreadable: enter them again.
- Outbound calls: HTTPS only (HTTP only in development), no credentials in the URL, no redirects, 8 s timeout, 1 MB response cap, and
  private / loopback / link-local / cloud-metadata addresses are refused at connect time (so DNS tricks cannot reach the internal network).
  `INTEGRATION_ALLOW_LOCAL=1` lifts the address check for local testing only.

## Scheduling
- Container / VM (`node server.js`): a timer runs every 4 s (delivery retries) and honours each café's sync interval.
- Vercel (serverless): orders are delivered right after they are saved (up to 3 s wait), retries and scheduled syncs run from
  `GET /api/cron/integrations` with `Authorization: Bearer $CRON_SECRET`. `vercel.json` ships a daily cron (safe on every plan).
  For minute-level syncs set the schedule to `* * * * *` (Vercel Pro) or call that URL from any uptime pinger. Set `CRON_SECRET` in the project.

## Other settings added in the same release
- `settings.shisha` (café admin > Guest home screen): shows a 🔥 coal button; the captain gets "Table N: Shisha coal"; 90 s cooldown per guest.
- `settings.games`: shows the Games tab (`/games.html`: Ludo, Sudoku, Solitaire; one file, no network needed once loaded).
- Photo search in the item list (🔍): set `PEXELS_API_KEY` (free) or `UNSPLASH_ACCESS_KEY` on the server.
- Item options: exact counter / slider per group and a step-by-step builder (`item.steps`); SQL mirror in `docs/supabase_modifier_schema.sql`.
