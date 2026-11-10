# Real-world scenarios TableTab covers (and the ones still open)

Status: **Built** = in the product and tested. **Partly** = covered, with a known limit. **Next** = not built yet.
Trade sources for the scenarios are linked at the bottom; most are vendor blogs, so the percentages are rules of thumb, not audited facts.

## 1. People and access

| Scenario | What can go wrong | TableTab | Status |
|---|---|---|---|
| Everyone shares one PIN | No one is accountable; reports count them as one person | Every person has a personal PIN; the old shared PIN can be turned off | Built |
| Weak PINs (1234, 111111) | Easy to guess | PINs are 6-10 digits; runs, repeats and common PINs are refused in production | Built |
| Old 4-digit PINs from before | Still weak | Flagged "short PIN, reset it" in the Staff list | Built |
| Fired employee keeps a session open | Can still take orders or see sales | Switching off or removing a person ends their open session at once; managers' sessions end the same way | Built |
| Manager password stolen or guessed | Owner-level damage | 10+ chars with capital, small letters and a number; common words refused; 5 misses lock the username 15 min (also for names that do not exist, so lockouts do not reveal accounts) | Built |
| Password stolen anyway | Account taken over | Optional authenticator-app code (TOTP) for owner and every manager; a code works once | Built |
| Owner hands out a password | It lives in chat history | The person must choose their own at first sign-in; old tokens die when it changes | Built |
| Temporary staff (season, event) | Forgotten accounts stay open | Optional end date on a team account | Built |
| A manager sees another branch | Data leak across branches | Tokens are bound to one branch; checked on every page, data call and live connection | Built |
| A manager creates a bigger boss | Privilege escalation | Owner makes managers; a branch manager makes only operations managers; nobody edits above their level | Built |
| A manager changes payment details | Money redirected | Payment keys, InstaPay, plan, owner account, branding: owner only. Managers can only save the dashboard refresh choice in settings | Built |
| A new feature forgets to restrict access | Leak by accident | Routes are closed to managers unless listed on purpose | Built |
| Who did what | Nothing to show in a dispute | Log of sign-ins, failures, lockouts, account changes and every change a manager makes, with "new device" flags | Built |
| Operations manager needs a floor view | - | Not part of the role (inventory and billing only) | By design |
| Sign-in alerts | Owner hears late | Alert badge and list for new-place sign-ins, lockouts, resets and 2-step turned off, with Mark as seen; push/email not yet | Built (in-app) |
| Approve void above an amount with a manager PIN | Collusion with a swamped manager | Owner sets void value and discount % limits; the captain screen asks for a manager's approval PIN, the approver is saved on the record, wrong PINs are throttled | Built |

## 2. Money and fraud

| Scenario | TableTab | Status |
|---|---|---|
| Void after the guest paid cash, then pocket it | The "Loss controls" page flags items voided after the bill was requested | Built |
| Voids above ~2% of sales / discounts above ~1% | Shown as percentages with red flags | Built |
| One person far above the others | Flagged when more than twice the average of the rest | Built |
| Discounts for friends (sweethearting) | Captain discount cap (default 20%), reason kept, discount author kept, totals per person | Built |
| Table closed without payment | Counted and listed per person | Built |
| Cash drawer short | Cashier shifts with X and Z reports, paid in/out, counted-cash variance; closed shifts cannot be edited | Built |
| Walk-outs (dine and dash) | Orders stay open until paid; online payment for those who want it; unpaid closures flagged | Partly (cash venues still depend on the floor) |
| Split bill arguments | Split per guest or per item, itemised | Built |
| VAT or service mistakes | Monthly VAT summary; tax and service set by the owner only | Built |
| Refunds above a limit need approval | Voids and discounts use the approval PIN; there is no separate refund flow | Built (voids, discounts) |

## 3. The floor

| Scenario | TableTab | Status |
|---|---|---|
| Someone orders from outside the venue | Table key printed in the QR plus an optional "must be at the venue" location lock | Built |
| A guest orders for a friend's table | Table key per table; table host and rekey | Built |
| Two parties reserve one table | One booking per table | Built |
| Guests leave and the table stays "open" | Captain closes it; session ends on every phone with a goodbye | Built |
| Kitchen overloaded | Priority lanes, ready alerts, sold out by itself at zero stock | Built |
| Internet drops | Offline queue on staff screens | Built |
| Item sold out while guests browse | Items turn sold out automatically when tracked stock hits zero | Built |
| Allergies | Dietary tags on items | Partly (no allergy confirmation step before sending to the kitchen yet) |
| Wrong table delivery | Table numbers on every ticket | Partly (no runner scan yet) |

## 4. Stock and purchasing

| Scenario | TableTab | Status |
|---|---|---|
| Theoretical vs actual food cost | Recipes, costing and food-cost report | Built |
| Counts that never match | Stocktakes with variance and a stock log | Built |
| Waste hidden as "sold" | Waste causes on voids | Built |
| Supplier invoice differs from the order | Purchase orders and invoices, per supplier | Partly (no automatic three-way match yet) |
| Receiving by the person who ordered | Creator and receiver are saved on each purchase order; same person is flagged in Loss controls | Built |

## 5. The guest after the meal

When a table closes, every phone on it sees: the rating card, then a goodbye with the guest's name and the venue's name, a reminder that they can scan the table QR again to order more, a 10-second countdown that closes the page, and a quiet link to TableTab. Owners can change the seconds, the message and the fallback with `settings.farewell`. Status: **Built**.

Closing the tab: browsers only let a script close a tab it opened itself, which a scanned QR does not. When the browser refuses, the card stays with "you can close this page". A blank page ("about:blank") can be switched on instead, but it looks like an error, so it is off by default.

## 6. Marketing ideas, from easy to ambitious

Already in the product: guest name on the goodbye, scan-again prompt, Google review request after a 4-5 star rating, loyalty points, owner's own message on the goodbye, "Powered by TableTab" link on every menu (attribution tag per venue, so you can see which venues bring visitors).

Next, in order of effect:
1. **Your own growth loop.** Every guest page links to TableTab with `utm_campaign=<venue>`. Count visits per venue in your analytics and reward the venues that bring leads (a free month per signed referral).
2. **Second-visit nudge.** On the goodbye, show the loyalty progress ("2 more visits for a free coffee") and a one-tap save to home screen.
3. **Win-back** (built: list in the Loyalty tab with a ready WhatsApp message). Message only guests who opted in.
4. **Digital receipt by WhatsApp or email** with the QR for the next visit and a review link.
5. **Birthday and anniversary treats** from the loyalty phone number.
6. **Time-boxed offers on the goodbye** ("show this at the counter for a free cookie today") to move quiet-hour traffic.
7. **Guest photo wall or tip jar** on the goodbye for venues that want it.
8. **A public "venue of the week" page** for your own site, built from permitted showrooms.
9. **A "TableTab verified" window sticker** with the venue's QR so passers-by can see the menu.

## Sources (trade, mostly vendor blogs)
- Voids, comps, skimming and sweethearting: [Katalyst](https://www.katalystos.com/blog/employee-theft-and-pos-fraud-in-restaurants), [Mirus](https://blog.mirus.com/restaurant-employee-theft-voids-comps), [Lightspeed](https://www.lightspeedhq.com/blog/types-of-fraud/), [Agilence](https://blog.agilenceinc.com/how-employees-steal-from-restaurants)
- POS permissions, unique logins and overrides: [Lavu](https://lavu.com/how-to-set-up-restaurant-pos-employee-permissions/), [Aldelo](https://www.aldelo.com/protect-your-profits-manage-staff-access-with-multi-level-pos-security-controls.html), [Toast](https://pos.toasttab.com/vi-us/blog/on-the-line/restaurant-pos-security)
- Shrinkage and receiving: [Wasserstrom](https://www.wasserstrom.com/blog/2023/07/18/restaurant-inventory-management-theft-shrinkage/), [Lightspeed](https://www.lightspeedhq.com/blog/restaurant-shrinkage/)
- Dine and dash, split bills, QR pitfalls: [Toast](https://pos.toasttab.com/th-us/blog/on-the-line/preventing-dine-and-dash-in-your-restaurant), [Sunday](https://sundayapp.com/en-gb/?p=102305)
- Post-meal QR engagement: [Bitly](https://bitly.com/blog/qr-codes-for-restaurants/), [Modern Restaurant Management](https://modernrestaurantmanagement.com/three-ways-qr-codes-will-reshape-restaurant-hospitality-in-2026/), [BonusQR](https://bonusqr.com/article/restaurant-customer-retention-strategies-10-ways-for-2026)
