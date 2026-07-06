/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.
   ------------------------------------------------------------------
   vahini-insights.js, FIRST-PARTY audience profile + private feedback capture.

   WHAT THIS DOES (client side only, no third-party trackers):
   1) Builds a lightweight, persistent VISITOR PROFILE in this browser
      (a stable id in localStorage + a 1-year cookie), enriched with everything
      the browser will tell us without asking: locale, languages, timezone,
      coarse region, screen, platform, referrer, UTM source, visit count, and
      the topics/pages the visitor looks at (their "interests"). No image, no
      handwriting, no personal data is collected here.
   2) Gives every report/session a durable ID you can correlate later.
   3) Provides a PRIVATE feedback widget, bug report, feature request, rate the
      algorithm, how-happy, and "contact me" after a PDF is generated. Responses
      are NOT shown anywhere on the site; they are stored for you.

   ⚠️ PERSISTENCE, READ THIS:
   localStorage + cookies live in EACH visitor's OWN browser. They do NOT
   aggregate into a database you can read. To actually COLLECT this centrally you
   must set an endpoint that receives the JSON we POST:
       window.VAHINI_INSIGHTS = { endpoint: "https://your-endpoint.example/collect" };
   Point it at a serverless function, a Google Apps Script web-app, Formspree,
   Supabase, etc. Until an endpoint is set, data is buffered locally and flushed
   automatically once an endpoint becomes available. Nothing is lost; nothing
   leaves the browser without your endpoint.
   ================================================================== */
(function () {
  "use strict";
  var CFG = window.VAHINI_INSIGHTS || (window.VAHINI_INSIGHTS = {});
  var ENDPOINT = CFG.endpoint || "";              // you set this
  var EMAIL_TO = CFG.emailTo || "vahinitechfirm@gmail.com"; // mailto fallback recipient
  var LS_VISITOR = "vahini_visitor";
  var LS_FEEDBACK = "vahini_feedback";
  var LS_QUEUE = "vahini_outbox";
  var COOKIE = "v_vid";

  /* ---------- tiny helpers ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }
  function read(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function setCookie(n, v, days) {
    try {
      var d = new Date(); d.setTime(d.getTime() + days * 864e5);
      document.cookie = n + "=" + encodeURIComponent(v) + ";expires=" + d.toUTCString() + ";path=/;SameSite=Lax";
    } catch (e) {}
  }
  function getCookie(n) {
    try {
      var m = document.cookie.match("(^|;)\\s*" + n + "\\s*=\\s*([^;]+)");
      return m ? decodeURIComponent(m.pop()) : "";
    } catch (e) { return ""; }
  }
  function qp(name) {
    try { return new URLSearchParams(location.search).get(name) || ""; } catch (e) { return ""; }
  }

  /* ---------- topic inference from the URL (interest signal) ---------- */
  function topicOf(path) {
    path = (path || location.pathname).toLowerCase();
    var map = [
      [/analy|report/, "handwriting-analyser"], [/factor/, "20-factors"],
      [/battu|product|pen/, "the-pen"], [/technolog|patent/, "technology"],
      [/solution-handwriting|handwriting/, "handwriting"], [/diagnos|assistive/, "health-screening"],
      [/digiti|insight/, "digitisation"], [/invest/, "investors"], [/award|event/, "traction"],
      [/blog|why-handwriting|resource|faq/, "learn"], [/about|reach/, "company"]
    ];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(path)) return map[i][1];
    return "home";
  }

  /* ---------- build / update the visitor profile ---------- */
  function profile() {
    var now = new Date().toISOString();
    var p = read(LS_VISITOR, null);
    var vid = getCookie(COOKIE) || (p && p.vid) || uuid();
    setCookie(COOKIE, vid, 365);

    if (!p) {
      p = {
        vid: vid, first_seen: now, visits: 0,
        referrer: document.referrer || "",
        utm: { source: qp("utm_source"), medium: qp("utm_medium"), campaign: qp("utm_campaign") },
        interests: {}, pages: 0
      };
    }
    p.vid = vid;
    p.last_seen = now;
    p.visits = (p.visits || 0) + 1;
    p.pages = (p.pages || 0) + 1;

    // browser-derived enrichment (no permissions needed)
    var nav = navigator || {};
    var loc = (nav.languages && nav.languages[0]) || nav.language || "";
    var region = (loc.split("-")[1] || "").toUpperCase();
    var tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    p.locale = loc;
    p.languages = (nav.languages || []).slice(0, 4);
    p.country = region || p.country || "";          // coarse, from locale (e.g. te-IN → IN)
    p.timezone = tz;                                  // e.g. Asia/Kolkata → location proxy
    p.platform = nav.platform || "";
    p.ua = nav.userAgent || "";
    p.screen = (screen.width + "x" + screen.height);
    p.viewport = (innerWidth + "x" + innerHeight);
    p.dpr = window.devicePixelRatio || 1;

    // interest accumulation
    var topic = topicOf();
    p.interests[topic] = (p.interests[topic] || 0) + 1;
    p.last_topic = topic;

    write(LS_VISITOR, p);
    return p;
  }

  /* ---------- durable report / session id ---------- */
  function reportId() {
    var p = read(LS_VISITOR, {});
    // short, human-ish id tied to the visitor + time, for cross-referencing reports
    var t = Date.now().toString(36).toUpperCase().slice(-5);
    return "VH-" + (p.vid ? p.vid.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase() : "0000") + "-" + t;
  }

  /* ---------- outbox: send now or buffer until an endpoint exists ---------- */
  function send(kind, payload) {
    var rec = { kind: kind, ts: new Date().toISOString(), vid: (read(LS_VISITOR, {}) || {}).vid, page: location.pathname, data: payload };
    var url = (window.VAHINI_INSIGHTS && window.VAHINI_INSIGHTS.endpoint) || "";
    if (!url) { var q = read(LS_QUEUE, []); q.push(rec); write(LS_QUEUE, q.slice(-200)); return; }
    post(url, rec);
    flush(url);
  }
  function post(url, rec) {
    try {
      var body = JSON.stringify(rec);
      if (navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([body], { type: "application/json" })); }
      else { fetch(url, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }); }
    } catch (e) {}
  }
  function flush(url) {
    var q = read(LS_QUEUE, []);
    if (!q.length) return;
    q.forEach(function (rec) { post(url, rec); });
    write(LS_QUEUE, []);
  }

  /* ================= FEEDBACK WIDGET ================= */
  var TYPES = [
    { k: "love", label: "💚 I like it" },
    { k: "bug", label: "🐞 Report a bug" },
    { k: "feature", label: "✦ Request a feature" },
    { k: "other", label: "✎ Something else" }
  ];

  function injectCSS() {
    if (document.getElementById("vfb-css")) return;
    var s = document.createElement("style"); s.id = "vfb-css";
    s.textContent =
      ".vfb-launch{position:fixed;right:20px;bottom:20px;z-index:9000;display:inline-flex;align-items:center;gap:8px;" +
      "background:#00ADB5;color:#fff;border:0;border-radius:30px;padding:12px 18px;font:600 14px/1 'Hanken Grotesk',system-ui,sans-serif;" +
      "box-shadow:0 10px 30px rgba(0,0,0,.28);cursor:pointer;transition:transform .15s,background .15s;color-scheme:light;}" +
      ".vfb-launch:hover{background:#048A91;transform:translateY(-2px);}" +
      ".vfb-launch svg{width:17px;height:17px;}" +
      ".vfb-ov{position:fixed;inset:0;z-index:9001;background:rgba(20,23,28,.55);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;padding:18px;color-scheme:light;}" +
      ".vfb-ov.on{display:flex;}" +
      ".vfb{width:min(460px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.45);padding:26px 26px 22px;font-family:'Hanken Grotesk',system-ui,sans-serif;color:#222831;}" +
      ".vfb h3{font-family:'Spectral',Georgia,serif;font-size:23px;margin:0 0 4px;}" +
      ".vfb p.sub{margin:0 0 16px;font-size:13.5px;color:#565D66;}" +
      ".vfb__chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;}" +
      ".vfb__chip{border:1.5px solid #E3E5E7;background:#fff;border-radius:22px;padding:8px 13px;font-size:13px;font-weight:600;color:#393E46;cursor:pointer;}" +
      ".vfb__chip.on{border-color:#00ADB5;background:#DCF3F4;color:#075E63;}" +
      ".vfb__lab{display:block;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#828A93;margin:14px 0 7px;}" +
      ".vfb__stars{display:flex;gap:5px;}" +
      ".vfb__star{width:30px;height:30px;cursor:pointer;color:#D7DBDF;}" +
      ".vfb__star.on{color:#E0A53B;}" +
      ".vfb textarea,.vfb input{width:100%;box-sizing:border-box;border:1.5px solid #E3E5E7;border-radius:11px;padding:11px 13px;font:inherit;font-size:14px;color:#222831;background:#fff;}" +
      ".vfb textarea{min-height:84px;resize:vertical;}" +
      ".vfb__row{display:flex;gap:10px;margin-top:10px;}" +
      ".vfb__row input{flex:1;}" +
      ".vfb__act{display:flex;gap:10px;justify-content:flex-end;margin-top:18px;}" +
      ".vfb__btn{border:0;border-radius:11px;padding:11px 18px;font:600 14px/1 'Hanken Grotesk',sans-serif;cursor:pointer;}" +
      ".vfb__btn--g{background:#fff;border:1.5px solid #E3E5E7;color:#393E46;}" +
      ".vfb__btn--p{background:#00ADB5;color:#fff;}" +
      ".vfb__btn--p:hover{background:#048A91;}" +
      ".vfb__done{text-align:center;padding:14px 0 4px;}" +
      ".vfb__done .tick{width:54px;height:54px;border-radius:50%;background:#DCF1E8;color:#0F6E56;display:grid;place-items:center;margin:0 auto 12px;}" +
      ".vfb__done .tick svg{width:28px;height:28px;}";
    document.head.appendChild(s);
  }

  var state = { type: "love", happy: 0, algo: 0, ctx: "" };

  function starsRow(cls, val, onPick) {
    var wrap = document.createElement("div"); wrap.className = "vfb__stars";
    for (var i = 1; i <= 5; i++) (function (n) {
      var b = document.createElement("div"); b.className = "vfb__star" + (n <= val ? " on" : "");
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.8 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>';
      b.onclick = function () { onPick(n); };
      wrap.appendChild(b);
    })(i);
    return wrap;
  }

  function buildModal() {
    injectCSS();
    var ov = document.createElement("div"); ov.className = "vfb-ov"; ov.id = "vfb-ov";
    ov.innerHTML =
      '<div class="vfb" role="dialog" aria-modal="true" aria-label="Send feedback">' +
        '<h3 id="vfb-title">Tell us what you think</h3>' +
        '<p class="sub" id="vfb-sub">It helps us make Vahini better. This is private, it isn\'t shown on the site.</p>' +
        '<div class="vfb__chips" id="vfb-chips"></div>' +
        '<span class="vfb__lab">How happy are you with Vahini?</span><div id="vfb-happy"></div>' +
        '<span class="vfb__lab">How accurate did the scoring feel?</span><div id="vfb-algo"></div>' +
        '<span class="vfb__lab">Your message</span>' +
        '<textarea id="vfb-msg" placeholder="What worked, what didn\'t, what you\'d love next…"></textarea>' +
        '<div class="vfb__row"><input id="vfb-name" placeholder="Name (optional)"><input id="vfb-email" type="email" placeholder="Email (optional)"></div>' +
        '<div class="vfb__row"><input id="vfb-country" placeholder="City / country (optional)"></div>' +
        '<div class="vfb__act"><button class="vfb__btn vfb__btn--g" id="vfb-cancel">Close</button>' +
        '<button class="vfb__btn vfb__btn--p" id="vfb-send">Send feedback</button></div>' +
      '</div>';
    document.body.appendChild(ov);

    var chips = ov.querySelector("#vfb-chips");
    TYPES.forEach(function (t) {
      var c = document.createElement("button"); c.className = "vfb__chip" + (t.k === state.type ? " on" : "");
      c.textContent = t.label; c.onclick = function () {
        state.type = t.k;
        [].forEach.call(chips.children, function (x) { x.classList.remove("on"); });
        c.classList.add("on");
      };
      chips.appendChild(c);
    });
    function renderStars() {
      var h = ov.querySelector("#vfb-happy"); h.innerHTML = "";
      h.appendChild(starsRow("happy", state.happy, function (n) { state.happy = n; renderStars(); }));
      var a = ov.querySelector("#vfb-algo"); a.innerHTML = "";
      a.appendChild(starsRow("algo", state.algo, function (n) { state.algo = n; renderStars(); }));
    }
    renderStars();

    ov.querySelector("#vfb-cancel").onclick = close;
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.querySelector("#vfb-send").onclick = submit;
    return ov;
  }

  function open(ctx) {
    var ov = document.getElementById("vfb-ov") || buildModal();
    state.ctx = ctx || "";
    if (ctx === "after_pdf") {
      ov.querySelector("#vfb-title").textContent = "Your report is ready 🎉";
      ov.querySelector("#vfb-sub").textContent = "Vahini is free. A few seconds of feedback helps us keep improving it, and leave your email if you'd like us to follow up.";
    }
    ov.classList.add("on");
  }
  function close() { var ov = document.getElementById("vfb-ov"); if (ov) ov.classList.remove("on"); }

  function submit() {
    var ov = document.getElementById("vfb-ov");
    var rec = {
      type: state.type,
      happiness: state.happy,
      algo_rating: state.algo,
      message: (ov.querySelector("#vfb-msg").value || "").trim(),
      name: (ov.querySelector("#vfb-name").value || "").trim(),
      email: (ov.querySelector("#vfb-email").value || "").trim(),
      place: (ov.querySelector("#vfb-country").value || "").trim(),
      context: state.ctx,
      report_id: reportId(),
      profile: read(LS_VISITOR, {})
    };
    var all = read(LS_FEEDBACK, []); all.push({ ts: new Date().toISOString(), rec: rec }); write(LS_FEEDBACK, all.slice(-300));
    send("feedback", rec); // stored locally (localStorage + IndexedDB-style) and POSTed only if an endpoint is configured

    ov.querySelector(".vfb").innerHTML =
      '<div class="vfb__done"><div class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>' +
      '<h3>Thank you 🙏</h3><p class="sub">Your feedback is saved, it genuinely shapes what we build next.</p>' +
      '<div class="vfb__act" style="justify-content:center"><button class="vfb__btn vfb__btn--p" id="vfb-ok">Done</button></div></div>';
    ov.querySelector("#vfb-ok").onclick = function () { close(); setTimeout(function () { var o = document.getElementById("vfb-ov"); if (o) o.remove(); }, 250); };
    state = { type: "love", happy: 0, algo: 0, ctx: "" };
  }

  function exportFeedback(asText) {
    var all = read(LS_FEEDBACK, []);
    var name, type, content;
    if (asText) {
      name = "vahini-feedback.txt"; type = "text/plain";
      content = all.map(function (e, i) {
        var r = e.rec || {};
        return "#" + (i + 1) + "  " + e.ts + "\n" +
          "Type: " + r.type + "   Happiness: " + (r.happiness || "-") + "/5   Accuracy: " + (r.algo_rating || "-") + "/5\n" +
          "Message: " + (r.message || "-") + "\n" +
          "Name: " + (r.name || "-") + "   Email: " + (r.email || "-") + "   Place: " + (r.place || "-") + "\n" +
          "Context: " + (r.context || "-") + "   Report: " + (r.report_id || "-") + "\n";
      }).join("\n----------------------------------------\n");
    } else {
      name = "vahini-feedback.json"; type = "application/json";
      content = JSON.stringify(all, null, 2);
    }
    try {
      var blob = new Blob([content || "(no feedback yet)"], { type: type });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    } catch (e) {}
    return all.length;
  }

  function launcher() {
    if (document.querySelector(".vfb-launch")) return;
    injectCSS();
    var b = document.createElement("button"); b.className = "vfb-launch"; b.setAttribute("aria-label", "Send feedback");
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Feedback';
    b.onclick = function () { open(""); };
    document.body.appendChild(b);
  }

  /* ---------- public API ---------- */
  window.VahiniFeedback = {
    open: open,
    afterPdf: function () { open("after_pdf"); },
    reportId: reportId,
    profile: function () { return read(LS_VISITOR, {}); },
    all: function () { return read(LS_FEEDBACK, []); }, // read every stored submission
    download: function () { return exportFeedback(false); }, // save them as a .json file
    downloadText: function () { return exportFeedback(true); }  // save them as a .txt file
  };

  /* ---------- boot ---------- */
  function boot() {
    try { profile(); send("pageview", { topic: topicOf(), title: document.title }); } catch (e) {}
    try { flush((window.VAHINI_INSIGHTS && window.VAHINI_INSIGHTS.endpoint) || ""); } catch (e) {}
    if (CFG.launcher !== false) launcher();
    // prompt for feedback after a report PDF is produced (Analyser only)
    window.addEventListener("afterprint", function () {
      try {
        if (sessionStorage.getItem("vfb_pdf_done")) return;
        var isReport = /analyser/i.test(location.pathname) || document.getElementById("screen-report");
        if (!isReport) return;
        sessionStorage.setItem("vfb_pdf_done", "1");
        setTimeout(function () { open("after_pdf"); }, 350);
      } catch (e) {}
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
