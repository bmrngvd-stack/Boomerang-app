(() => {
  "use strict";
  const select = document.getElementById("lang-select");
  if (!select) return;
  select.addEventListener("change", () => {
    if (select.value !== "en") {
      select.value = "en";
    }
  });
})();
