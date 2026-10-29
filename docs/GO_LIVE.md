# elmenue — Go-live checklist

Tick everything before real customers get QR codes. Items marked **(auto)** are already covered by `npm test`.

## A. Security and secrets
- [ ] Every old secret replaced (see OWNER_CHECKLIST step 0). `.env.production` exists only on the server, `chmod 600`.
- [ ] `https://yourdomain.com/health` → `ok:true, storage:"postgres"`.
- [ ] `ssh root@IP` is refused; `ssh deploy@IP` works with your key; `sudo ufw status` shows only 22, 80, 443; `sudo fail2ban-client status sshd` works.
- [ ] `http://yourdomain.com` redirects to `https://`. Browser shows a lock on the main domain and on `test.yourdomain.com`.
- [ ] `https://yourdomain.com/internal/tls-ask?domain=x` → 404 (not reachable from the internet).
- [ ] `https://test.yourdomain.com/super` → 404 (the platform console is only on the main domain).
- [ ] Sign-in rate limit works: **(auto)** 13th attempt in a minute is refused.
- [ ] Open a staff page in Chrome DevTools → Console on `test.yourdomain.com`. With `CSP=report-only` it lists anything the Content-Security-Policy would block. If it is clean while you use every screen (order, bill, captain, kitchen, admin, QR), set `CSP=on` in `.env.production` and `./deploy.sh`.
- [ ] Supabase: Data API off (or table has row-level security — **(auto)** the app turns it on).
- [ ] Showroom demo restaurant: keep (useful for sales) or set `SHOWROOM=off`.

## B. Data safety
- [ ] Supabase Pro daily backups visible (Database → Backups).
- [ ] `bash ops/backup.sh` works and `bash ops/restore-test.sh` prints **RESTORE TEST PASSED**. Cron installed (`cat /etc/cron.d/elmenue`).
- [ ] Optional: off-site copy (`RCLONE_REMOTE`, e.g. Backblaze B2 / Hetzner Storage Box) and `BACKUP_PING_URL` (healthchecks.io free) so you are told when a backup does NOT happen.
- [ ] Restart test: `docker compose --env-file .env.production restart app`, then confirm the test restaurant, its photos and an open table are all still there. **(auto)** same check against Postgres.
- [ ] Hetzner server backups ticked.
- [ ] Know the restore command (top of `ops/restore-test.sh`). Practise it once on the test restaurant.

## C. Monitoring
- [ ] **UptimeRobot** (free): monitor 1 = `https://yourdomain.com/health` (keyword `"ok":true`), every 5 min (or 1 min on a paid plan), alerts to your phone/email. Monitor 2 = one restaurant's address `https://test.yourdomain.com/`.
- [ ] **Spend alerts**: Hetzner → Billing/Limits; Supabase → Organization → Billing, set a spend cap/alert; domain auto-renew date in your calendar.
- [ ] Optional error tracking: Sentry free tier. Not built in yet — tell the AI helper when you want it added (one small change in `server.js`).
- [ ] Look at the server now and then: `docker stats --no-stream` (app memory well below 1.4 GB), `df -h` (disk), `docker compose --env-file .env.production logs --tail 100 app`.

## D. Load test: 30 guests on one restaurant
Use a TEST restaurant. Turn "require table key" off for it in Admin settings, or export the table keys to `keys.json` (`{"1":"key1",...}`).
```
node tests/load/loadtest.js https://test.yourdomain.com --slug test --guests 30 --tables 6 --seconds 120
node tests/load/loadtest.js https://test.yourdomain.com --slug test --guests 30 --tables 6 --seconds 120 --orders   # sends real test orders
```
While it runs, on the server: `docker stats`. **Pass** = all 30 connected, no errors, p95 update < 1.5 s, app CPU not pinned at 100 %. (On a laptop against a local server: 30 guests, p95 7 ms — the server number is the one that counts.) If it fails, tell the AI helper the output.
Also open it from 3–4 real phones on mobile data and Wi-Fi, lock a phone for a minute, unlock: it should reconnect by itself.

## E. Legal pages
- [ ] `public/privacy.html` and `public/terms.html` exist at `/privacy` and `/terms` and are linked from the home pages. They are **templates**: fill every `[BRACKET]`, have a lawyer (Egyptian data-protection law 151/2020) review, delete the yellow notice box, deploy.
- [ ] Your subscription contract/invoice terms match the Terms page (prices, cancellation, support).

## F. Plans and pricing verified end to end
**(auto)** `tests/plans.test.js` checks through the real API: Basic is capped at 10 tables and has no staff accounts, Operations allows staff/cashier, VIP has no table cap, owner overrides raise one restaurant's limit, a suspended restaurant is locked out. Prices live in `features.js` (`PLANS`, in EGP). Manually: create one restaurant per tier in `/super`, log in as each owner and confirm locked features show an upgrade message.
(Found and fixed while testing: new Basic restaurants used to start with 18 sample tables, above their limit of 10.)

## G. QR codes — last, never earlier
- [ ] The final address of each restaurant is agreed (subdomain or own domain), DNS/HTTPS verified (`ops/check-domain.sh` for own domains).
- [ ] Admin → QR codes shows the final address (it uses the café's own domain if set, otherwise `slug.yourdomain.com`).
- [ ] Print one test sheet; scan with an iPhone and an Android phone; order; the table key (`?k=`) works.
- [ ] Then print everything.

## H. Day-one watch
- [ ] Be reachable the first service. Keep `./deploy.sh rollback` and the logs command at hand.
- [ ] Next morning: check UptimeRobot history, `docker stats`, and that the backup file appeared in `/var/backups/elmenue`.
