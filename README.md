# Boomerang — MVP with Stripe payments

The design/frontend comes from the Claude Design version (`C:\Boomerang`,
the "ember" orange design system). This project wires it up to a real
Node server with working payments and a server-side clean export.

## What works now

- **Free tier** — fully client-side: upload, trim, live preview, watermarked
  480p `.webm` download. Nothing is uploaded to a server.
- **Paid one-time export ($2.99)** and **subscription ($4.99/mo)** — real
  Stripe Checkout. On success, the browser uploads the original video to the
  server, which renders a clean, watermark-free MP4 (scaled to a max of
  1080px on the longer side) with FFmpeg, and streams it back for download.
- **Subscription cancellation** — the "Manage subscription" link (footer)
  asks for the subscriber's email and opens Stripe's hosted Customer Portal,
  where they can cancel or update payment details themselves.
- **Repeat renders for existing subscribers** — `/api/render-clean-subscriber`
  exists on the server (checks for an active subscription by email before
  rendering), but the studio.html UI doesn't have a button wired to it yet —
  see "Not built yet" below.

None of this works until you configure Stripe (see `STRIPE_SETUP.md`) and
set the environment variables below.

## Environment variables (set these in Railway, never in code)

| Variable | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys |
| `STRIPE_PRICE_ONE_TIME` | Price ID of the $2.99 one-time product |
| `STRIPE_PRICE_SUBSCRIPTION` | Price ID of the $4.99/mo subscription product |
| `STRIPE_WEBHOOK_SECRET` | Created when you add the webhook endpoint in Stripe |
| `SITE_URL` | Your live URL, e.g. `https://boomerang-app-production-b1d9.up.railway.app` (no trailing slash) |

Full step-by-step for all of these: see `STRIPE_SETUP.md` in this same zip.

## Run it locally

```
npm install
npm start
```

The free tier works immediately. For the paid flow to work locally too,
create a `.env`-equivalent by setting the variables above in your shell
before `npm start` (or use a tool like `dotenv` — not set up here to keep
things simple; ask if you want that added).

## Not built yet

- A button on `studio.html` for an already-subscribed visitor to export
  again without going through Checkout a second time (the server endpoint
  for this, `/api/render-clean-subscriber`, already exists).
- Invoice/receipt emails — these need one toggle in the Stripe Dashboard,
  not code (see `STRIPE_SETUP.md`).
- Privacy/Terms page content (currently just anchor links).
- A guaranteed `.mp4` for the *free* download (it's `.webm` today — fine
  for most platforms, but worth revisiting).

## Deploying

Same as before: push to the GitHub repo connected to Railway, and it
redeploys automatically. Remember to set the environment variables in
Railway's dashboard (Settings → Variables) — they don't come from the repo.
