/*! Deck Zero site menu — clear nav to Dossier / Novel / Gaze / Lexicon */
(function (global) {
  "use strict";

  function lang() {
    return document.documentElement.lang === "fr" ? "fr" : "en";
  }

  function href(path) {
    var q = lang() === "fr" ? "?lang=fr" : "?lang=en";
    if (/^https?:/i.test(path)) return path;
    return path + (path.indexOf("?") >= 0 ? "&lang=" + lang() : q);
  }

  var CSS =
    ".dz-site-menu{position:relative;display:inline-flex;align-items:center}" +
    ".dz-site-menu > button{" +
    "font:inherit;font-family:var(--mono),ui-monospace,monospace;font-size:.62rem;letter-spacing:.1em;" +
    "text-transform:uppercase;padding:.4rem .55rem;border:1px solid rgba(77,255,154,.28);" +
    "background:rgba(4,14,10,.85);color:#8aab9a;cursor:pointer;min-height:36px}" +
    ".dz-site-menu > button:hover,.dz-site-menu > button[aria-expanded='true']{" +
    "color:#020805;background:#4dff9a;border-color:#4dff9a}" +
    ".dz-site-panel{" +
    "display:none;position:absolute;top:calc(100% + 6px);right:0;z-index:80;min-width:220px;" +
    "border:1px solid rgba(77,255,154,.28);background:rgba(2,8,5,.97);padding:.4rem;" +
    "box-shadow:0 12px 40px rgba(0,0,0,.55)}" +
    ".dz-site-menu.open .dz-site-panel{display:block}" +
    ".dz-site-panel a{" +
    "display:block;padding:.55rem .65rem;color:#c5ddd0;text-decoration:none;" +
    "font-family:var(--mono),ui-monospace,monospace;font-size:.62rem;letter-spacing:.08em;" +
    "text-transform:uppercase;border:1px solid transparent}" +
    ".dz-site-panel a:hover{color:#020805;background:#4dff9a}" +
    ".dz-site-panel .dz-site-head{" +
    "padding:.35rem .65rem .45rem;color:#5a7d6c;font-size:.55rem;letter-spacing:.1em;" +
    "text-transform:uppercase;font-family:var(--mono),ui-monospace,monospace}" +
    ".dz-hub{display:grid;gap:.75rem;margin:1.25rem 0 1rem;max-width:36rem}" +
    ".dz-hub a{" +
    "display:block;border:1px solid rgba(77,255,154,.28);background:rgba(4,14,10,.75);" +
    "padding:.95rem 1rem;text-decoration:none;color:inherit;transition:border-color .15s,background .15s}" +
    ".dz-hub a:hover{border-color:#4dff9a;background:rgba(77,255,154,.08)}" +
    ".dz-hub a.primary{border-color:#4dff9a;box-shadow:0 0 24px rgba(77,255,154,.12)}" +
    ".dz-hub .k{" +
    "font-family:var(--mono),ui-monospace,monospace;font-size:.62rem;letter-spacing:.12em;" +
    "text-transform:uppercase;color:#4dff9a;margin-bottom:.35rem}" +
    ".dz-hub .t{font-family:var(--mono),ui-monospace,monospace;font-size:1rem;letter-spacing:.04em;" +
    "text-transform:uppercase;color:#eefaf3;margin-bottom:.25rem}" +
    ".dz-hub .d{font-size:.95rem;line-height:1.45;color:#8aab9a}";

  function ensureCss() {
    if (document.getElementById("dz-site-menu-css")) return;
    var s = document.createElement("style");
    s.id = "dz-site-menu-css";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function links() {
    var fr = lang() === "fr";
    return [
      { href: "index.html", en: "Home · Deck Zero", fr: "Accueil · Deck Zero" },
      { href: "ARCHIVES_Silent_Running.html", en: "1 · Read the novel", fr: "1 · Lire le roman" },
      { href: "DECK_ZERO_Pitch.html", en: "2 · Open dossier (play Brief)", fr: "2 · Ouvrir le dossier (Brief)" },
      { href: "ARCHIVES_Gaze.html", en: "3 · Feel Ch.01 · Displaced Gaze", fr: "3 · Sentir Ch.01 · Regard déplacé" },
      { href: "ARCHIVES_Lexicon.html", en: "4 · Hard-SF lexicon", fr: "4 · Lexique hard-SF" },
      {
        href: "media/archives/THE_SILENT_RUNNING.md",
        en: "Download manuscript (.md)",
        fr: "Télécharger le manuscrit (.md)"
      }
    ].map(function (L) {
      return { href: href(L.href), label: fr ? L.fr : L.en };
    });
  }

  function sfx(name) {
    var dz = global.DZ;
    if (!dz || typeof dz[name] !== "function") return;
    try {
      dz[name]();
    } catch (_) {}
  }

  function mountMenu(host) {
    if (!host || host.dataset.dzMounted === "1") return;
    host.dataset.dzMounted = "1";
    ensureCss();
    var fr = lang() === "fr";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.textContent = fr ? "Menu" : "Menu";
    var panel = document.createElement("div");
    panel.className = "dz-site-panel";
    panel.setAttribute("role", "menu");
    var head = document.createElement("div");
    head.className = "dz-site-head";
    head.textContent = fr ? "Tout le site" : "Whole site";
    panel.appendChild(head);
    links().forEach(function (L) {
      var a = document.createElement("a");
      a.href = L.href;
      a.textContent = L.label;
      a.setAttribute("role", "menuitem");
      a.addEventListener("click", function () {
        sfx("playPneumaticHiss");
      });
      panel.appendChild(a);
    });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !host.classList.contains("open");
      host.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) sfx("playRelayClick");
    });
    document.addEventListener("click", function () {
      host.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });
    host.className = (host.className + " dz-site-menu").trim();
    host.appendChild(btn);
    host.appendChild(panel);
  }

  function mountHub(host) {
    if (!host || host.dataset.dzMounted === "1") return;
    host.dataset.dzMounted = "1";
    ensureCss();
    var fr = lang() === "fr";
    host.className = (host.className + " dz-hub").trim();
    var items = [
      {
        primary: true,
        href: "ARCHIVES_Silent_Running.html",
        k: fr ? "Lire · Roman" : "Read · Novel",
        t: "The Silent Running",
        d: fr
          ? "La dette a acheté la combinaison. L’amour amorti comme du minerai."
          : "Debt bought the suit. Love amortized like ore."
      },
      {
        href: "DECK_ZERO_Pitch.html",
        k: fr ? "Dossier · Cairn-9" : "Dossier · Cairn-9",
        t: fr ? "Ouvrir Cairn-9" : "Open Cairn-9",
        d: fr
          ? "Coque chaude. Lumière honnête. Une seconde qu’on peut tenir."
          : "Warm hull. Honest light. A second you can hold still."
      },
      {
        href: "ARCHIVES_Gaze.html",
        k: fr ? "Sentir · Regard" : "Feel · Gaze",
        t: fr ? "Regard déplacé" : "Displaced Gaze",
        d: fr
          ? "Sentir la coupe : fente 3 mm ↔ caméra. Chapitre 01."
          : "Feel the cut: 3mm Slot ↔ camera. Chapter 01."
      },
      {
        href: "ARCHIVES_Lexicon.html",
        k: fr ? "Profond · Thèse" : "Deep · Thesis",
        t: fr ? "Lexique hard-SF" : "Hard-SF lexicon",
        d: fr
          ? "Fermi, Filtre, saccades, pavages."
          : "Fermi, Filter, saccades, tiling."
      }
    ];
    items.forEach(function (it) {
      var a = document.createElement("a");
      a.href = href(it.href);
      if (it.primary) a.className = "primary";
      a.innerHTML =
        '<div class="k">' +
        it.k +
        '</div><div class="t">' +
        it.t +
        '</div><div class="d">' +
        it.d +
        "</div>";
      a.addEventListener("click", function () {
        sfx(it.href.indexOf("Gaze") >= 0 ? "playGazeCut" : "playPneumaticHiss");
      });
      host.appendChild(a);
    });
  }

  function boot() {
    document.querySelectorAll("[data-dz-site-menu]").forEach(mountMenu);
    document.querySelectorAll("[data-dz-site-hub]").forEach(mountHub);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.DZSiteMenu = { boot: boot, href: href };
})(window);
