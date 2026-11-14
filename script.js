"use strict";

/* =========================================================
   THE LISTENING GROVE
   - Three audio stems (wind, water, birds) are played together
     and kept in sync. The first one is the clock.
   - soundscape-data.js holds each layer's loudness over time and
     the moment every bird calls. The canvas scene reads those
     values at audio.currentTime, so the picture follows the sound,
     including when you scrub.
   - Pointer events add gusts, ripples and bird calls on top.
   ========================================================= */

(function () {
  const D = window.SOUNDSCAPE;
  if (!D) {
    console.error("soundscape-data.js did not load. Keep it next to index.html.");
    return;
  }

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const mix3 = (c1, c2, u) => [lerp(c1[0], c2[0], u), lerp(c1[1], c2[1], u), lerp(c1[2], c2[2], u)];
  const rgb = (c, a) => (a === undefined
    ? "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")"
    : "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")");
  const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(1234);
  const rr = (a, b) => a + (b - a) * rand();

  /* ---------- elements ---------- */
  const player = $("player");
  const stage = $("stage");
  const canvas = $("scene");
  const ctx = canvas.getContext("2d");
  const video = $("bg");
  const hint = $("hint");
  const intro = $("intro");

  const KEYS = ["wind", "water", "birds"];
  const stems = { wind: $("a-wind"), water: $("a-water"), birds: $("a-birds") };
  const master = stems.wind;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = reduceMotion ? 0.4 : 1;

  const state = {
    playing: false,
    ended: false,
    vol: 0.8,
    muted: false,
    hasVideo: false,
    layers: { wind: { on: true, vol: 1 }, water: { on: true, vol: 1 }, birds: { on: true, vol: 1 } }
  };

  const now = () => master.currentTime || 0;
  const layerGain = (k) => (state.layers[k].on ? state.layers[k].vol : 0);

  function env(arr, t) {
    const f = clamp(t, 0, D.duration) * D.fps;
    const i = Math.floor(f);
    const a = arr[Math.min(i, arr.length - 1)];
    const b = arr[Math.min(i + 1, arr.length - 1)];
    return a + (b - a) * (f - i);
  }

  /* =======================================================
     PLAYBACK
     ======================================================= */
  function applyVolumes() {
    KEYS.forEach((k) => {
      stems[k].volume = state.muted ? 0 : clamp(state.vol * layerGain(k));
    });
  }

  function seek(sec) {
    const s = clamp(sec, 0, D.duration - 0.05);
    KEYS.forEach((k) => { stems[k].currentTime = s; });
    state.ended = false;
    if (!state.playing) updateTime();
  }

  function play() {
    applyVolumes();
    if (state.ended || now() >= D.duration - 0.1) seek(0);
    const starts = KEYS.map((k) => stems[k].play());
    Promise.all(starts).then(function () {
      state.playing = true;
      state.ended = false;
      if (state.hasVideo) video.play().catch(function () {});
      intro.classList.add("hide");
      setPlayingUI();
    }).catch(function (err) {
      console.warn("Playback was blocked or a file is missing:", err);
      KEYS.forEach((k) => stems[k].pause());
      state.playing = false;
      setPlayingUI();
    });
  }

  function pause() {
    KEYS.forEach((k) => stems[k].pause());
    video.pause();
    state.playing = false;
    setPlayingUI();
  }

  function togglePlay() { if (state.playing) pause(); else play(); }

  master.addEventListener("ended", function () {
    KEYS.forEach((k) => stems[k].pause());
    video.pause();
    state.playing = false;
    state.ended = true;
    setPlayingUI();
    $("intro-eyebrow").textContent = "The grove goes quiet";
    $("intro-title").textContent = "Listen again?";
    $("intro-text").textContent = "Try switching off a layer next time and watch what changes.";
    $("start-btn").textContent = "Replay";
    intro.classList.remove("hide");
  });

  // The stems are separate files, so nudge any that drift from the clock.
  setInterval(function () {
    if (!state.playing) return;
    const t = master.currentTime;
    KEYS.forEach(function (k) {
      if (stems[k] !== master && Math.abs(stems[k].currentTime - t) > 0.12) {
        stems[k].currentTime = t;
      }
    });
  }, 250);

  KEYS.forEach(function (k) {
    stems[k].addEventListener("error", function () {
      hint.textContent = "Audio file missing: keep the audio folder next to index.html.";
      hint.classList.remove("fade");
    });
  });

  /* =======================================================
     CONTROLS
     ======================================================= */
  const playBtn = $("play-btn");
  const muteBtn = $("mute-btn");
  const volInput = $("vol");

  function setPlayingUI() {
    playBtn.classList.toggle("is-playing", state.playing);
    playBtn.setAttribute("aria-label", state.playing ? "Pause" : "Play");
  }

  playBtn.addEventListener("click", togglePlay);
  $("start-btn").addEventListener("click", play);

  volInput.addEventListener("input", function () {
    state.vol = parseFloat(volInput.value);
    if (state.vol > 0 && state.muted) setMuted(false);
    applyVolumes();
  });

  function setMuted(m) {
    state.muted = m;
    muteBtn.classList.toggle("is-muted", m);
    muteBtn.setAttribute("aria-pressed", String(m));
    muteBtn.setAttribute("aria-label", m ? "Unmute" : "Mute");
    applyVolumes();
  }
  muteBtn.addEventListener("click", function () { setMuted(!state.muted); });

  document.querySelectorAll(".layer").forEach(function (el) {
    const k = el.dataset.layer;
    const toggle = el.querySelector('input[type="checkbox"]');
    const slider = el.querySelector('input[type="range"]');
    toggle.addEventListener("change", function () {
      state.layers[k].on = toggle.checked;
      el.classList.toggle("off", !toggle.checked);
      applyVolumes();
      mapDirty = true;
    });
    slider.addEventListener("input", function () {
      state.layers[k].vol = parseFloat(slider.value);
      applyVolumes();
      mapDirty = true;
    });
  });

  const fsBtn = $("fs-btn");
  if (!document.fullscreenEnabled) fsBtn.hidden = true;
  fsBtn.addEventListener("click", toggleFullscreen);
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (player.requestFullscreen) player.requestFullscreen();
  }

  document.addEventListener("keydown", function (e) {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === " " && tag !== "BUTTON") { e.preventDefault(); togglePlay(); }
    else if (e.key === "m" || e.key === "M") setMuted(!state.muted);
    else if (e.key === "f" || e.key === "F") toggleFullscreen();
    else if (e.key === "ArrowRight") seek(now() + 5);
    else if (e.key === "ArrowLeft") seek(now() - 5);
  });

  /* ---------- video (optional) ---------- */
  function setVideo(on) {
    state.hasVideo = on;
    stage.classList.toggle("has-video", on);
    if (on && state.playing) video.play().catch(function () {});
    if (!on) { video.style.filter = ""; video.style.transform = ""; }
  }
  video.addEventListener("loadeddata", function () { setVideo(true); });
  video.addEventListener("error", function () { setVideo(false); });
  $("bg-src").addEventListener("error", function () { setVideo(false); });

  let videoURL = null;
  $("video-file").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;
    if (videoURL) URL.revokeObjectURL(videoURL);
    videoURL = URL.createObjectURL(file);
    video.src = videoURL;
    video.load();
  });
  $("video-reset").addEventListener("click", function () {
    if (videoURL) { URL.revokeObjectURL(videoURL); videoURL = null; }
    $("video-file").value = "";
    video.removeAttribute("src");
    video.load(); // falls back to media/forest.mp4 if it exists
    setVideo(false);
  });

  /* =======================================================
     SOUND MAP (seek bar that shows the sound)
     ======================================================= */
  const mapC = $("map");
  const mctx = mapC.getContext("2d");
  const mapStatic = document.createElement("canvas");
  const sctx = mapStatic.getContext("2d");
  let mapW = 0, mapH = 0, mapDirty = true;

  function sizeMap() {
    const dpr = window.devicePixelRatio || 1;
    const r = mapC.getBoundingClientRect();
    mapW = Math.max(40, r.width); mapH = r.height || 56;
    mapC.width = mapStatic.width = Math.round(mapW * dpr);
    mapC.height = mapStatic.height = Math.round(mapH * dpr);
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mapDirty = true;
  }

  function buildMapStatic() {
    const w = mapW, h = mapH, mid = h / 2;
    sctx.clearRect(0, 0, w, h);
    sctx.fillStyle = "rgba(227,243,234,0.07)";
    sctx.beginPath();
    sctx.roundRect ? sctx.roundRect(0, 0, w, h, 10) : sctx.rect(0, 0, w, h);
    sctx.fill();

    // wind: soft mirrored area
    sctx.fillStyle = "rgba(120,200,170," + (0.2 + 0.45 * layerGain("wind")) + ")";
    sctx.beginPath(); sctx.moveTo(0, mid);
    for (let x = 0; x <= w; x += 2) sctx.lineTo(x, mid - (0.1 + 0.9 * env(D.wind, (x / w) * D.duration)) * h * 0.42);
    for (let x = w; x >= 0; x -= 2) sctx.lineTo(x, mid + (0.1 + 0.9 * env(D.wind, (x / w) * D.duration)) * h * 0.42);
    sctx.closePath(); sctx.fill();

    // water: thin line
    sctx.strokeStyle = "rgba(120,190,230," + (0.25 + 0.7 * layerGain("water")) + ")";
    sctx.lineWidth = 1.4;
    sctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const v = (0.08 + 0.55 * env(D.water, (x / w) * D.duration)) * h * 0.3;
      if (x === 0) sctx.moveTo(x, mid - v); else sctx.lineTo(x, mid - v);
    }
    sctx.stroke();
    sctx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const v = (0.08 + 0.55 * env(D.water, (x / w) * D.duration)) * h * 0.3;
      if (x === 0) sctx.moveTo(x, mid + v); else sctx.lineTo(x, mid + v);
    }
    sctx.stroke();

    // bird calls: amber bars
    sctx.fillStyle = "rgba(247,196,90," + (0.25 + 0.75 * layerGain("birds")) + ")";
    D.events.forEach(function (ev) {
      const x = (ev.t / D.duration) * w;
      const bw = Math.max(3, (ev.dur / D.duration) * w);
      const bh = h * (0.34 + 0.2 * (1 - ev.dist));
      sctx.beginPath();
      sctx.roundRect ? sctx.roundRect(x, mid - bh / 2, bw, bh, 2) : sctx.rect(x, mid - bh / 2, bw, bh);
      sctx.fill();
    });
    mapDirty = false;
  }

  function drawMap() {
    if (mapDirty) buildMapStatic();
    const w = mapW, h = mapH;
    mctx.clearRect(0, 0, w, h);
    mctx.drawImage(mapStatic, 0, 0, w, h);
    const px = clamp(now() / D.duration) * w;
    mctx.fillStyle = "rgba(6,32,30,0.5)";
    mctx.fillRect(px, 0, w - px, h);
    mctx.fillStyle = "#f4c95d";
    mctx.fillRect(px - 1, 0, 2, h);
    mctx.beginPath(); mctx.arc(px, 4, 4, 0, Math.PI * 2); mctx.fill();
  }

  let dragging = false;
  function seekFromPointer(e) {
    const r = mapC.getBoundingClientRect();
    seek(clamp((e.clientX - r.left) / r.width) * D.duration);
  }
  mapC.addEventListener("pointerdown", function (e) {
    dragging = true;
    mapC.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  });
  mapC.addEventListener("pointermove", function (e) { if (dragging) seekFromPointer(e); });
  mapC.addEventListener("pointerup", function () { dragging = false; });
  mapC.addEventListener("pointercancel", function () { dragging = false; });
  mapC.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { seek(now() + 5); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "ArrowLeft") { seek(now() - 5); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "Home") { seek(0); e.preventDefault(); }
    else if (e.key === "End") { seek(D.duration - 1); e.preventDefault(); }
  });

  const tNow = $("t-now");
  $("t-total").textContent = fmt(D.duration);
  mapC.setAttribute("aria-valuemax", String(Math.round(D.duration)));
  let lastLabel = -1;
  function updateTime() {
    const s = Math.floor(now());
    if (s !== lastLabel) {
      lastLabel = s;
      tNow.textContent = fmt(s);
      mapC.setAttribute("aria-valuenow", String(s));
      mapC.setAttribute("aria-valuetext", fmt(s) + " of " + fmt(D.duration));
    }
  }

  /* =======================================================
     SCENE GEOMETRY (built once, in normalised units)
     ======================================================= */
  const LAYERS = [
    { name: "far", baseY: 0.66, h: [0.22, 0.32], trunkW: 0.005, sway: 0.35, alpha: 1,
      col: [44, 98, 88], colDusk: [52, 58, 88], hi: [86, 150, 122], hiDusk: [132, 98, 122], par: 6 },
    { name: "mid", baseY: 0.79, h: [0.36, 0.48], trunkW: 0.009, sway: 0.7, alpha: 1,
      col: [26, 74, 60], colDusk: [34, 44, 62], hi: [74, 142, 92], hiDusk: [172, 112, 102], par: 14 },
    { name: "near", baseY: 1.04, h: [0.72, 0.88], trunkW: 0.022, sway: 1.0, alpha: 1,
      col: [10, 42, 34], colDusk: [14, 24, 36], hi: [38, 96, 62], hiDusk: [98, 70, 72], par: 28 }
  ];
  const CANOPY = [
    { n: 9, sx: 0.20, sy: 0.14, r: [0.08, 0.13] },
    { n: 12, sx: 0.24, sy: 0.16, r: [0.09, 0.15] },
    { n: 16, sx: 0.34, sy: 0.20, r: [0.12, 0.20] }
  ];

  function makeTree(li, x) {
    const L = LAYERS[li], C = CANOPY[li];
    const h = rr(L.h[0], L.h[1]);
    const cc = [];
    for (let i = 0; i < C.n; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand());
      cc.push({ dx: Math.cos(a) * d * C.sx, dy: Math.sin(a) * d * C.sy, r: rr(C.r[0], C.r[1]), ph: rr(0, 6.28) });
    }
    return { layer: li, x: x, baseY: L.baseY + rr(-0.01, 0.01), h: h, w: L.trunkW * rr(0.8, 1.3), cc: cc, off: 0, ph: rr(0, 6.28), perches: 0 };
  }

  const trees = [[], [], []];
  for (let i = 0; i < 18; i++) trees[0].push(makeTree(0, -0.03 + (i * 1.06) / 17 + rr(-0.02, 0.02)));
  for (let i = 0; i < 9; i++) trees[1].push(makeTree(1, -0.02 + (i * 1.04) / 8 + rr(-0.03, 0.03)));
  [-0.01, 0.08, 0.19, 0.82, 0.92, 1.01].forEach(function (x) { trees[2].push(makeTree(2, x)); });

  // Give every bird call a place to perch: a canopy-top circle on a far or mid tree.
  D.events.forEach(function (ev) {
    const li = ev.dist > 0.6 ? 0 : 1;
    let best = null, bd = 9;
    trees[li].forEach(function (tr) {
      const d = Math.abs(tr.x - ev.x) + tr.perches * 0.12;
      if (d < bd) { bd = d; best = tr; }
    });
    best.perches++;
    const top = best.cc.map(function (c, i) { return { i: i, y: c.dy - c.r }; })
      .sort(function (a, b) { return a.y - b.y; }).slice(0, 3);
    ev.perch = { tree: best, circle: top[(best.perches - 1) % top.length].i };
  });

  const grass = [];
  for (let i = 0; i < 140; i++) grass.push({ x: rand(), h: rr(8, 26), ph: rr(0, 6.28), l: rr(0.6, 1) });
  const stones = [{ x: 0.24, y: 0.9, r: 0.03 }, { x: 0.52, y: 0.95, r: 0.04 }, { x: 0.78, y: 0.88, r: 0.025 }];
  const flies = [];
  for (let i = 0; i < 26; i++) flies.push({ x: rr(0.05, 0.95), y: rr(0.46, 0.8), ph: rr(0, 6.28), sp: rr(0.3, 0.8) });

  const BIRD_COLOURS = {
    tweet:   { back: "#d8782f", belly: "#f4c07a" },
    whistle: { back: "#4a86b8", belly: "#e8eef2" },
    warble:  { back: "#c9a227", belly: "#f6e7a4" },
    trill:   { back: "#b9473b", belly: "#f1c8bd" },
    coo:     { back: "#8c8178", belly: "#cfc6bc" }
  };

  /* =======================================================
     LIVE STATE FOR THE SCENE
     ======================================================= */
  let W = 0, H = 0, dpr = 1;
  const lvl = { wind: 0.1, water: 0.2, birds: 0, gust: 0 };
  let clock = 0, wclock = 0;
  let parX = 0, parTarget = 0;
  const ptr = { x: 0, y: 0, has: false };
  const leaves = [], sparkles = [], ripples = [], rings = [];
  const bounce = {};
  let hitList = [];
  let leafAcc = 0;
  const meters = {
    wind: document.querySelector('[data-layer="wind"] .meter i'),
    water: document.querySelector('[data-layer="water"] .meter i'),
    birds: document.querySelector('[data-layer="birds"] .meter i')
  };
  let dtFrame = 0.016;

  function sizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    W = stage.clientWidth; H = stage.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function updateLevels(dt) {
    const t = now();
    const live = state.playing;
    const tw = live ? env(D.wind, t) * layerGain("wind") : 0.12 * layerGain("wind");
    const tv = live ? env(D.water, t) * layerGain("water") : 0.25 * layerGain("water");
    const tb = live ? env(D.birds, t) * layerGain("birds") : 0;
    const k = Math.min(1, dt * 6);
    lvl.wind += (tw - lvl.wind) * k;
    lvl.water += (tv - lvl.water) * k;
    lvl.birds += (tb - lvl.birds) * Math.min(1, dt * 14);
    lvl.gust = Math.max(0, lvl.gust - dt * 1.2);
    parX += (parTarget - parX) * Math.min(1, dt * 3);
    meters.wind.style.setProperty("--v", clamp(lvl.wind).toFixed(3));
    meters.water.style.setProperty("--v", clamp(lvl.water).toFixed(3));
    meters.birds.style.setProperty("--v", clamp(lvl.birds).toFixed(3));
  }

  /* =======================================================
     DRAWING
     ======================================================= */
  function drawSky(p, hor) {
    const top = mix3([34, 86, 92], [30, 28, 62], p);
    const mid = mix3([120, 170, 140], [142, 86, 112], p);
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.8);
    g.addColorStop(0, rgb(top)); g.addColorStop(0.55, rgb(mid)); g.addColorStop(1, rgb(hor));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const sx = W * 0.68, sy = H * lerp(0.40, 0.60, p);
    const sr = H * 0.36 * (0.95 + 0.05 * Math.sin(clock * 0.6));
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, rgb(hor, 0.95)); sg.addColorStop(0.25, rgb(hor, 0.45)); sg.addColorStop(1, rgb(hor, 0));
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,244,214,0.95)";
    ctx.beginPath(); ctx.arc(sx, sy, H * 0.042, 0, Math.PI * 2); ctx.fill();
    return { sx: sx, sy: sy };
  }

  function drawHills(base, amp, col, seed) {
    ctx.fillStyle = rgb(col);
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 16; x += 16) {
      const u = x / W;
      const y = H * base - (Math.sin(u * 5 + seed) * 0.5 + Math.sin(u * 11 + seed * 2) * 0.25 + Math.sin(u * 2.3 + seed * 3) * 0.6) * H * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }

  function drawMist(p, alpha) {
    const c = mix3([235, 248, 240], [250, 205, 185], p);
    for (let i = 0; i < 6; i++) {
      const cx = (((i * 0.23 + clock * 0.01 * (1 + lvl.wind * 3)) % 1.3) - 0.15) * W;
      const cy = H * (0.54 + 0.04 * (i % 3));
      const r = W * 0.22;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, rgb(c, alpha)); g.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }

  function drawTree(tr, p, alpha) {
    const L = LAYERS[tr.layer];
    const windE = clamp(lvl.wind + lvl.gust * 0.8);
    const col = mix3(L.col, L.colDusk, p), hi = mix3(L.hi, L.hiDusk, p);
    const x = tr.x * W, by = tr.baseY * H, h = tr.h * H, w = tr.w * W;
    const s = Math.sin(clock * 0.9 + tr.ph) * 0.6 + Math.sin(clock * 1.9 + tr.ph * 2) * 0.4;
    const amp = L.sway * (0.25 + 1.6 * windE) * motion;
    const off = s * amp * h * 0.035;
    tr.off = off;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = rgb([col[0] * 0.75, col[1] * 0.75, col[2] * 0.75]);
    ctx.beginPath();
    ctx.moveTo(x - w, by);
    ctx.quadraticCurveTo(x - w * 0.6 + off * 0.4, by - h * 0.5, x - w * 0.4 + off, by - h * 0.76);
    ctx.lineTo(x + w * 0.4 + off, by - h * 0.76);
    ctx.quadraticCurveTo(x + w * 0.6 + off * 0.4, by - h * 0.5, x + w, by);
    ctx.fill();

    const cx = x + off, cy = by - h * 0.78;
    const flutter = (0.004 + 0.012 * windE) * h * motion;
    ctx.fillStyle = rgb(col);
    for (let i = 0; i < tr.cc.length; i++) {
      const c = tr.cc[i];
      const ox = Math.sin(clock * 2.2 + c.ph) * flutter, oy = Math.cos(clock * 1.7 + c.ph) * flutter * 0.6;
      ctx.beginPath(); ctx.arc(cx + c.dx * h + ox, cy + c.dy * h + oy, c.r * h, 0, 6.2832); ctx.fill();
    }
    ctx.fillStyle = rgb(hi, 0.55);
    for (let i = 0; i < tr.cc.length; i++) {
      const c = tr.cc[i];
      const ox = Math.sin(clock * 2.2 + c.ph) * flutter, oy = Math.cos(clock * 1.7 + c.ph) * flutter * 0.6;
      ctx.beginPath(); ctx.arc(cx + c.dx * h + ox + c.r * h * 0.22, cy + c.dy * h + oy - c.r * h * 0.26, c.r * h * 0.66, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function bankWave(x) { return Math.sin(x * 0.006) * H * 0.008 + Math.sin(x * 0.017 + 1) * H * 0.004; }

  function drawWater(p, hor, sun) {
    const wt = H * 0.8;
    const top = mix3([54, 120, 128], [56, 70, 100], p), bot = mix3([10, 44, 52], [12, 24, 44], p);
    const g = ctx.createLinearGradient(0, wt, 0, H);
    g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, wt + bankWave(x));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    // sun reflection
    const rg = ctx.createRadialGradient(sun.sx, wt + (H - wt) * 0.35, 0, sun.sx, wt + (H - wt) * 0.35, W * 0.22);
    rg.addColorStop(0, rgb(hor, 0.5)); rg.addColorStop(1, rgb(hor, 0));
    ctx.save(); ctx.translate(0, 0); ctx.scale(1, 1);
    ctx.fillStyle = rg; ctx.fillRect(0, wt, W, H - wt);
    ctx.restore();

    // ripple lines: stronger and faster when the stream is louder
    const e = lvl.water;
    for (let r = 0; r < 10; r++) {
      const yy = wt + (H - wt) * Math.pow((r + 0.5) / 10, 1.4);
      const amp = (1.5 + r * 0.45) * (0.5 + e) * motion;
      ctx.strokeStyle = "rgba(235,250,245," + (0.05 + 0.24 * e * (0.4 + r / 10)).toFixed(3) + ")";
      ctx.lineWidth = 1 + r * 0.16;
      ctx.beginPath();
      for (let x = 0; x <= W + 14; x += 14) {
        const y = yy + Math.sin(x * 0.02 * (1 + r * 0.1) + wclock * (1.2 + r * 0.2) + r * 1.7) * amp;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // stones with rings that widen with the water
    stones.forEach(function (s, i) {
      const sx = s.x * W, sy = s.y * H, sr = s.r * W;
      for (let k = 0; k < 2; k++) {
        const ph = ((wclock * 0.25 + k * 0.5 + i * 0.3) % 1);
        ctx.strokeStyle = "rgba(235,250,245," + ((1 - ph) * (0.1 + 0.4 * e)).toFixed(3) + ")";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(sx, sy + sr * 0.2, sr * (1.1 + ph * 1.6), sr * (0.3 + ph * 0.45), 0, 0, 6.2832); ctx.stroke();
      }
      ctx.fillStyle = rgb(mix3([54, 62, 60], [30, 34, 48], p));
      ctx.beginPath(); ctx.ellipse(sx, sy, sr, sr * 0.55, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath(); ctx.ellipse(sx - sr * 0.2, sy - sr * 0.15, sr * 0.55, sr * 0.2, 0, 0, 6.2832); ctx.fill();
    });

    // sparkles
    if (state.playing || e > 0.2) {
      const chance = (0.05 + 0.9 * e) * motion;
      if (rand() < chance) sparkles.push({ x: rr(0, W), y: rr(wt + 6, H - 4), life: 0, max: rr(0.3, 0.7) });
    }
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const sp = sparkles[i];
      sp.life += dtFrame;
      if (sp.life > sp.max) { sparkles.splice(i, 1); continue; }
      const a = Math.sin((sp.life / sp.max) * Math.PI);
      ctx.strokeStyle = "rgba(255,250,235," + (a * 0.9).toFixed(2) + ")";
      ctx.lineWidth = 1.4;
      const sz = 2 + a * 4;
      ctx.beginPath(); ctx.moveTo(sp.x - sz, sp.y); ctx.lineTo(sp.x + sz, sp.y); ctx.moveTo(sp.x, sp.y - sz * 0.6); ctx.lineTo(sp.x, sp.y + sz * 0.6); ctx.stroke();
    }

    // click ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.age += dtFrame;
      if (r.age > 1.8) { ripples.splice(i, 1); continue; }
      const rx = r.age * 90;
      ctx.strokeStyle = "rgba(240,252,248," + ((1 - r.age / 1.8) * 0.65).toFixed(3) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rx, rx * 0.28, 0, 0, 6.2832); ctx.stroke();
      if (r.age > 0.18) {
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rx * 0.6, rx * 0.17, 0, 0, 6.2832); ctx.stroke();
      }
    }
  }

  function drawBank(p) {
    const wt = H * 0.8;
    const col = mix3([14, 52, 40], [16, 28, 36], p);
    ctx.fillStyle = rgb(col);
    ctx.beginPath(); ctx.moveTo(0, wt - H * 0.04);
    for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, wt - H * 0.015 + bankWave(x) * 0.6);
    for (let x = W + 12; x >= 0; x -= 12) ctx.lineTo(x, wt + bankWave(x));
    ctx.closePath(); ctx.fill();
    const windE = clamp(lvl.wind + lvl.gust * 0.8);
    ctx.strokeStyle = rgb(mix3([22, 72, 50], [26, 38, 46], p));
    ctx.lineWidth = 2;
    ctx.beginPath();
    grass.forEach(function (b) {
      const x = b.x * W, y = wt - H * 0.012 + bankWave(x) * 0.6;
      const lean = Math.sin(clock * 2 + b.ph) * (2 + 10 * windE) * motion;
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x + lean * 0.4, y - b.h * 0.6 * (H / 540), x + lean, y - b.h * (H / 540));
    });
    ctx.stroke();
  }

  function spawnLeaf(x, y, burst) {
    if (leaves.length > 120) return;
    leaves.push({
      x: x, y: y, vx: rr(20, 60) + (burst ? rr(-80, 160) : 0), vy: rr(10, 40) + (burst ? rr(-60, 20) : 0),
      rot: rr(0, 6.28), vr: rr(-3, 3), s: rr(3, 6.5), life: 0, max: rr(4, 8), ph: rr(0, 6.28), gold: rand() < 0.3
    });
  }

  function drawLeaves(dt, p) {
    const windE = clamp(lvl.wind + lvl.gust * 0.8);
    leafAcc += (0.4 + 10 * windE) * dt * motion;
    while (leafAcc >= 1) { leafAcc -= 1; spawnLeaf(rr(-0.05 * W, 0.9 * W), rr(0.05 * H, 0.5 * H), false); }
    const green = mix3([94, 163, 107], [190, 130, 90], p), gold = mix3([244, 201, 93], [250, 170, 90], p);
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i];
      l.life += dt;
      l.x += (l.vx + windE * 180) * dt;
      l.y += (l.vy + Math.sin(l.life * 3 + l.ph) * 24) * dt;
      l.rot += l.vr * dt * (1 + windE * 2);
      l.vy += 6 * dt;
      if (l.y > H * 0.92 || l.x > W + 30 || l.life > l.max) { leaves.splice(i, 1); continue; }
      const a = clamp(Math.min(l.life * 2, (l.max - l.life) * 1.5));
      ctx.save();
      ctx.translate(l.x, l.y); ctx.rotate(l.rot);
      ctx.fillStyle = rgb(l.gold ? gold : green, a);
      ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * 0.5, 0, 0, 6.2832); ctx.fill();
      ctx.restore();
    }
  }

  function drawFireflies(p) {
    const a = clamp((p - 0.3) * 2.5);
    if (a <= 0) return;
    const windE = clamp(lvl.wind + lvl.gust * 0.8);
    flies.forEach(function (f) {
      const x = (f.x + Math.sin(clock * f.sp + f.ph) * 0.03 + windE * 0.01) * W;
      const y = (f.y + Math.cos(clock * f.sp * 1.3 + f.ph) * 0.02) * H;
      const tw = (0.5 + 0.5 * Math.sin(clock * 2.2 + f.ph * 3)) * a;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 11);
      g.addColorStop(0, "rgba(255,240,170," + (0.9 * tw).toFixed(2) + ")");
      g.addColorStop(1, "rgba(255,240,170,0)");
      ctx.fillStyle = g; ctx.fillRect(x - 11, y - 11, 22, 22);
    });
  }

  function perchPos(ev) {
    const tr = ev.perch.tree, c = tr.cc[ev.perch.circle];
    const h = tr.h * H;
    return {
      x: tr.x * W + tr.off * 0.9 + c.dx * h,
      y: tr.baseY * H - h * 0.78 + c.dy * h - c.r * h * 0.82,
      par: LAYERS[tr.layer].par
    };
  }

  function drawBird(ev, idx, t) {
    const tin = 1.4, tout = 1.4;
    if (t < ev.t - tin || t > ev.t + ev.dur + tout) return;
    const pc = perchPos(ev);
    const s = (H / 540) * (1 - 0.45 * ev.dist) * 1.05;
    const fromLeft = ev.x < 0.5;
    let x, y, dir, flying = false, singing = false;

    if (t < ev.t) {
      const u = (t - (ev.t - tin)) / tin, e = 1 - Math.pow(1 - u, 3);
      const sx = fromLeft ? -0.06 * W : 1.06 * W, sy = pc.y - 0.30 * H;
      x = lerp(sx, pc.x, e); y = lerp(sy, pc.y, e) - Math.sin(u * Math.PI) * 0.05 * H;
      dir = pc.x > sx ? 1 : -1; flying = u < 0.93;
    } else if (t <= ev.t + ev.dur) {
      x = pc.x; y = pc.y; dir = fromLeft ? 1 : -1; singing = true;
    } else {
      const u = (t - ev.t - ev.dur) / tout, e = u * u;
      const ex = fromLeft ? 1.08 * W : -0.08 * W;
      x = lerp(pc.x, ex, e); y = lerp(pc.y, pc.y - 0.34 * H, e);
      dir = ex > pc.x ? 1 : -1; flying = true;
    }

    const pulse = singing ? clamp(lvl.birds * 1.4) : 0;
    const open = singing ? (Math.sin(clock * 24) * 0.5 + 0.5) * pulse : 0;
    const col = BIRD_COLOURS[ev.kind];
    let jump = 0;
    if (bounce[idx] !== undefined) {
      const u = (clock - bounce[idx]) / 0.5;
      if (u < 1) jump = -Math.sin(u * Math.PI) * 9; else delete bounce[idx];
    }

    // rings that leave the beak while it sings
    if (singing && state.playing && pulse > 0.2) {
      ev._ring = (ev._ring || 0) - dtFrame;
      if (ev._ring <= 0) { ev._ring = 0.2; rings.push({ x: x - parX * pc.par + dir * 22 * s, y: y - 6 * s, age: 0, s: s }); }
    }

    ctx.save();
    ctx.translate(x - parX * pc.par, y + jump * s);
    ctx.scale(dir * s, s);
    const flap = Math.sin(clock * 18);

    ctx.fillStyle = col.back; // tail
    ctx.beginPath(); ctx.moveTo(-10, -1); ctx.lineTo(-25, -5 - (flying ? flap * 2 : 0)); ctx.lineTo(-24, 3); ctx.closePath(); ctx.fill();
    if (!flying) {
      ctx.strokeStyle = "#2a1d14"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(-2, 11); ctx.moveTo(3, 6); ctx.lineTo(3, 11); ctx.stroke();
    }
    ctx.fillStyle = col.back;
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 8, 0, 0, 6.2832); ctx.fill();
    ctx.fillStyle = col.belly;
    ctx.beginPath(); ctx.ellipse(2, 3, 10, 5, 0, 0, 6.2832); ctx.fill();
    const hy = -5 + (singing ? Math.sin(clock * 16) * pulse * 1.2 : 0);
    ctx.fillStyle = col.back;
    ctx.beginPath(); ctx.arc(11, hy, 6.5, 0, 6.2832); ctx.fill();
    ctx.fillStyle = "#f2b84b"; // beak
    ctx.beginPath(); ctx.moveTo(16, hy - 2); ctx.lineTo(23, hy - 2 - open * 3); ctx.lineTo(16, hy + 0.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(16, hy + 0.5); ctx.lineTo(22, hy + 1 + open * 4); ctx.lineTo(16, hy + 2.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#14110d"; // eye
    ctx.beginPath(); ctx.arc(12.5, hy - 1.5, 1.3, 0, 6.2832); ctx.fill();

    ctx.save(); // wing
    ctx.translate(-2, -3);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    if (flying) {
      ctx.rotate(-0.5 + flap * 0.9);
      ctx.beginPath(); ctx.ellipse(0, -10, 5, 12, 0, 0, 6.2832); ctx.fill();
    } else {
      ctx.rotate(-0.12);
      ctx.beginPath(); ctx.ellipse(-2, 1, 10, 4.5, 0, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
    ctx.restore();

    hitList.push({ x: x - parX * pc.par, y: y, r: 26 * s + 6, idx: idx, ev: ev });
  }

  function drawRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.age += dt;
      if (r.age > 0.9) { rings.splice(i, 1); continue; }
      ctx.strokeStyle = "rgba(255,248,220," + ((1 - r.age / 0.9) * 0.55).toFixed(3) + ")";
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(r.x, r.y, 4 + r.age * 70 * r.s, -0.9, 0.9); ctx.stroke();
    }
  }

  function updateVideo() {
    if (!state.hasVideo) return;
    const windE = clamp(lvl.wind + lvl.gust * 0.8);
    video.playbackRate = clamp(0.85 + 0.4 * windE, 0.5, 2);
    video.style.filter = "brightness(" + (0.82 + 0.22 * lvl.water + 0.12 * lvl.birds).toFixed(3) +
      ") saturate(" + (0.95 + 0.45 * lvl.water).toFixed(3) + ")";
    video.style.transform = "scale(" + (1.02 + 0.02 * windE + 0.015 * lvl.birds).toFixed(4) + ")";
  }

  function draw(dt) {
    ctx.clearRect(0, 0, W, H);
    const t = now();
    const p = clamp(t / D.duration);
    const vm = state.hasVideo;
    const hor = mix3([247, 222, 150], [248, 146, 88], p);
    hitList = [];

    let sun = { sx: W * 0.68, sy: H * 0.5 };
    if (!vm) {
      sun = drawSky(p, hor);
      drawHills(0.60, 0.05, mix3([84, 134, 122], [84, 70, 100], p), 1.3);
      drawHills(0.66, 0.04, mix3([58, 106, 92], [62, 50, 80], p), 4.1);
      ctx.save(); ctx.translate(-parX * LAYERS[0].par, 0);
      trees[0].forEach(function (tr) { drawTree(tr, p, 1); });
      ctx.restore();
    }
    drawMist(p, vm ? 0.07 : 0.15);

    ctx.save(); ctx.translate(-parX * LAYERS[1].par, 0);
    trees[1].forEach(function (tr) { drawTree(tr, p, vm ? 0.62 : 1); });
    ctx.restore();

    if (!vm) { drawBank(p); drawWater(p, hor, sun); }

    drawFireflies(p);

    ctx.save(); ctx.translate(-parX * LAYERS[2].par, 0);
    trees[2].forEach(function (tr) { drawTree(tr, p, vm ? 0.92 : 1); });
    ctx.restore();

    // birds sit in the far/mid canopy, so each moves with its own tree layer
    D.events.forEach(function (ev, i) { drawBird(ev, i, t); });
    drawRings(dt);
    if (vm) {
      // click ripples still draw over footage
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]; r.age += dt;
        if (r.age > 1.8) { ripples.splice(i, 1); continue; }
        const rx = r.age * 90;
        ctx.strokeStyle = "rgba(240,252,248," + ((1 - r.age / 1.8) * 0.65).toFixed(3) + ")";
        ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(r.x, r.y, rx, rx * 0.28, 0, 0, 6.2832); ctx.stroke();
      }
    }

    drawLeaves(dt, p);

    // gentle vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, "rgba(4,18,16,0)"); vg.addColorStop(1, "rgba(4,18,16,0.38)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  /* =======================================================
     INTERACTION
     ======================================================= */
  const chirpFiles = ["audio/chirp1.mp3", "audio/chirp2.mp3", "audio/chirp3.mp3"];
  const KIND_CHIRP = { tweet: 0, warble: 0, whistle: 1, coo: 1, trill: 2 };

  function playChirp(kind) {
    const g = state.muted ? 0 : clamp(state.vol * 0.9 * Math.max(layerGain("birds"), 0.15));
    if (g <= 0) return;
    const a = new Audio(chirpFiles[KIND_CHIRP[kind] !== undefined ? KIND_CHIRP[kind] : 0]);
    a.volume = g;
    if (kind === "coo") { a.preservesPitch = false; a.playbackRate = 0.5; }
    a.play().catch(function () {});
  }

  let actx = null;
  function plink() {
    if (state.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime;
      const peak = Math.max(0.0002, 0.22 * state.vol * Math.max(layerGain("water"), 0.2));
      o.type = "sine";
      o.frequency.setValueAtTime(900 + rand() * 300, t0);
      o.frequency.exponentialRampToValueAtTime(280, t0 + 0.14);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + 0.3);
    } catch (e) { /* audio context unavailable */ }
  }

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  canvas.addEventListener("pointermove", function (e) {
    const p = canvasPoint(e);
    if (ptr.has) {
      const d = Math.hypot(p.x - ptr.x, p.y - ptr.y);
      lvl.gust = Math.min(1, lvl.gust + d * 0.004);
      if (d > 4 && rand() < 0.25) spawnLeaf(p.x, p.y, false);
    }
    ptr.x = p.x; ptr.y = p.y; ptr.has = true;
    parTarget = p.x / W - 0.5;
  });
  canvas.addEventListener("pointerleave", function () { ptr.has = false; parTarget = 0; });

  canvas.addEventListener("pointerdown", function (e) {
    const p = canvasPoint(e);
    // 1. a bird?
    for (let i = hitList.length - 1; i >= 0; i--) {
      const b = hitList[i];
      if (Math.hypot(p.x - b.x, p.y - b.y) < b.r) {
        bounce[b.idx] = clock;
        playChirp(b.ev.kind);
        rings.push({ x: b.x + (b.ev.x < 0.5 ? 22 : -22), y: b.y - 6, age: 0, s: 1 });
        return;
      }
    }
    // 2. the stream?
    if (p.y > H * 0.8) {
      ripples.push({ x: p.x, y: p.y, age: 0 });
      for (let i = 0; i < 8; i++) sparkles.push({ x: p.x + rr(-50, 50), y: p.y + rr(-14, 14), life: 0, max: rr(0.3, 0.8) });
      plink();
      return;
    }
    // 3. trees and sky: a gust, a burst of leaves, a startled call
    lvl.gust = 1;
    for (let i = 0; i < 14; i++) spawnLeaf(p.x + rr(-30, 30), p.y + rr(-30, 30), true);
    playChirp(["tweet", "whistle", "trill"][Math.floor(rand() * 3)]);
  });

  /* =======================================================
     MAIN LOOP
     ======================================================= */
  let last = performance.now();
  let hintTimer = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
    last = ts; dtFrame = dt;

    updateLevels(dt);
    const windE = clamp(lvl.wind + lvl.gust * 0.8);
    clock += dt * (0.8 + 1.6 * windE) * motion;
    wclock += dt * (1 + 2.5 * lvl.water) * motion;

    draw(dt);
    updateVideo();
    drawMap();
    updateTime();

    if (state.playing && hintTimer < 12) {
      hintTimer += dt;
      if (hintTimer >= 12) hint.classList.add("fade");
    }
  }

  /* ---------- start ---------- */
  new ResizeObserver(function () { sizeCanvas(); sizeMap(); }).observe(stage);
  new ResizeObserver(sizeMap).observe(mapC);
  sizeCanvas(); sizeMap();
  applyVolumes();
  setPlayingUI();
  requestAnimationFrame(function (ts) { last = ts; requestAnimationFrame(frame); });
})();
