# Digital QR Menu

Waiterless QR restaurant/cafe platform: group table ordering, captain floor map, admin analytics.

    npm install
    npm start        # http://localhost:3000

Pages: `/` home, `/captain`, `/admin`, `/t/<table number>` (guest).

Needs a long-running Node host (WebSockets + in-memory state) — not serverless platforms like Vercel.
