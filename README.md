# QR Menu Platform (multi-restaurant SaaS)

- `/super` – platform owner: create restaurants, see stats for all of them
- `/r/<slug>/admin` – restaurant owner (email + password): menu, theme, QR codes, analytics
- `/r/<slug>/captain` – staff (PIN): live floor map and orders
- `/r/<slug>/t/<table>` – guest (scan the table QR)

Local: `npm install && npm start` (demo restaurant: `/r/demo`, demo@demo.com / demo123, PIN 1234; superadmin password printed on first run).

Production (Render / Railway / Fly – needs a long-running Node host for WebSockets, not Vercel):
set `SUPER_EMAIL`, `SUPER_PASSWORD`, `SECRET`, and `DATABASE_URL` (Postgres) so data survives deploys.
