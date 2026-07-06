/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved. Dual-IMU sensing: Indian Patent No. 584433.
   Proprietary & confidential. Third-party notices: /THIRD-PARTY-NOTICES.md · SBOM: /sbom.spdx.json */
/* ============================================================
   Vahini, site-data.js
   SINGLE SOURCE OF TRUTH for everything that appears on the
   Events page, the Updates feed, and the homepage highlights.

   ▸ To POST a new update/achievement: add one object to
     VAHINI_UPDATES (newest first is fine, they're sorted by
     `sort`). It appears automatically on Updates AND the
     homepage "Latest from Vahini" section.
   ▸ To ADD an event: add one object to VAHINI_EVENTS. It shows
     on the Events page and (as a news item) in the feed.

   `sort` = YYYYMMDD number, just for ordering (higher = newer).
   `cat`  = announcement | recognition | award | news | blog
   ============================================================ */
(function (root) {
  "use strict";

  var EVENTS = [
    { id:"ev-mrhub", date:"13 Jun 2026", sort:20260613, place:"MRHUB · Malla Reddy",
      title:"MRHUB, Malla Reddy visit",
      present:"A hands-on walkthrough of the Vahini dual-IMU pen and the live 20-factor analyser, showing how motion on ordinary paper becomes an actionable handwriting report.",
      response:"Strong interest from the academic and incubation team in pilots and student-facing use of the analyser. Follow-up conversations opened on collaboration.",
      photos:[ "assets/events/mrhub-01.jpg" ] },

    { id:"ev-iit", date:"21 Feb 2026", sort:20260221, place:"IIT Hyderabad",
      title:"IIT Hyderabad, MSME event",
      present:"Demonstrated the sensing technology and the patent-backed approach to a technical audience, with a live capture of pen motion translated into stroke metrics.",
      response:"Encouraging feedback from researchers on the dual-IMU method and the consent-first motion dataset, with interest in research collaboration.",
      photos:[
        "assets/events/iit-01.jpg","assets/events/iit-02.jpg","assets/events/iit-03.jpg",
        "assets/events/iit-04.jpg","assets/events/iit-05.jpg","assets/events/iit-06.jpg",
        "assets/events/iit-07.jpg","assets/events/iit-08.jpg","assets/events/iit-09.jpg",
        "assets/events/iit-10.jpg","assets/events/iit-11.jpg","assets/events/iit-12.jpg"
      ] },

    { id:"ev-thub", date:"04 Jan 2026", sort:20260104, place:"T-Hub · TGIC",
      title:"T-Hub, TGIC's ATS 6.0",
      present:"Showcased Vahini at the Annual Tech Summit (Assistive Technology Summit), pitching the pen-as-platform vision and running the analyser live for founders, mentors and the startup ecosystem.",
      response:"Productive conversations with mentors and potential partners around go-to-market and pilots; valuable visibility within the Telangana startup network.",
      photos:[
        "assets/events/thub-01.jpg","assets/events/thub-02.jpg","assets/events/thub-03.jpg",
        "assets/events/thub-04.jpg","assets/events/thub-05.jpg","assets/events/thub-06.jpg"
      ] },

    { id:"ev-msme", date:"May 2025", sort:20250515, place:"ni-msme · Hyderabad",
      title:"MSME Hyderabad",
      present:"Presented the Vahini pen and analyser at ni-msme, Hyderabad, including a stall visit from the Honourable Minister and officials, who saw the dual-IMU pen and live handwriting analysis first-hand.",
      response:"Strong validation from the MSME community and visiting dignitaries, with encouraging interest in the technology and the road ahead.",
      photos:[
        "assets/events/msme-01.jpg","assets/events/msme-02.jpg","assets/events/msme-03.jpg",
        "assets/events/msme-04.jpg","assets/events/msme-05.jpg","assets/events/msme-06.jpg",
        "assets/events/msme-07.jpg","assets/events/msme-08.jpg","assets/events/msme-09.jpg",
        "assets/events/msme-10.jpg","assets/events/msme-11.jpg"
      ] }
  ];

  var UPDATES = [
    { sort:20260110, dateLabel:"Jan 2026", cat:"award", title:"Winner, DeepTech Innovation Award", pinned:true,
      blurb:"Vahini won the DeepTech Innovation Award at the Andhra Pradesh Digital Technology Summit 2026, Visakhapatnam, for outstanding innovation & excellence.",
      href:"awards.html", linkText:"See the award" },
    { sort:20260613, dateLabel:"Jun 2026", cat:"news", title:"Presented at MRHUB, Malla Reddy",
      blurb:"We demoed the dual-IMU pen and the live analyser to the academic and incubation team, opening pilot conversations.",
      href:"events.html", linkText:"All events" },

    { sort:20260221, dateLabel:"Feb 2026", cat:"news", title:"IIT Hyderabad MSME event",
      blurb:"Shared the sensing technology and patent-backed approach with a technical audience, with interest in research collaboration.",
      href:"events.html", linkText:"All events" },

    { sort:20260104, dateLabel:"Jan 2026", cat:"news", title:"T-Hub TGIC's ATS 6.0",
      blurb:"Showcased the pen-as-platform vision at the Annual Tech Summit to founders, mentors and the startup ecosystem.",
      href:"events.html", linkText:"All events" },

    { sort:20260101, dateLabel:"Open", cat:"announcement", title:"Pen pre-orders are open", pinned:true,
      blurb:"Reserve early units of the Vahini sensor pen and help fund the build. Pre-order holders hear about milestones first.",
      href:"reach.html", linkText:"Pre-order" },

    { sort:20250901, dateLabel:"2025", cat:"announcement", title:"Indian Patent No. 584433 granted", pinned:true,
      blurb:"Our core dual-IMU sensing method is now covered by a granted Indian patent, defensible IP at the hardware and signal layer.",
      href:"patents.html", linkText:"See the patent" },

    { sort:20250801, dateLabel:"2025", cat:"recognition", title:"DPIIT recognition for Vahini",
      blurb:"Vahini is recognised as a startup under the Department for Promotion of Industry and Internal Trade, credibility for partners and institutions.",
      href:"patents.html", linkText:"Our IP" },

    { sort:20250601, dateLabel:"Research note", cat:"blog", title:"Why the pen sees what the camera can't",
      blurb:"A short note on why the motion behind a stroke, speed, pressure, hesitation, carries signal a photo of the finished page cannot." },

    { sort:20250501, dateLabel:"Research note", cat:"blog", title:"Building a consent-first motion dataset",
      blurb:"How we're gathering handwriting-motion data across five Indic scripts the right way, with explicit consent and zero image retention." },

    { sort:20250515, dateLabel:"May 2025", cat:"news", title:"MSME Hyderabad, Minister visit",
      blurb:"Presented at ni-msme Hyderabad with a stall visit from the Honourable Minister and officials, who saw the pen and live analysis first-hand.",
      href:"events.html", linkText:"All events" }
  ];

  // headline achievements shown as a stat strip
  var ACHIEVEMENTS = [
    { v:"Winner", k:"DeepTech Innovation Award '26", href:"awards.html" },
    { v:"584433", k:"Indian Patent, granted IP", href:"patents.html" },
    { v:"DPIIT", k:"Recognised startup", href:"patents.html" },
    { v:"Live", k:"20-factor analyser, free to try", href:"updates.html" }
  ];

  var CAT_LABEL = { announcement:"Announcement", recognition:"Recognition", award:"Award", news:"News", blog:"Blog" };

  function bySort(a,b){ return b.sort - a.sort; }

  root.VahiniData = {
    events: EVENTS.slice().sort(bySort),
    updates: UPDATES.slice().sort(bySort),
    achievements: ACHIEVEMENTS,
    catLabel: CAT_LABEL,
    // most recent N updates (for the homepage list)
    latest: function (n) { return UPDATES.slice().sort(bySort).slice(0, n || 5); },
    // the single highlight card: a pinned item if present, else newest
    featured: function () {
      var pinned = UPDATES.filter(function (u) { return u.pinned; }).sort(bySort);
      return (pinned[0] || UPDATES.slice().sort(bySort)[0]);
    }
  };
})(window);
