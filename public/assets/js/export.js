(() => {
  "use strict";

  const statusEl = document.getElementById("export-status");
  const actionsEl = document.getElementById("export-actions");
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  function fail(message, showStartOver = true) {
    statusEl.textContent = message;
    actionsEl.innerHTML = showStartOver
      ? '<a class="btn-primary" href="index.html">Start over</a>'
      : "";
  }

  async function run() {
    if (!sessionId) {
      fail("This page needs a checkout session — please start from the pricing options in the editor.");
      return;
    }
    if (!window.BoomerangStorage) {
      fail("Something went wrong loading this page — try reloading.");
      return;
    }

    statusEl.textContent = "Checking your payment…";
    let verify;
    try {
      const res = await fetch("/api/verify-session?session_id=" + encodeURIComponent(sessionId));
      verify = await res.json();
    } catch (err) {
      fail("Couldn't reach the server to verify your payment. Reload this page to try again.");
      return;
    }

    if (!verify.paid) {
      fail("We couldn't confirm this payment yet. If you completed checkout, reload this page in a few seconds.");
      return;
    }

    statusEl.textContent = "Loading your video…";
    let file;
    try {
      file = await window.BoomerangStorage.loadFile();
    } catch (err) {
      file = null;
    }

    if (!file) {
      fail(
        "Payment confirmed, but your original video is no longer available in this browser " +
        "(this can happen if you cleared site data or switched devices). " +
        "Contact hello@boomerang.example with your payment confirmation and we'll sort it out.",
        false
      );
      return;
    }

    statusEl.textContent = "Rendering your clean 1080p export — this can take a moment…";
    const form = new FormData();
    form.append("video", file);
    form.append("session_id", sessionId);

    let response;
    try {
      response = await fetch("/api/render-clean", { method: "POST", body: form });
    } catch (err) {
      fail("Couldn't reach the server to render your video. Reload this page to try again.");
      return;
    }

    if (!response.ok) {
      let data = {};
      try { data = await response.json(); } catch (e) { /* ignore */ }
      fail(data.error || "Rendering failed. Reload this page to try again.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    statusEl.textContent = "Done — your clean export is ready.";
    actionsEl.innerHTML = "";
    const a = document.createElement("a");
    a.href = url;
    a.download = "boomerang-clean.mp4";
    a.className = "btn-primary";
    a.textContent = "Download clean export";
    actionsEl.appendChild(a);
    a.click();
  }

  run();
})();
