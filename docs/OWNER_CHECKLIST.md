# elmenue — Owner checklist (simple language)

Do the steps in order. Anything marked **YOU** needs your hands (buying, clicking, pasting secrets). Nothing here is done for you automatically, and nobody (including the AI helper) should ever paste your passwords into a chat.

Words used: **server** = the rented computer (Hetzner). **database** = where the data lives (Supabase). **DNS** = the phone book that says "this name → that server".

---

## 0. Before you start: rotate old secrets
Everything that was ever shared in a chat or file must be replaced with NEW values. Make a password-manager entry for each:
Supabase secret key (the project is new, so just never reuse the old one) · owner password · captain PIN · `SECRET` · `SETUP_KEY` · `SUPER_EMAIL`/`SUPER_PASSWORD` · VAPID keys · the Vercel token. The old Vercel site can be switched off after go-live.

---

## 1. Buy the domain (YOU)
1. Pick the name (short, easy to type on a phone, e.g. `elmenue.com`). **Printed QR codes will contain it, so choose once and for good.**
2. Buy it at any registrar (Namecheap, Cloudflare Registrar, GoDaddy…). Turn on auto-renew and 2-step login.

## 2. Cloudflare DNS (YOU) — only used as the phone book
1. Make a free account at cloudflare.com → **Add a domain** → enter your domain → choose the **Free** plan.
2. Cloudflare shows two **nameservers**. At your registrar, replace the domain's nameservers with those two. Wait until Cloudflare says "Active" (minutes to a few hours).
3. Do NOT add records yet — you need the server's IP first (step 4).

## 3. Supabase database (YOU) — do this before the server
1. supabase.com → **New project**. Name: `elmenue-prod`. **Region: Central EU (Frankfurt)**. Plan: **Pro** (daily backups). Choose a long database password and save it in your password manager.
2. When ready: top bar **Connect** → tab **Connection string** → **Session pooler** (port **5432**). Copy it and put your password where it says `[YOUR-PASSWORD]`. This is your `DATABASE_URL`. (Do not use "Direct connection": it does not work from the server.)
3. **Project Settings → Data API** (or "API"): if you see an option to disable the Data API, turn it off — the app never uses it.
4. **Database → Backups**: confirm daily backups are listed.
5. You do **not** need to run any SQL. The app creates its table by itself on first start.

## 4. Hetzner server (YOU)
1. console.hetzner.cloud → create account → **New project** `elmenue`.
2. **Add server**: Location **Nuremberg or Falkenstein** (Germany, close to Frankfurt). Image **Ubuntu 24.04**. Type **CPX12** (if not offered in that location, pick the nearest shared-CPU type with 2 GB RAM or more). Networking: public IPv4 + IPv6.
3. **SSH key**: on your PC open PowerShell and run `ssh-keygen -t ed25519`, press Enter through the questions, then `type $env:USERPROFILE\.ssh\id_ed25519.pub`. Copy that one line, in Hetzner click **Add SSH key** and paste it. (Never share the file without `.pub`.)
4. Tick **Backups** (extra safety, small monthly fee). Name it `elmenue-1`. **Create & buy now**.
5. Write down the server's **IPv4 address**.

## 5. DNS records (YOU) — now that you have the IP
In Cloudflare → your domain → **DNS → Records → Add record**. Every record: **Proxy status = DNS only (grey cloud)**.

| Type | Name | Content | 
|---|---|---|
| A | `@` | server IPv4 |
| A | `*` | server IPv4 |
| A | `cname` | server IPv4 |
| AAAA (optional) | `@`, `*`, `cname` | server IPv6 |

`*` makes every `<restaurant>.yourdomain.com` work; `cname` is the name cafés with their own domain point to.

## 6. Prepare the server (YOU type, one time)
From your PC PowerShell (replace the IP):
```
ssh root@SERVER_IP
```
On the server:
```
apt-get update && apt-get install -y git
git clone <YOUR-GITHUB-REPO-URL> /home/deploy-src && cd /home/deploy-src
bash ops/harden-server.sh "PASTE-YOUR-PUBLIC-KEY-LINE-HERE"
```
This installs Docker, firewall (only ports 22/80/443), fail2ban, key-only SSH, automatic security updates, swap. When it finishes, **open a second PowerShell** and check `ssh deploy@SERVER_IP` works **before** closing the first one. After that root login is disabled, which is intended.

Then, as `deploy`:
```
sudo mv /home/deploy-src /home/deploy/elmenue && sudo chown -R deploy:deploy /home/deploy/elmenue
cd ~/elmenue
cp .env.example .env.production && chmod 600 .env.production
nano .env.production
```
Fill in every `CHANGE_ME` (`openssl rand -hex 32` makes a random value). `DATABASE_URL` is from step 3. Save with Ctrl+O, Enter, Ctrl+X.

## 7. First deploy
```
./deploy.sh
```
It builds, checks the config, starts, waits until healthy. First time takes a few minutes. Then open `https://yourdomain.com` — you should see the platform page with a lock icon. Check `https://yourdomain.com/health` shows `"ok":true,"storage":"postgres"`.

Set up the nightly backup and the weekly restore test (once):
```
sudo bash ops/install-cron.sh
bash ops/backup.sh && bash ops/restore-test.sh      # must end with RESTORE TEST PASSED
```

## 8. First test restaurant
1. Go to `https://yourdomain.com/super`, sign in with your `SUPER_EMAIL`/`SUPER_PASSWORD`.
2. **New restaurant**: name `Test Cafe`, slug `test`, owner email, plan. Save the password and captain PIN it shows (shown once).
3. Visit `https://test.yourdomain.com` — the first visit takes 2–5 seconds (the certificate is created). You see the café page; **Owner · Admin** logs in.
4. Admin → QR codes: scan one with your phone, order, and watch it on the captain screen. Old-style links `https://yourdomain.com/r/test/...` also work.

## 9. Add a NEW restaurant (every time)
1. `/super` → New restaurant (name, slug = the subdomain, owner email, plan).
2. Open `https://<slug>.yourdomain.com` once yourself (this "warms" the certificate).
3. Send the owner: their address, email, password, captain PIN. Owner changes the passwords on first login (Admin → Staff/Theme).
4. Tell them: **don't print QR codes until you both agree on the final address** (subdomain or own domain).

## 10. Give a restaurant its OWN domain
1. The café creates a subdomain at their domain provider, e.g. `menu.theircafe.com`, as a **CNAME** pointing to `cname.yourdomain.com`. (Bare `theircafe.com` can't be a CNAME — use `menu.` or `order.`. If they use Cloudflare, the record must be grey cloud / DNS only.)
2. `/super` → that restaurant → **domain** → type `menu.theircafe.com` → save. (Rejects typos, your own names, and domains already used.)
3. On the server: `bash ops/check-domain.sh menu.theircafe.com` — shows if the CNAME is right and visits the site (makes the certificate). DNS can take up to a few hours.
4. Admin → QR codes now shows the new address. **Print QR codes only now.** Old `/r/slug` and `slug.yourdomain.com` links keep working, so earlier QR codes are not wasted.

## 11. Updating later / going back
- New version: push to GitHub, then on the server `cd ~/elmenue && ./deploy.sh` (a few seconds of interruption; phones reconnect by themselves).
- Try a specific branch/tag: `./deploy.sh my-new-branch`.
- Something wrong? `./deploy.sh rollback` returns to the previous version in under a minute.
- What is running: `./deploy.sh status`. Logs: `docker compose --env-file .env.production logs -f app`.
- Change a setting: edit `.env.production`, then `./deploy.sh`.
