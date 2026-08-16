# Stripe setup — step by step

This is the part I can't do for you (creating accounts and handling API
keys isn't something I'll do on your behalf) — but it's about 15 minutes
of clicking through Stripe's dashboard. Do this in **Test mode** first
(there's a toggle top-right in the Stripe Dashboard) so you can try the
whole flow with fake card numbers before taking real payments.

## 1. Create a Stripe account

Go to [stripe.com](https://stripe.com) and sign up, if you haven't already.
You can start building with Test mode before Stripe finishes verifying
your business details.

## 2. Create the two products/prices

In the Stripe Dashboard: **Product catalog → Add product**.

**Product 1 — one-time export**
- Name: `Clean HD Export`
- Pricing: `$2.99`, **One time**
- Save, then open the product and copy its **Price ID** (starts with
  `price_...`) — this goes into `STRIPE_PRICE_ONE_TIME`.

**Product 2 — subscription**
- Name: `Unlimited Monthly`
- Pricing: `$4.99`, **Recurring**, **Monthly**
- Save, then copy its **Price ID** — this goes into
  `STRIPE_PRICE_SUBSCRIPTION`.

## 3. Get your API key

**Developers → API keys → Secret key**. Copy it — this goes into
`STRIPE_SECRET_KEY`. In Test mode it starts with `sk_test_...`.

Never paste this into a chat with me or anyone else — only into Railway's
Environment Variables screen (step 6 below).

## 4. Add the webhook endpoint

Stripe's newer dashboards use **Workbench** instead of the classic
"Developers" menu, so the click path is a bit different now:

- Go straight to **dashboard.stripe.com/webhooks** (or, inside Workbench,
  click the **Webhooks** tab).
- Click **Create new destination** (this replaces the old "Add endpoint"
  button).
- Pick an API version (leave the default), choose **Events on your
  account** (not "connected accounts" — that's only for Connect/marketplace
  setups, which this app doesn't use).
- Select the event types to send: at minimum `checkout.session.completed`;
  also worth adding `invoice.paid`, `invoice.payment_failed`, and
  `customer.subscription.deleted` since the code already logs them. Click
  **Continue**.
- Select **Webhook** as the destination type (the other options,
  EventBridge/Event Grid, aren't relevant here).
- Endpoint URL: `https://YOUR-RAILWAY-DOMAIN/api/webhook`
  (use the real domain from Railway, e.g.
  `https://boomerang-app-production-b1d9.up.railway.app/api/webhook`)
- Click **Create destination**.
- Open the endpoint you just created and copy the **Signing secret**
  (starts with `whsec_...`) — this goes into `STRIPE_WEBHOOK_SECRET`.

Make sure you're still in **Test mode** (toggle top-right) while doing this
— test and live mode each need their own webhook endpoint, same as the API
keys.

## 5. Turn on the Customer Portal and invoice emails (no code needed)

- **Settings → Billing → Customer portal** → turn it on. This is the page
  your "Manage subscription" link sends people to.
- **Settings → Customer emails** → turn on "Email customers about
  successful payments" and "Email customers about subscription payment
  receipts" — Stripe will then automatically email a receipt/invoice after
  every payment, including every monthly renewal.
- Optional but recommended: on the same settings pages, upload your logo
  and pick a brand color so those emails and the portal match the site.

## 6. Add the environment variables in Railway

In your Railway project: **Settings → Variables** (or the "Variables" tab),
add:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ONE_TIME`
- `STRIPE_PRICE_SUBSCRIPTION`
- `STRIPE_WEBHOOK_SECRET`
- `SITE_URL` — your Railway domain, e.g.
  `https://boomerang-app-production-b1d9.up.railway.app` (no trailing `/`)

Railway will automatically redeploy after you save these.

## 7. Test it with a fake card

While still in Stripe **Test mode**, go to your live site, upload a video,
click "Buy this export", and on the Stripe checkout page use:

- Card number: `4242 4242 4242 4242`
- Any future expiry date, any 3-digit CVC, any postal code

You should land back on `export.html`, see it render, and get a clean MP4
download. Check **Stripe Dashboard → Payments** to see the test payment,
and **Customers** to see the test customer.

## 8. Go live

Once everything works in Test mode: flip the Dashboard's Test/Live toggle,
repeat steps 2–4 in **Live mode** (products, API key, and webhook are
separate between Test and Live), and update the Railway environment
variables with the new live values.
