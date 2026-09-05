/*! Deck Zero optical terminal — shared diegetic helpers (audio / optics / meta) */
(function (global) {
  "use strict";

  var reduce =
    global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse =
    global.matchMedia && global.matchMedia("(pointer:coarse)").matches;

  function lsGet(k) {
    try {
      return localStorage.getItem(k);
    } catch (_) {
      return null;
    }
  }
  function lsSet(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch (_) {}
  }

  /* —— Absolute Open Graph / canonical —— */
  function absUrl(rel) {
    try {
      return new URL(rel, location.href).href;
    } catch (_) {
      return rel;
    }
  }
  function ensureMeta(prop, content, isName) {
    var sel = isName
      ? 'meta[name="' + prop + '"]'
      : 'meta[property="' + prop + '"]';
    var el = document.querySelector(sel);
    if (!el) {
      el = document.createElement("meta");
      if (isName) el.setAttribute("name", prop);
      else el.setAttribute("property", prop);
      document.head.appendChild(el);
    }
    el.setAttribute("content", content);
  }
  function fixMeta() {
    var pageUrl = location.href.split("#")[0];
    var og = document.querySelector('meta[property="og:image"]');
    if (og) og.setAttribute("content", absUrl("og.png"));
    var tw = document.querySelector('meta[name="twitter:image"]');
    if (tw) tw.setAttribute("content", absUrl("og.png"));
    ensureMeta("og:url", pageUrl, false);
    ensureMeta("twitter:url", pageUrl, true);
    var title = document.title || "Deck Zero";
    ensureMeta("og:title", title, false);
    ensureMeta("twitter:title", title, true);
    var desc = document.querySelector('meta[name="description"]');
    if (desc && desc.content) {
      ensureMeta("og:description", desc.content, false);
      ensureMeta("twitter:description", desc.content, true);
    }
    var can = document.querySelector('link[rel="canonical"]');
    if (!can) {
      can = document.createElement("link");
      can.rel = "canonical";
      document.head.appendChild(can);
    }
    can.href = pageUrl;
    var icon = document.querySelector('link[rel="icon"]');
    if (icon && icon.getAttribute("href") === "favicon.svg") {
      icon.setAttribute("href", absUrl("favicon.svg"));
    }
  }

  /* —— Optics LO (perf) —— */
  var opticsLo = lsGet("dz_optics_lo") === "1" || (coarse && lsGet("dz_optics_lo") !== "0");
  function applyOptics() {
    document.documentElement.classList.toggle("optics-lo", opticsLo);
    document.body && document.body.classList.toggle("optics-lo", opticsLo);
  }
  function setOpticsLo(on) {
    opticsLo = !!on;
    lsSet("dz_optics_lo", opticsLo ? "1" : "0");
    applyOptics();
    syncOptControls();
  }
  function syncOptControls() {
    document.querySelectorAll("[data-optics-lo]").forEach(function (b) {
      b.classList.toggle("on", opticsLo);
      b.setAttribute("aria-pressed", opticsLo ? "true" : "false");
      var lang = document.documentElement.lang === "fr" ? "fr" : "en";
      b.title = opticsLo
        ? lang === "fr"
          ? "Optique basse (active)"
          : "Low optics (on)"
        : lang === "fr"
          ? "Optique basse"
          : "Low optics";
    });
  }

  /* —— Optical audio (Continuity mix law 1786282976753-5hthkk) ——
     Bed = Faraday under text. UI = clac + bip on separate bus + short bed duck.
     Original share phosphor tones restored for clicks; industrial SFX kept for Gaze only. */
  var muted = lsGet("dz_mute") === "1" || reduce;
  var ctx = null;
  var humNodes = null;
  var unlocked = false;
  var masterGain = null;
  var bedBus = null;
  var uiBus = null;
  var bedDuckGain = null;
  var sampleCache = {};
  var samplesTried = false;
  var phoneAudio =
    coarse ||
    (global.matchMedia &&
      global.matchMedia("(hover: none) and (pointer: coarse)").matches) ||
    /iPhone|iPad|iPod|Android/i.test(global.navigator && global.navigator.userAgent);

  function ensureCtx() {
    if (muted || reduce) return null;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") {
      try {
        ctx.resume();
      } catch (_) {}
    }
    if (!masterGain) {
      masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 2.4;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      masterGain.connect(comp);
      comp.connect(ctx.destination);
      bedDuckGain = ctx.createGain();
      bedDuckGain.gain.value = 1;
      bedBus = ctx.createGain();
      bedBus.gain.value = 1;
      bedBus.connect(bedDuckGain);
      bedDuckGain.connect(masterGain);
      uiBus = ctx.createGain();
      uiBus.gain.value = 1;
      uiBus.connect(masterGain);
    }
    unlocked = true;
    return ctx;
  }

  function duckBed(depth, ms) {
    if (!bedDuckGain || !ctx) return;
    var t0 = ctx.currentTime;
    var d = typeof depth === "number" ? depth : 0.4;
    var hold = (typeof ms === "number" ? ms : 85) / 1000;
    try {
      bedDuckGain.gain.cancelScheduledValues(t0);
      bedDuckGain.gain.setValueAtTime(bedDuckGain.gain.value, t0);
      bedDuckGain.gain.linearRampToValueAtTime(d, t0 + 0.012);
      bedDuckGain.gain.linearRampToValueAtTime(1, t0 + 0.012 + hold);
    } catch (_) {}
  }

  function stopHum() {
    if (!humNodes) return;
    try {
      humNodes.gain.gain.cancelScheduledValues(ctx ? ctx.currentTime : 0);
      if (ctx) humNodes.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.22);
      setTimeout(function () {
        try {
          (humNodes.oscs || []).forEach(function (o) {
            try {
              o.stop();
            } catch (_) {}
          });
          if (humNodes.noise) {
            try {
              humNodes.noise.stop();
            } catch (_) {}
          }
        } catch (_) {}
        humNodes = null;
      }, 280);
    } catch (_) {
      humNodes = null;
    }
  }

  /* Faraday bed — soft ~58/87 Hz + mid body + quiet scrubber (law). Phone body preserved. */
  function startHum() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c || humNodes) return;
    function build() {
      if (humNodes || muted || reduce) return;
      var gain = c.createGain();
      gain.gain.value = 0;
      var shelf = c.createBiquadFilter();
      shelf.type = "highshelf";
      shelf.frequency.value = 900;
      shelf.gain.value = -10;
      var filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = phoneAudio ? 620 : 380;
      filter.Q.value = 0.7;

      var osc1 = c.createOscillator();
      var osc2 = c.createOscillator();
      var oscBody = c.createOscillator();
      var oscAir = c.createOscillator();
      var lfo = c.createOscillator();
      var lfoGain = c.createGain();
      var bodyGain = c.createGain();
      var airGain = c.createGain();
      osc1.type = "sine";
      osc1.frequency.value = 58;
      osc2.type = "triangle";
      osc2.frequency.value = 87;
      oscBody.type = "sine";
      oscBody.frequency.value = phoneAudio ? 174 : 145;
      bodyGain.gain.value = phoneAudio ? (opticsLo ? 0.42 : 0.55) : opticsLo ? 0.16 : 0.24;
      oscAir.type = "sine";
      oscAir.frequency.value = phoneAudio ? 245 : 210;
      airGain.gain.value = phoneAudio ? (opticsLo ? 0.14 : 0.2) : opticsLo ? 0.05 : 0.08;
      lfo.type = "sine";
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = phoneAudio ? 0.014 : 0.01;

      var bufferSize = Math.floor(c.sampleRate * 2);
      var noiseBuffer = c.createBuffer(1, bufferSize, c.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.22;
      var noise = c.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      var noiseFilter = c.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = opticsLo ? 160 : 200;
      noiseFilter.Q.value = 1.2;
      var noiseGain = c.createGain();
      noiseGain.gain.value = opticsLo ? 0.012 : 0.02;

      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      osc1.connect(filter);
      osc2.connect(filter);
      oscBody.connect(bodyGain);
      bodyGain.connect(filter);
      oscAir.connect(airGain);
      airGain.connect(filter);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(filter);
      filter.connect(shelf);
      shelf.connect(gain);
      gain.connect(bedBus || c.destination);

      osc1.start();
      osc2.start();
      oscBody.start();
      oscAir.start();
      lfo.start();
      noise.start();

      var target = opticsLo
        ? phoneAudio
          ? 0.032
          : 0.016
        : phoneAudio
          ? 0.044
          : 0.026;
      gain.gain.linearRampToValueAtTime(target, c.currentTime + 1.1);
      humNodes = {
        oscs: [osc1, osc2, oscBody, oscAir, lfo],
        noise: noise,
        gain: gain
      };
      preloadUiSamples();
    }
    if (c.state === "suspended") {
      c.resume().then(build).catch(build);
    } else {
      build();
    }
  }

  function uiOut() {
    return uiBus || (ctx && ctx.destination);
  }

  function tone(freq, dur, type, vol, dest) {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g);
    g.connect(dest || uiOut());
    var t0 = c.currentTime;
    g.gain.linearRampToValueAtTime(vol || 0.04, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function playNoiseBurst(dur, freqStart, freqEnd, vol, dest) {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var n = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(freqStart, c.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, freqEnd), c.currentTime + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(vol || 0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest || uiOut());
    src.start();
  }

  function playBuffer(name, vol, rate) {
    var buf = sampleCache[name];
    if (!buf || !ctx || muted || reduce) return false;
    try {
      var src = ctx.createBufferSource();
      src.buffer = buf;
      if (rate) src.playbackRate.value = rate;
      var g = ctx.createGain();
      g.gain.value = vol || 0.35;
      src.connect(g);
      g.connect(uiOut());
      src.start();
      return true;
    } catch (_) {
      return false;
    }
  }

  function preloadUiSamples() {
    if (samplesTried || !ctx) return;
    samplesTried = true;
    var base = "media/audio/";
    ["ui_clac", "ui_bip", "ui_page", "crush_glass"].forEach(function (name) {
      fetch(base + name + ".wav")
        .then(function (r) {
          return r.ok ? r.arrayBuffer() : null;
        })
        .then(function (ab) {
          if (!ab || !ctx) return;
          return ctx.decodeAudioData(ab.slice(0));
        })
        .then(function (buf) {
          if (buf) sampleCache[name] = buf;
        })
        .catch(function () {});
    });
  }

  /* UI clac — HP noise ~3.2 kHz + mid key thump 220→95 Hz (law) */
  function playClac(strength) {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var s = typeof strength === "number" ? strength : 1;
    if (playBuffer("ui_clac", 0.28 * s, 0.96 + Math.random() * 0.08)) {
      duckBed(0.42, 80);
      return;
    }
    duckBed(0.4, 85);
    var n = Math.floor(c.sampleRate * 0.028);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) {
      var env = 1 - i / n;
      d[i] = (Math.random() * 2 - 1) * env * env;
    }
    var src = c.createBufferSource();
    src.buffer = buf;
    var hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 3200;
    hp.Q.value = 0.7;
    var ng = c.createGain();
    ng.gain.setValueAtTime(0.11 * s, c.currentTime);
    ng.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.03);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(uiOut());
    src.start();

    var o = c.createOscillator();
    var g = c.createGain();
    var lp = c.createBiquadFilter();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(95, c.currentTime + 0.055);
    lp.type = "lowpass";
    lp.frequency.value = 900;
    g.gain.setValueAtTime(0.09 * s, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
    o.connect(lp);
    lp.connect(g);
    g.connect(uiOut());
    o.start();
    o.stop(c.currentTime + 0.07);
  }

  /* UI bip — phosphor square/triangle ~640–980 Hz (law) + original soft sine cousin */
  function playBip(kind) {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    if (kind === "page" && playBuffer("ui_page", 0.32)) return;
    if (kind !== "page" && playBuffer("ui_bip", 0.3, 0.98 + Math.random() * 0.06)) return;
    if (kind === "page") {
      tone(880, 0.055, "square", 0.028);
      setTimeout(function () {
        tone(660, 0.048, "square", 0.02);
      }, 38);
      return;
    }
    if (kind === "hash") {
      tone(240, 0.04, "sawtooth", 0.016);
      setTimeout(function () {
        tone(190, 0.07, "sawtooth", 0.012);
      }, 28);
      return;
    }
    /* Soft UI — original share beepSoft + phosphor tip */
    tone(520, 0.048, "sine", 0.026);
    setTimeout(function () {
      tone(780, 0.028, "triangle", 0.014);
    }, 18);
  }

  function playCrushGlass() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    duckBed(0.35, 70);
    if (playBuffer("crush_glass", 0.4)) return;
    playNoiseBurst(0.045, 2800, 900, 0.07);
    tone(340, 0.04, "sine", 0.018);
    setTimeout(function () {
      tone(190, 0.06, "triangle", 0.012);
    }, 22);
  }

  /* Industrial / Gaze-only (kept quieter than before) */
  function playBootClack() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    duckBed(0.45, 90);
    var o = c.createOscillator();
    var g = c.createGain();
    var f = c.createBiquadFilter();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(140, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.08);
    f.type = "lowpass";
    f.frequency.value = 320;
    g.gain.setValueAtTime(0.22, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    o.connect(f);
    f.connect(g);
    g.connect(uiOut());
    o.start();
    o.stop(c.currentTime + 0.1);
  }
  function playPneumaticHiss() {
    playNoiseBurst(0.22, 1100, 380, 0.12);
  }
  function playRelayClick() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    duckBed(0.5, 55);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(2100, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(520, c.currentTime + 0.035);
    g.gain.setValueAtTime(0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.035);
    o.connect(g);
    g.connect(uiOut());
    o.start();
    o.stop(c.currentTime + 0.04);
  }
  function playGeigerBurst() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    for (var i = 0; i < 3; i++) {
      (function (delay) {
        var o = c.createOscillator();
        var g = c.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(1700 + Math.random() * 500, c.currentTime + delay);
        g.gain.setValueAtTime(0.05, c.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + 0.014);
        o.connect(g);
        g.connect(uiOut());
        o.start(c.currentTime + delay);
        o.stop(c.currentTime + delay + 0.018);
      })(i * 0.028 + Math.random() * 0.015);
    }
  }
  function playInjection() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    duckBed(0.38, 120);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.32);
    g.gain.setValueAtTime(0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.32);
    o.connect(g);
    g.connect(uiOut());
    o.start();
    o.stop(c.currentTime + 0.32);
    playNoiseBurst(0.12, 900, 300, 0.06);
  }
  function playGazeCut() {
    playClac(0.85);
    setTimeout(function () {
      playNoiseBurst(0.07, 1900, 550, 0.08);
    }, 18);
  }
  function playSpikeFire() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    duckBed(0.35, 140);
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(160, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.22);
    g.gain.setValueAtTime(0.24, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.22);
    o.connect(g);
    g.connect(uiOut());
    o.start();
    o.stop(c.currentTime + 0.22);
    playPneumaticHiss();
  }
  function playTransmissionStatic() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(1200, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(720, c.currentTime + 0.14);
    g.gain.setValueAtTime(0.07, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.14);
    o.connect(g);
    g.connect(uiOut());
    o.start();
    o.stop(c.currentTime + 0.14);
    playNoiseBurst(0.1, 1400, 450, 0.055);
  }

  function beepLog() {
    playClac(1.05);
    playBip("page");
  }
  function beepSoft() {
    playClac(0.9);
    playBip("soft");
  }
  function beepHash() {
    playBip("hash");
    playTransmissionStatic();
  }
  function beepBoot() {
    /* Original soft boot chirp — not industrial clack+hiss on every cold open */
    tone(420, 0.055, "sine", 0.03);
    setTimeout(function () {
      tone(560, 0.04, "triangle", 0.018);
    }, 40);
    playClac(0.7);
  }

  function setMuted(on) {
    muted = !!on;
    lsSet("dz_mute", muted ? "1" : "0");
    if (muted) stopHum();
    else if (unlocked) startHum();
    syncMuteControls();
  }
  function syncMuteControls() {
    document.querySelectorAll("[data-audio-mute]").forEach(function (b) {
      b.classList.toggle("on", muted);
      b.setAttribute("aria-pressed", muted ? "true" : "false");
      var lang = document.documentElement.lang === "fr" ? "fr" : "en";
      b.textContent = muted ? (lang === "fr" ? "SON OFF" : "AUD OFF") : lang === "fr" ? "SON" : "AUD";
      b.title = muted
        ? lang === "fr"
          ? "Réactiver l’audio optique Faraday"
          : "Enable Faraday optical audio"
        : lang === "fr"
          ? "Couper l’audio optique"
          : "Mute optical audio";
    });
  }

  function unlockOnGesture() {
    if (unlocked || muted || reduce) return;
    ensureCtx();
    startHum();
  }

  /* —— Progress (cleared panels visited) —— */
  function markPanel(n) {
    var key = "dz_log_seen";
    var raw = lsGet(key) || "";
    var set = {};
    raw.split(",").forEach(function (p) {
      if (p) set[p] = 1;
    });
    set[String(n)] = 1;
    var arr = Object.keys(set)
      .map(Number)
      .filter(function (x) {
        return x >= 1 && x <= 99;
      })
      .sort(function (a, b) {
        return a - b;
      });
    lsSet(key, arr.join(","));
    return arr.length;
  }
  function seenCount() {
    var raw = lsGet("dz_log_seen") || "";
    if (!raw) return 0;
    return raw.split(",").filter(Boolean).length;
  }

  /* —— Wire chrome controls —— */
  function syncT120Stamp() {
    var el = document.getElementById("t120StampText");
    if (!el) return;
    var d = new Date();
    var mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    var dd = String(d.getUTCDate()).padStart(2, "0");
    el.textContent = "OPT · 2118." + mm + "." + dd;
  }

  function bindChrome() {
    applyOptics();
    syncMuteControls();
    syncOptControls();
    syncT120Stamp();
    document.querySelectorAll("[data-audio-mute]").forEach(function (b) {
      b.addEventListener("click", function () {
        setMuted(!muted);
        unlockOnGesture();
      });
    });
    document.querySelectorAll("[data-optics-lo]").forEach(function (b) {
      b.addEventListener("click", function () {
        setOpticsLo(!opticsLo);
        /* Rebuild bed at LO/full level — never hard-mute on optics alone. */
        if (unlocked && !muted) {
          stopHum();
          setTimeout(function () {
            if (!muted && unlocked) startHum();
          }, 280);
        }
      });
    });
    ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
      document.addEventListener(ev, unlockOnGesture, { once: true, passive: true });
    });
  }

  function forceHashLink(ms) {
    var link = document.getElementById("linkStatus");
    if (!link) return;
    link.textContent = "LINK HASH";
    link.classList.add("hash");
    beepHash();
    setTimeout(function () {
      if (!link) return;
      link.textContent = "LINK OK";
      link.classList.remove("hash");
    }, ms || 900);
  }

  fixMeta();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindChrome);
  } else {
    bindChrome();
  }

  global.DZ = {
    reduce: reduce,
    coarse: coarse,
    muted: function () {
      return muted;
    },
    setMuted: setMuted,
    opticsLo: function () {
      return opticsLo;
    },
    setOpticsLo: setOpticsLo,
    beepLog: beepLog,
    beepSoft: beepSoft,
    beepHash: beepHash,
    beepBoot: beepBoot,
    playClac: playClac,
    playBip: playBip,
    playCrushGlass: playCrushGlass,
    playBootClack: playBootClack,
    playPneumaticHiss: playPneumaticHiss,
    playRelayClick: playRelayClick,
    playGeigerBurst: playGeigerBurst,
    playInjection: playInjection,
    playGazeCut: playGazeCut,
    playSpikeFire: playSpikeFire,
    playTransmissionStatic: playTransmissionStatic,
    startHum: startHum,
    stopHum: stopHum,
    unlock: unlockOnGesture,
    markPanel: markPanel,
    seenCount: seenCount,
    forceHashLink: forceHashLink,
    syncLabels: function () {
      syncMuteControls();
      syncOptControls();
    },
    absUrl: absUrl
  };
})(window);
