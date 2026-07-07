/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved. Dual-IMU sensing: Indian Patent No. 584433.
   Proprietary & confidential. Third-party notices: /THIRD-PARTY-NOTICES.md · SBOM: /sbom.spdx.json */
/* ============================================================
   Vahini, hero-imu.js
   Kinetic typography for the index hero's signal ticker
   (#imuWord in the flywheel hero): the word after "The pen is
   reading your …" cycles through the signals the dual-IMU pen
   captures, each swapped with a per-character GSAP stagger.
   Falls back to static "MOTION" without GSAP or with
   prefers-reduced-motion. Styles: css/platform-hero.css
   (.pf__ticker / .pf__ticker-word / .ch).
   ============================================================ */
(function () {
  "use strict";

  var WORDS = ["MOTION", "RHYTHM", "PRESSURE", "TILT", "VELOCITY", "INTENT"];

  function init() {
    var el = document.getElementById("imuWord");
    if (!el) return;
    var G = window.gsap;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!G || reduce) { el.textContent = WORDS[0]; return; }

    var i = 0;
    function paint(word) {
      el.innerHTML = "";
      for (var c = 0; c < word.length; c++) {
        var s = document.createElement("span");
        s.className = "ch";
        s.textContent = word[c];
        el.appendChild(s);
      }
      return el.querySelectorAll(".ch");
    }

    // intro
    var chars = paint(WORDS[0]);
    G.from(chars, { yPercent: 110, opacity: 0, duration: 0.55, ease: "back.out(1.7)", stagger: 0.04 });

    function cycle() {
      var outChars = el.querySelectorAll(".ch");
      G.to(outChars, {
        yPercent: -110, opacity: 0, duration: 0.4, ease: "power2.in", stagger: 0.03,
        onComplete: function () {
          i = (i + 1) % WORDS.length;
          var next = paint(WORDS[i]);
          // tint alternates for a little life (teal ↔ ink)
          el.style.color = (i % 2) ? "var(--accent-deep)" : "var(--ink)";
          G.from(next, { yPercent: 110, opacity: 0, duration: 0.5, ease: "back.out(1.7)", stagger: 0.04 });
        }
      });
    }
    var loop = setInterval(cycle, 2200);
    window.addEventListener("pagehide", function () { clearInterval(loop); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
