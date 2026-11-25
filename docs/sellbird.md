# Sellbird x TableTab

[Sellbird](https://github.com/ethanplusai/sellbird) is an open-source outreach agent: it finds cafés, writes personal emails, sends them
(after your approval) and handles replies. It runs on your own computer in `A:\Apps and Compilers\sellbird`. TableTab is what it sells.

## Two links between them
1. **Sellbird -> TableTab (webhook).** Sellbird posts every `lead.created`, `reply.received`, `meeting.booked` and `stage.changed` to
   `https://app.tabletab-tt.com/api/hooks/sellbird`, signed with `SELLBIRD_WEBHOOK_SECRET` (HMAC-SHA256, 5 minute window, duplicates ignored).
   See them in **/super > 🐦 Sellbird**. A reply that needs you, and every booked meeting, also email `CONTACT_TO`.
2. **TableTab -> Sellbird (leads).** People who write through the TableTab website contact form are available at
   `GET /api/hooks/sellbird/leads?since=<ms>` (bearer `SELLBIRD_FEED_TOKEN`). `scripts/tabletab_leads.py` in the Sellbird folder pulls them
   into Sellbird as inbound leads (first answer waits for your OK). Run it by hand or from Task Scheduler every 15 minutes.

## Server settings (Vercel, production)
`SELLBIRD_WEBHOOK_SECRET` and `SELLBIRD_FEED_TOKEN`: the same values as `SELLBIRD_WEBHOOK_SECRET` and `TABLETAB_FEED_TOKEN` in Sellbird's `.env`.
Change both sides together to rotate them.

## What is left for you in Sellbird
`sellbird.local.yaml` holds the TableTab pitch, ICP (cafés, restaurants, shisha lounges in Egypt / UAE) and the webhook. Fill in the lines marked
`SET_ME` (your name and sending address), then follow Sellbird's quick start: Claude CLI login, a warmed-up mailbox (Gmail / Microsoft 365 / SMTP)
and an address checker. Nothing is sent until you approve each email in the Outbox.
