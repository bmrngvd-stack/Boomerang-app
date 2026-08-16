(() => {
  "use strict";

  const PLANS = {
    "one-time": {
      kicker: "One-time export",
      title: "Clean 1080p export",
      desc: "Watermark-free, full resolution MP4. Ready right after checkout.",
      price: "€2.99",
      fine: "One-time charge. Your export credit never expires.",
      cta: "Pay and export",
    },
    subscription: {
      kicker: "Unlimited plan",
      title: "Unlimited clean exports",
      desc: "Unlimited 1080p and GIF exports for as long as you stay subscribed.",
      price: "€4.99 / month",
      fine: "Renews monthly. Cancel any time from your account page.",
      cta: "Pay and subscribe",
    },
  };

  const modal = document.getElementById("paywall");
  if (!modal) return;

  const kicker = document.getElementById("paywall-kicker");
  const title = document.getElementById("paywall-title");
  const desc = document.getElementById("paywall-desc");
  const price = document.getElementById("paywall-price");
  const fine = document.getElementById("paywall-fine");
  const cta = document.getElementById("paywall-cta");
  const note = document.getElementById("paywall-note");
  const restoreBtn = document.getElementById("paywall-restore");

  let lastFocused = null;
  let currentPlanKey = "one-time";

  function openPaywall(planKey) {
    currentPlanKey = planKey;
    const plan = PLANS[planKey] || PLANS["one-time"];
    kicker.textContent = plan.kicker;
    title.textContent = plan.title;
    desc.textContent = plan.desc;
    price.textContent = plan.price;
    fine.textContent = plan.fine;
    cta.textContent = plan.cta;
    cta.disabled = false;
    note.textContent = "";
    lastFocused = document.activeElement;
    modal.classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
    cta.focus();
  }

  function closePaywall() {
    modal.classList.add("is-hidden");
    document.body.style.overflow = "";
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.querySelectorAll("[data-plan]").forEach((btn) => {
    btn.addEventListener("click", () => openPaywall(btn.getAttribute("data-plan")));
  });

  modal.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", closePaywall);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("is-hidden")) closePaywall();
  });

  cta.addEventListener("click", async () => {
    cta.disabled = true;
    note.textContent = "Redirecting to secure checkout…";

    const trim = window.BoomerangStudio && window.BoomerangStudio.getTrimState
      ? window.BoomerangStudio.getTrimState()
      : { start: 0, end: 0, speed: 1, loops: 1 };

    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: currentPlanKey, trim }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      note.textContent = data.error || "Couldn't start checkout — try again.";
    } catch (err) {
      note.textContent = "Couldn't reach the server — check your connection and try again.";
    }
    cta.disabled = false;
  });

  restoreBtn.addEventListener("click", async () => {
    const email = window.prompt("Which email did you subscribe with?");
    if (!email) return;
    note.textContent = "Checking…";
    try {
      const res = await fetch("/api/check-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      note.textContent = data.active
        ? "Active subscription found for that email. Use the same email if asked again when exporting."
        : "No active subscription found for that email.";
    } catch (err) {
      note.textContent = "Couldn't reach the server — try again.";
    }
  });
})();
