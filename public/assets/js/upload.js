(() => {
  "use strict";

  const MAX_BYTES = 200 * 1024 * 1024;
  const ACCEPTED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
  const ACCEPTED_EXT = /\.(mp4|mov|webm)$/i;

  const drop = document.getElementById("upload-drop");
  const input = document.getElementById("upload-input");
  const headline = document.getElementById("upload-headline");
  const sublabel = document.getElementById("upload-sublabel");
  const errorBox = document.getElementById("upload-error");

  if (!drop || !input) return;

  // Stop the browser from navigating away to the raw file if a drop is missed.
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  function openPicker() {
    input.click();
  }

  drop.addEventListener("click", openPicker);
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openPicker();
    }
  });

  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("is-dragover");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-dragover"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("is-dragover");
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) handleFile(file);
    input.value = "";
  });

  function formatMB(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.add("is-visible");
  }

  function clearError() {
    errorBox.classList.remove("is-visible");
    errorBox.textContent = "";
  }

  function handleFile(file) {
    const isAcceptedType = ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXT.test(file.name);
    if (!isAcceptedType) {
      showError("That file is a " + (file.name.split(".").pop() || "unsupported format") + " — upload an MP4, MOV or WebM instead.");
      return;
    }
    if (file.size > MAX_BYTES) {
      showError("That file is " + formatMB(file.size) + " — trim it under 200 MB and try again.");
      return;
    }
    clearError();
    goToEditor(file);
  }

  function goToEditor(file) {
    headline.textContent = file.name + " · " + formatMB(file.size);
    sublabel.textContent = "Opening the editor…";
    if (!window.BoomerangStorage) {
      showError("Couldn't open the editor — try reloading the page.");
      return;
    }
    window.BoomerangStorage.saveFile(file)
      .then(() => { window.location.href = "studio.html"; })
      .catch(() => {
        headline.textContent = "Upload a video";
        sublabel.textContent = "Click to browse or drag and drop";
        showError("Couldn't open the editor — try again.");
      });
  }
})();
