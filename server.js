const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const multer = require("multer");
const { execFile } = require("child_process");

const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || "http://localhost:3000";
const PRICE_ONE_TIME = (process.env.STRIPE_PRICE_ONE_TIME || "").trim() || undefined;
const PRICE_SUBSCRIPTION = (process.env.STRIPE_PRICE_SUBSCRIPTION || "").trim() || undefined;

// Diagnostic only — reveals shape problems (stray whitespace/newlines/quotes
// from a copy-paste) in env vars WITHOUT logging the actual secret values.
function diagnoseEnvVar(name) {
  const v = process.env[name];
  if (v === undefined) {
    console.log(`${name}: NOT SET`);
    return;
  }
  console.log(
    `${name}: length=${v.length} startsWithWhitespace=${/^\s/.test(v)} ` +
    `endsWithWhitespace=${/\s$/.test(v)} containsInnerWhitespace=${/\s/.test(v.trim())} ` +
    `containsQuotes=${v.includes('"') || v.includes("'")} ` +
    `first6=${JSON.stringify(v.slice(0, 6))} last4=${JSON.stringify(v.slice(-4))}`
  );
}
["STRIPE_SECRET_KEY", "STRIPE_PRICE_ONE_TIME", "STRIPE_PRICE_SUBSCRIPTION", "STRIPE_WEBHOOK_SECRET", "SITE_URL"].forEach(diagnoseEnvVar);

// Stripe is optional at boot — the rest of the site (free tier) must keep
// working even if payments haven't been configured yet on this deployment.
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require("stripe")(process.env.STRIPE_SECRET_KEY.trim());
} else {
  console.warn("STRIPE_SECRET_KEY is not set — paid export endpoints will return an error until it's configured.");
}

const app = express();

// --- Stripe webhook -----------------------------------------------------
// Must be registered BEFORE express.json(), because Stripe's signature
// check needs the exact raw request body, not a parsed one.
app.post("/api/webhook", express.raw({ type: "application/json" }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send("Stripe webhook is not configured.");
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      (process.env.STRIPE_WEBHOOK_SECRET || "").trim()
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // We don't keep our own database — subscription status is checked live
  // against Stripe's API when needed (see /api/check-subscription). This
  // handler mainly exists so Stripe has a verified endpoint to call, and as
  // a place to add logging / alerting (e.g. on invoice.payment_failed)
  // later without changing the checkout flow.
  console.log("Stripe event received:", event.type);
  res.json({ received: true });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function requireStripe(res) {
  if (!stripe) {
    res.status(500).json({ error: "Payments aren't configured on this server yet." });
    return false;
  }
  return true;
}

// Stripe SDK errors (esp. StripeConnectionError) hide the actual root cause
// behind a generic message. Log everything useful so it shows up in Railway
// logs instead of just "An error occurred with our connection to Stripe."
function logStripeError(label, err) {
  console.error(`${label}: ${err.message}`);
  if (err.type) console.error(`  type: ${err.type}`);
  if (err.code) console.error(`  code: ${err.code}`);
  if (err.detail) {
    const d = err.detail;
    console.error(`  underlying cause: ${d && d.message ? d.message : d}`);
    if (d && d.code) console.error(`  underlying code: ${d.code}`);
    if (d && d.stack) console.error(`  underlying stack: ${d.stack}`);
  }
}

// --- Start checkout (one-time export or subscription) -------------------
app.post("/api/create-checkout-session", async (req, res) => {
  if (!requireStripe(res)) return;
  try {
    const { plan, trim, email } = req.body || {};
    if (plan !== "one-time" && plan !== "subscription") {
      return res.status(400).json({ error: "Invalid plan." });
    }
    const price = plan === "one-time" ? PRICE_ONE_TIME : PRICE_SUBSCRIPTION;
    if (!price) {
      return res.status(500).json({ error: `Missing Stripe price id for "${plan}" (set STRIPE_PRICE_${plan === "one-time" ? "ONE_TIME" : "SUBSCRIPTION"}).` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: plan === "one-time" ? "payment" : "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${SITE_URL}/export.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/studio.html`,
      customer_email: email || undefined,
      // The trim window travels with the Checkout Session itself (no
      // database needed) and is read back on the success page.
      metadata: {
        plan,
        trimStart: String(trim?.start ?? 0),
        trimEnd: String(trim?.end ?? 0),
        speed: String(trim?.speed ?? 1),
        loops: String(trim?.loops ?? 1),
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    logStripeError("create-checkout-session error", err);
    res.status(500).json({ error: "Could not start checkout." });
  }
});

// --- Verify a completed checkout (called from export.html) --------------
app.get("/api/verify-session", async (req, res) => {
  if (!requireStripe(res)) return;
  try {
    const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
    const paid = session.payment_status === "paid" || session.status === "complete";
    if (!paid) return res.json({ paid: false });

    res.json({
      paid: true,
      plan: session.metadata.plan,
      trim: {
        start: parseFloat(session.metadata.trimStart),
        end: parseFloat(session.metadata.trimEnd),
        speed: parseFloat(session.metadata.speed),
        loops: parseInt(session.metadata.loops, 10),
      },
      customerEmail: session.customer_details ? session.customer_details.email : null,
    });
  } catch (err) {
    logStripeError("verify-session error", err);
    res.status(400).json({ paid: false, error: "Could not verify this payment." });
  }
});

// --- Check whether an email has an active subscription -------------------
app.post("/api/check-subscription", async (req, res) => {
  if (!requireStripe(res)) return;
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ active: false });

    const active = await hasActiveSubscription(email);
    res.json({ active });
  } catch (err) {
    logStripeError("check-subscription error", err);
    res.status(500).json({ active: false });
  }
});

async function hasActiveSubscription(email) {
  const customers = await stripe.customers.list({ email, limit: 5 });
  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      price: PRICE_SUBSCRIPTION,
      limit: 1,
    });
    if (subs.data.length > 0) return true;
  }
  return false;
}

// --- Stripe Customer Portal (manage / cancel subscription) ---------------
app.post("/api/create-portal-session", async (req, res) => {
  if (!requireStripe(res)) return;
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email is required." });

    const customers = await stripe.customers.list({ email, limit: 1 });
    if (!customers.data.length) {
      return res.status(404).json({ error: "No subscription found for that email." });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: `${SITE_URL}/studio.html`,
    });
    res.json({ url: portalSession.url });
  } catch (err) {
    logStripeError("create-portal-session error", err);
    res.status(500).json({ error: "Could not open the billing portal." });
  }
});

// --- Server-side clean render (paid) --------------------------------------
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });

app.post("/api/render-clean", upload.single("video"), async (req, res) => {
  const cleanupUpload = () => { if (req.file) fs.unlink(req.file.path, () => {}); };

  if (!requireStripe(res)) { cleanupUpload(); return; }

  try {
    const { session_id } = req.body;
    if (!session_id) {
      cleanupUpload();
      return res.status(400).json({ error: "Missing session_id." });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    const paid = session.payment_status === "paid" || session.status === "complete";
    if (!paid) {
      cleanupUpload();
      return res.status(403).json({ error: "Payment not confirmed for this session." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No video uploaded." });
    }

    const start = parseFloat(session.metadata.trimStart);
    const end = parseFloat(session.metadata.trimEnd);
    const speed = parseFloat(session.metadata.speed) || 1;
    const loops = parseInt(session.metadata.loops, 10) || 1;

    const outputPath = await renderBoomerang(req.file.path, { start, end, speed, loops });
    res.download(outputPath, "boomerang-clean.mp4", (err) => {
      cleanupUpload();
      fs.unlink(outputPath, () => {});
      if (err) console.error("Download stream error:", err.message);
    });
  } catch (err) {
    console.error("render-clean error:", err.message);
    cleanupUpload();
    res.status(500).json({ error: "Rendering failed. Please try again." });
  }
});

// --- Server-side clean render for an existing subscriber (no new checkout) ---
app.post("/api/render-clean-subscriber", upload.single("video"), async (req, res) => {
  const cleanupUpload = () => { if (req.file) fs.unlink(req.file.path, () => {}); };

  if (!requireStripe(res)) { cleanupUpload(); return; }

  try {
    const { email, start, end, speed, loops } = req.body;
    if (!email) {
      cleanupUpload();
      return res.status(400).json({ error: "Email is required." });
    }
    const active = await hasActiveSubscription(email);
    if (!active) {
      cleanupUpload();
      return res.status(403).json({ error: "No active subscription found for that email." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No video uploaded." });
    }

    const outputPath = await renderBoomerang(req.file.path, {
      start: parseFloat(start),
      end: parseFloat(end),
      speed: parseFloat(speed) || 1,
      loops: parseInt(loops, 10) || 1,
    });
    res.download(outputPath, "boomerang-clean.mp4", (err) => {
      cleanupUpload();
      fs.unlink(outputPath, () => {});
      if (err) console.error("Download stream error:", err.message);
    });
  } catch (err) {
    console.error("render-clean-subscriber error:", err.message);
    cleanupUpload();
    res.status(500).json({ error: "Rendering failed. Please try again." });
  }
});

// Trim to [start,end], build the forward+reverse boomerang, scale so the
// longer side is at most 1080px, then repeat it `loops` times. Two ffmpeg
// passes (render once, then loop the result) is simpler and more robust
// than trying to repeat a filter-graph label directly.
function renderBoomerang(inputPath, { start, end, speed, loops }) {
  return new Promise((resolve, reject) => {
    const win = end - start;
    if (!(win > 0) || !isFinite(win)) {
      return reject(new Error("Invalid trim window."));
    }
    const safeSpeed = speed && isFinite(speed) && speed > 0 ? speed : 1;
    const segmentPath = inputPath + "-segment.mp4";
    const finalPath = inputPath + "-final.mp4";

    // Commas inside the if(...) expressions must be escaped — ffmpeg's
    // filtergraph parser otherwise reads them as filter-chain separators.
    const scaleExpr =
      "if(gt(iw\\,ih)\\,min(1080\\,iw)\\,-2):if(gt(iw\\,ih)\\,-2\\,min(1080\\,ih))";
    const filter =
      `[0]trim=${start}:${end},setpts=(PTS-STARTPTS)/${safeSpeed}[fwd];` +
      `[0]trim=${start}:${end},setpts=(PTS-STARTPTS)/${safeSpeed},reverse[rev];` +
      `[fwd][rev]concat=n=2:v=1:a=0,scale=${scaleExpr}[out]`;

    execFile(
      "ffmpeg",
      ["-y", "-i", inputPath, "-filter_complex", filter, "-map", "[out]", "-an", "-movflags", "+faststart", segmentPath],
      (err, stdout, stderr) => {
        if (err) {
          console.error("ffmpeg (segment) failed:", stderr && stderr.toString().slice(-2000));
          return reject(err);
        }
        const repeat = Math.max(1, loops || 1);
        execFile(
          "ffmpeg",
          ["-y", "-stream_loop", String(repeat - 1), "-i", segmentPath, "-c", "copy", "-movflags", "+faststart", finalPath],
          (err2, stdout2, stderr2) => {
            fs.unlink(segmentPath, () => {});
            if (err2) {
              console.error("ffmpeg (loop) failed:", stderr2 && stderr2.toString().slice(-2000));
              return reject(err2);
            }
            resolve(finalPath);
          }
        );
      }
    );
  });
}

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", stripeConfigured: Boolean(stripe) });
});

app.listen(PORT, () => {
  console.log(`Boomerang app listening on port ${PORT}`);
});
