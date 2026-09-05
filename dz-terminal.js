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

  /* —— Audio (Web Audio, no assets) —— */
  var muted = lsGet("dz_mute") === "1" || reduce;
  var ctx = null;
  var humNodes = null;
  var unlocked = false;
  /* Phone speakers rarely pass true sub (~62 Hz). Coarse/touch → add mid "body"
     so the bed reads like the PC bass without needing a subwoofer. */
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
    unlocked = true;
    return ctx;
  }

  function stopHum() {
    if (!humNodes) return;
    try {
      humNodes.gain.gain.cancelScheduledValues(ctx ? ctx.currentTime : 0);
      if (ctx) humNodes.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
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
      }, 320);
    } catch (_) {
      humNodes = null;
    }
  }

  /* Vurtek Main SoundEngine ambient — 36/40 Hz reactor + bandpass scrubber.
     Phone-only faint mid body so tinny speakers still read atmosphere; desktop stays pure Vurtek. */
  function startHum() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c || humNodes) return;
    function build() {
      if (humNodes || muted || reduce) return;
      var gain = c.createGain();
      gain.gain.value = 0;

      var osc1 = c.createOscillator();
      var osc2 = c.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 36;
      osc2.type = "triangle";
      osc2.frequency.value = 40;

      var bufferSize = Math.floor(c.sampleRate * 2);
      var noiseBuffer = c.createBuffer(1, bufferSize, c.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
      var noise = c.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      var noiseFilter = c.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = opticsLo ? 180 : 220;
      noiseFilter.Q.value = 1.5;

      osc1.connect(gain);
      osc2.connect(gain);
      noise.connect(noiseFilter);
      noiseFilter.connect(gain);

      var oscs = [osc1, osc2];
      if (phoneAudio) {
        var oscBody = c.createOscillator();
        var bodyGain = c.createGain();
        oscBody.type = "sine";
        oscBody.frequency.value = 196;
        bodyGain.gain.value = opticsLo ? 0.22 : 0.32;
        oscBody.connect(bodyGain);
        bodyGain.connect(gain);
        oscBody.start();
        oscs.push(oscBody);
      }

      gain.connect(c.destination);
      osc1.start();
      osc2.start();
      noise.start();

      var target = muted ? 0 : opticsLo ? 0.055 : 0.08;
      gain.gain.linearRampToValueAtTime(target, c.currentTime + 1.0);
      humNodes = { oscs: oscs, noise: noise, gain: gain, master: gain };
    }
    if (c.state === "suspended") {
      c.resume().then(build).catch(build);
    } else {
      build();
    }
  }

  function tone(freq, dur, type, vol) {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g);
    g.connect(c.destination);
    var t0 = c.currentTime;
    g.gain.linearRampToValueAtTime(vol || 0.04, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function playNoiseBurst(dur, freqStart, freqEnd, vol) {
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
    g.gain.setValueAtTime(vol || 0.16, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start();
  }

  /* —— Vurtek industrial SFX (ported) —— */
  function playBootClack() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    var f = c.createBiquadFilter();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(140, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.08);
    f.type = "lowpass";
    f.frequency.value = 320;
    g.gain.setValueAtTime(0.3, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
    o.connect(f);
    f.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.1);
  }
  function playPneumaticHiss() {
    playNoiseBurst(0.25, 1200, 400, 0.18);
  }
  function playRelayClick() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(2400, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.04);
    g.gain.setValueAtTime(0.2, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.04);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.04);
  }
  function playGeigerBurst() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    for (var i = 0; i < 4; i++) {
      (function (delay) {
        var o = c.createOscillator();
        var g = c.createGain();
        o.type = "triangle";
        o.frequency.setValueAtTime(1800 + Math.random() * 600, c.currentTime + delay);
        g.gain.setValueAtTime(0.08, c.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + 0.015);
        o.connect(g);
        g.connect(c.destination);
        o.start(c.currentTime + delay);
        o.stop(c.currentTime + delay + 0.02);
      })(i * 0.03 + Math.random() * 0.02);
    }
  }
  function playInjection() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(220, c.currentTime + 0.35);
    g.gain.setValueAtTime(0.15, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.35);
  }
  function playGazeCut() {
    playRelayClick();
    setTimeout(function () {
      playNoiseBurst(0.08, 2000, 600, 0.1);
    }, 20);
  }
  function playSpikeFire() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(160, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.25);
    g.gain.setValueAtTime(0.32, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.25);
    playPneumaticHiss();
  }
  function playTransmissionStatic() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c) return;
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(1420, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(840, c.currentTime + 0.18);
    g.gain.setValueAtTime(0.12, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.18);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.18);
    playNoiseBurst(0.15, 1600, 500, 0.1);
  }

  function beepLog() {
    playRelayClick();
    setTimeout(playGeigerBurst, 45);
  }
  function beepSoft() {
    playRelayClick();
  }
  function beepHash() {
    tone(240, 0.04, "sawtooth", 0.018);
    setTimeout(function () {
      tone(190, 0.08, "sawtooth", 0.014);
    }, 30);
    playTransmissionStatic();
  }
  function beepBoot() {
    playBootClack();
    setTimeout(playPneumaticHiss, 60);
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
          ? "Réactiver atmosphère Vurtek (réacteur 36/40 Hz)"
          : "Enable Vurtek atmosphere (36/40 Hz reactor)"
        : lang === "fr"
          ? "Couper atmosphère Vurtek"
          : "Mute Vurtek atmosphere";
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
