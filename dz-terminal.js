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
      if (ctx) humNodes.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      setTimeout(function () {
        try {
          (humNodes.oscs || []).forEach(function (o) {
            try {
              o.stop();
            } catch (_) {}
          });
        } catch (_) {}
        humNodes = null;
      }, 260);
    } catch (_) {
      humNodes = null;
    }
  }

  function startHum() {
    if (muted || reduce) return;
    var c = ensureCtx();
    if (!c || humNodes) return;
    function build() {
      if (humNodes || muted || reduce) return;
      var osc1 = c.createOscillator();
      var osc2 = c.createOscillator();
      var oscBody = c.createOscillator();
      var oscAir = c.createOscillator();
      var lfo = c.createOscillator();
      var lfoGain = c.createGain();
      var gain = c.createGain();
      var filter = c.createBiquadFilter();
      var bodyGain = c.createGain();
      var airGain = c.createGain();
      /* True bed — headphones / desktop hear this; phone speakers mostly don't. */
      osc1.type = "sine";
      osc1.frequency.value = 62;
      osc2.type = "triangle";
      osc2.frequency.value = 118;
      /* Phone-passband body — carries the same “warmth” on tinny speakers. */
      oscBody.type = "sine";
      oscBody.frequency.value = phoneAudio ? 196 : 155;
      bodyGain.gain.value = phoneAudio ? (opticsLo ? 0.55 : 0.7) : opticsLo ? 0.2 : 0.28;
      oscAir.type = "sine";
      oscAir.frequency.value = phoneAudio ? 245 : 210;
      airGain.gain.value = phoneAudio ? (opticsLo ? 0.22 : 0.32) : opticsLo ? 0.08 : 0.12;
      lfo.type = "sine";
      lfo.frequency.value = 0.07;
      lfoGain.gain.value = phoneAudio ? 0.018 : 0.012;
      filter.type = "lowpass";
      filter.frequency.value = phoneAudio ? 620 : 320;
      filter.Q.value = 0.7;
      gain.gain.value = 0;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      osc1.connect(filter);
      osc2.connect(filter);
      oscBody.connect(bodyGain);
      bodyGain.connect(filter);
      oscAir.connect(airGain);
      airGain.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);
      osc1.start();
      osc2.start();
      oscBody.start();
      oscAir.start();
      lfo.start();
      /* Optics LO used to hard-mute the bed on mobile (LO is default on coarse).
         Keep a thinner bed instead — visuals dim, audio still present. */
      var target = opticsLo
        ? phoneAudio
          ? 0.034
          : 0.014
        : phoneAudio
          ? 0.048
          : 0.024;
      gain.gain.linearRampToValueAtTime(target, c.currentTime + 1.1);
      humNodes = {
        oscs: [osc1, osc2, oscBody, oscAir, lfo],
        gain: gain,
      };
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

  function beepLog() {
    tone(880, 0.06, "square", 0.03);
    setTimeout(function () {
      tone(660, 0.05, "square", 0.022);
    }, 40);
  }
  function beepSoft() {
    tone(520, 0.05, "sine", 0.025);
  }
  function beepHash() {
    tone(240, 0.04, "sawtooth", 0.018);
    setTimeout(function () {
      tone(190, 0.08, "sawtooth", 0.014);
    }, 30);
  }
  function beepBoot() {
    tone(420, 0.05, "sine", 0.03);
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
          ? "Réactiver l’audio optique"
          : "Enable optical audio"
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
