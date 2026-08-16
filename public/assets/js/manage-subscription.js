(() => {
  "use strict";

  const link = document.getElementById("manage-sub-link");
  if (!link) return;

  link.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = window.prompt("Enter the email you subscribed with to manage or cancel your subscription:");
    if (!email) return;

    const original = link.textContent;
    link.textContent = "Opening…";
    try {
      const res = await fetch("/api/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error || "No subscription found for that email.");
    } catch (err) {
      alert("Couldn't reach the server — try again.");
    }
    link.textContent = original;
  });
})();
