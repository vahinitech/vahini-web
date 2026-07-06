/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved. Dual-IMU sensing: Indian Patent No. 584433.
   Proprietary & confidential. Third-party notices: /THIRD-PARTY-NOTICES.md · SBOM: /sbom.spdx.json */
/* ============================================================
   Vahini — theme.config.js   ·   PICK YOUR WEBSITE THEME HERE
   ------------------------------------------------------------
   Change ONE line below to recolour the entire website.
   Options (defined in theme.css):
       "space-teal"        — default Vahini brand (teal on slate)
       "midnight-indigo"   — cooler, premium indigo
       "forest-emerald"    — grounded natural green
       "ember-charcoal"    — warm bold terracotta
   ============================================================ */

window.VAHINI_THEME = {
  ACTIVE_THEME: "space-teal"
};

/* applied before paint — no flash of the wrong colour */
(function () {
  try {
    var t = (window.VAHINI_THEME && window.VAHINI_THEME.ACTIVE_THEME) || "space-teal";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
