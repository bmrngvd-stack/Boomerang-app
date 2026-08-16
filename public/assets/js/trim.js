window.BoomerangStudio = (() => {
  "use strict";

  const MIN_WINDOW = 1;
  const MAX_WINDOW = 3;
  const FPS = 24;
  const MAX_PREVIEW_WIDTH = 640;

  const video = document.getElementById("source-video");
  const trimStart = document.getElementById("trim-start");
  const trimEnd = document.getElementById("trim-end");
  const trimFill = document.getElementById("trim-fill");
  const trimReadout = document.getElementById("trim-readout");
  const generateBtn = document.getElementById("generate-btn");
  const renderStatus = document.getElementById("render-status");
  const resultSection = document.getElementById("result");
  const canvas = document.getElementById("boomerang-canvas");
  const downloadBtn = document.getElementById("download-free-btn");
  const downloadStatus = document.getElementById("download-status");
  const resetBtn = document.getElementById("trim-reset");
  const speedSlider = document.getElementById("speed-slider");
  const speedValue = document.getElementById("speed-value");
  const speedButtons = document.querySelectorAll("#speed-buttons .option-btn");
  const repSlider = document.getElementById("rep-slider");
  const repValue = document.getElementById("rep-value");
  const repButtons = document.querySelectorAll("#rep-buttons .option-btn");

  if (!video || !canvas) return null;

  const SPEED_STEPS = [0.5, 1, 2, 3];
  const REP_STEPS = [1, 2, 3, 4];

  let duration = 0;
  let objectUrl = null;
  let frames = [];
  let playSeq = [];
  let animId = null;
  let speed = 1;
  let repetitions = 1;

  function setSpeed(v) {
    speed = v;
    const idx = SPEED_STEPS.indexOf(v);
    if (speedSlider && idx >= 0) speedSlider.value = String(idx);
    if (speedValue) speedValue.textContent = v + "x";
    speedButtons.forEach((b) => b.classList.toggle("is-active", parseFloat(b.dataset.speed) === v));
  }

  function setRepetitions(v) {
    repetitions = v;
    const idx = REP_STEPS.indexOf(v);
    if (repSlider && idx >= 0) repSlider.value = String(idx);
    if (repValue) repValue.textContent = String(v);
    repButtons.forEach((b) => b.classList.toggle("is-active", parseInt(b.dataset.rep, 10) === v));
  }

  if (speedSlider) {
    speedSlider.addEventListener("input", () => setSpeed(SPEED_STEPS[parseInt(speedSlider.value, 10)]));
  }
  speedButtons.forEach((b) => b.addEventListener("click", () => setSpeed(parseFloat(b.dataset.speed))));

  if (repSlider) {
    repSlider.addEventListener("input", () => setRepetitions(REP_STEPS[parseInt(repSlider.value, 10)]));
  }
  repButtons.forEach((b) => b.addEventListener("click", () => setRepetitions(parseInt(b.dataset.rep, 10))));

  function loadFile(file) {
    cancelAnimationFrame(animId);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;
    resultSection.classList.add("is-hidden");
    renderStatus.textContent = "Loading your video…";
    generateBtn.disabled = true;
    generateBtn.textContent = "Preview bounce back";

    video.onloadedmetadata = () => {
      if (isFinite(video.duration)) {
        finishLoad();
      } else {
        // Some encoders (e.g. MediaRecorder output) omit the container duration.
        // Seeking near the end forces the browser to compute the real value.
        video.ondurationchange = () => {
          if (isFinite(video.duration)) {
            video.ondurationchange = null;
            video.currentTime = 0;
            finishLoad();
          }
        };
        video.currentTime = 1e101;
        setTimeout(() => {
          if (video.ondurationchange) {
            video.ondurationchange = null;
            finishLoad();
          }
        }, 1500);
      }
    };
    video.onerror = () => {
      renderStatus.textContent = "Couldn't open this file — try a different video.";
    };
  }

  function finishLoad() {
    duration = isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) {
      renderStatus.textContent = "Couldn't read this video's length — try a different file.";
      generateBtn.disabled = true;
    } else {
      renderStatus.textContent = "";
      generateBtn.disabled = false;
      initTrim();
    }
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function defaultWindow() {
    let win = Math.min(MAX_WINDOW, duration);
    if (win < MIN_WINDOW) win = duration;
    return win;
  }

  function initTrim() {
    trimStart.max = String(duration);
    trimEnd.max = String(duration);
    trimStart.value = "0";
    trimEnd.value = String(defaultWindow());
    updateReadout();
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      initTrim();
      syncPreviewFrame(0);
    });
  }

  trimStart.addEventListener("input", () => {
    let s = parseFloat(trimStart.value);
    let e = parseFloat(trimEnd.value);
    const win = e - s;
    if (win < MIN_WINDOW) e = clamp(s + MIN_WINDOW, 0, duration);
    else if (win > MAX_WINDOW) e = s + MAX_WINDOW;
    if (e > duration) {
      e = duration;
      s = clamp(e - clamp(win, MIN_WINDOW, MAX_WINDOW), 0, duration);
      trimStart.value = String(s);
    }
    trimEnd.value = String(e);
    syncPreviewFrame(s);
    updateReadout();
  });

  trimEnd.addEventListener("input", () => {
    let s = parseFloat(trimStart.value);
    let e = parseFloat(trimEnd.value);
    const win = e - s;
    if (win < MIN_WINDOW) s = clamp(e - MIN_WINDOW, 0, duration);
    else if (win > MAX_WINDOW) s = e - MAX_WINDOW;
    if (s < 0) {
      s = 0;
      e = clamp(s + clamp(win, MIN_WINDOW, MAX_WINDOW), 0, duration);
      trimEnd.value = String(e);
    }
    trimStart.value = String(s);
    syncPreviewFrame(e);
    updateReadout();
  });

  function syncPreviewFrame(t) {
    try { video.currentTime = t; } catch (err) { /* seeking not ready yet */ }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    return m + ":" + s.toFixed(1).padStart(4, "0");
  }

  function updateReadout() {
    const s = parseFloat(trimStart.value);
    const e = parseFloat(trimEnd.value);
    const pctS = duration ? (s / duration) * 100 : 0;
    const pctE = duration ? (e / duration) * 100 : 100;
    trimFill.style.left = pctS + "%";
    trimFill.style.width = Math.max(0, pctE - pctS) + "%";
    trimReadout.textContent = formatTime(s) + " – " + formatTime(e) + " · " + (e - s).toFixed(1) + "s";
  }

  function seekTo(t) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      const onSeeked = () => finish();
      video.addEventListener("seeked", onSeeked);
      video.currentTime = Math.min(t, Math.max(0, video.duration - 0.001));
      setTimeout(finish, 400);
    });
  }

  generateBtn.addEventListener("click", renderBoomerang);

  async function renderBoomerang() {
    const s = parseFloat(trimStart.value);
    const e = parseFloat(trimEnd.value);
    const win = e - s;
    if (win <= 0) return;

    cancelAnimationFrame(animId);
    generateBtn.disabled = true;
    video.pause();

    const total = Math.max(2, Math.round(win * FPS));
    const srcW = video.videoWidth || 640;
    const srcH = video.videoHeight || 360;
    const targetW = Math.min(MAX_PREVIEW_WIDTH, srcW);
    const targetH = Math.round(srcH * (targetW / srcW));

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = targetW;
    sampleCanvas.height = targetH;
    const sctx = sampleCanvas.getContext("2d");

    frames = [];
    for (let i = 0; i < total; i++) {
      const t = s + (i / (total - 1)) * win;
      await seekTo(t);
      sctx.drawImage(video, 0, 0, targetW, targetH);
      frames.push(await createImageBitmap(sampleCanvas));
      renderStatus.textContent = "Rendering preview… " + (i + 1) + " / " + total;
    }

    renderStatus.textContent = "";
    generateBtn.disabled = false;

    canvas.width = targetW;
    canvas.height = targetH;
    playSeq = frames.length > 1 ? frames.concat(frames.slice(1, -1).reverse()) : frames.slice();
    startPlayback();

    resultSection.classList.remove("is-hidden");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function drawWatermark(ctx) {
    const label = "BOOMERANG";
    ctx.save();
    ctx.font = '600 11px "Instrument Sans", sans-serif';
    const padX = 8;
    const boxW = ctx.measureText(label).width + padX * 2;
    const boxH = 20;
    const x = canvas.width - boxW - 10;
    const y = 10;
    ctx.fillStyle = "rgba(226,67,26,0.92)";
    roundRect(ctx, x, y, boxW, boxH, 999);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + padX, y + boxH / 2 + 1);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function startPlayback() {
    const ctx = canvas.getContext("2d");
    let frameIndex = 0;
    let lastFrameTime = 0;

    function step(ts) {
      if (!lastFrameTime) lastFrameTime = ts;
      const frameInterval = (1000 / FPS) / speed;
      if (ts - lastFrameTime >= frameInterval) {
        lastFrameTime = ts;
        ctx.drawImage(playSeq[frameIndex % playSeq.length], 0, 0, canvas.width, canvas.height);
        drawWatermark(ctx);
        frameIndex++;
      }
      animId = requestAnimationFrame(step);
    }
    animId = requestAnimationFrame(step);
  }

  downloadBtn.addEventListener("click", downloadFree);

  function downloadFree() {
    if (!playSeq.length) return;
    if (!canvas.captureStream || !window.MediaRecorder) {
      downloadStatus.textContent = "Recording isn't supported in this browser yet — try the latest Chrome, Edge or Firefox.";
      return;
    }

    // Pause the free-running preview and own the canvas for a frame-accurate
    // capture: draw and push exactly `repetitions` clean bounce-back cycles,
    // frame by frame, instead of recording a fixed duration off the live loop
    // (which could start or end mid-motion).
    cancelAnimationFrame(animId);

    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      .find((m) => window.MediaRecorder.isTypeSupported(m)) || "";
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType || "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bounce-back-free.webm";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      downloadStatus.textContent = "Downloaded.";
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download 480p file";
      startPlayback();
    };

    downloadBtn.disabled = true;
    downloadBtn.textContent = "Recording…";
    downloadStatus.textContent = "";
    recorder.start();

    const totalFrames = playSeq.length * repetitions;
    const frameIntervalMs = (1000 / FPS) / speed;
    let i = 0;

    function drawNext() {
      if (i >= totalFrames) {
        recorder.stop();
        return;
      }
      ctx.drawImage(playSeq[i % playSeq.length], 0, 0, canvas.width, canvas.height);
      drawWatermark(ctx);
      track.requestFrame();
      i++;
      setTimeout(drawNext, frameIntervalMs);
    }
    drawNext();
  }

  setSpeed(1);
  setRepetitions(1);

  return {
    load: loadFile,
    // Exposed so paywall.js / subscriber.js can read the current trim
    // window when starting a paid checkout or a subscriber render.
    getTrimState: () => ({
      start: parseFloat(trimStart.value),
      end: parseFloat(trimEnd.value),
      speed,
      loops: repetitions,
    }),
  };
})();
