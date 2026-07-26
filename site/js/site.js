/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved. Dual-IMU sensing: Indian Patent No. 584433.
   Proprietary & confidential. Third-party notices: /THIRD-PARTY-NOTICES.md · SBOM: /sbom.spdx.json */
/* ============================================================
   Vahini, site.js
   Injects the shared nav + footer, wires the mega-menu,
   scroll reveals, sticky-nav state, mobile drawer, and
   smooth page-to-page transitions.
   ============================================================ */
(function () {
  "use strict";

    /* base-aware paths so the SAME nav works from /site pages and from the
      analyser pages in /analyser. */
  var BASE = (document.documentElement.getAttribute("data-site-base") || "");
  function P(h){ return BASE + h; }
    var ANALYSER = (BASE ? "analyser.html" : "../analyser/analyser.html");

  /* ===== FEEDBACK / AUDIENCE ENDPOINT (one place, loads on every page) =====
     Paste your Google Apps Script web-app URL between the quotes to receive
     feedback by email automatically (setup: docs/feedback-email-backend.gs).
     Leave it empty to keep feedback stored locally only. */
  window.VAHINI_INSIGHTS = window.VAHINI_INSIGHTS || {};
  if (!window.VAHINI_INSIGHTS.endpoint) window.VAHINI_INSIGHTS.endpoint = "/persist/feedback";

  /* CANONICAL APPLICATIONS LIST — single source of truth.
     The same six applications appear here (mega menu), on index.html, and on
     investors.html, with identical names + statuses. Apps without a product page
     yet link to the investor roadmap. Keep these in sync across all three. */
  var SOLUTIONS = [
    { href: "solution-handwriting.html", t: "Handwriting Intelligence", d: "20-factor scorecard from one page", pill: "live", pl: "Live" },
    { href: "solution-digitization.html",t: "Digital Notes", d: "Paper notes, digitised in real time", pill: "dev", pl: "In dev" },
    { href: "solution-insights.html", t: "Learning Analytics", d: "Classroom insight from how students write", pill: "pilot", pl: "Pilot" },
    { href: "solution-assistive.html", t: "Motor Assessment", d: "Early motor screening &amp; intervention", pill: "research", pl: "Research" },
    { href: "investor.html", t: "Signature Intelligence", d: "Verify how a signature was written, not just its shape", pill: "next", pl: "Next" },
    { href: "developers.html", t: "Developer SDK", d: "Motion intelligence as an API for partners", pill: "future", pl: "Future" }
  ];
  var PLATFORM = [
    { href: "product.html", t: "The pen, Vahini", d: "Dual-IMU sensing on any paper", pill: "dev", pl: "Pre-order" },
    { href: "benchmarks.html", t: "Specifications & benchmarks", d: "Writing time, charging, memory, measured honestly" },
    { href: "patents.html", t: "Patents & IP", d: "Granted Patent No. 584433" }
  ];
  var COMPANY = [
    { href: "about.html", t: "About", d: "The signal layer beneath handwriting" },
    { href: "awards.html", t: "Awards", d: "DeepTech Innovation Award winner" },
    { href: "patents.html", t: "Patents", d: "Granted IP, No. 584433" },
    { href: "updates.html", t: "Updates", d: "News, awards & recognition" },
    { href: "why-handwriting.html", t: "Why handwriting matters", d: "Live feed: research, news & viral videos" },
    { href: "events.html", t: "Events", d: "Where we\u2019ve shown Vahini" }
  ];
  var RESOURCES = [
    { href: "blog/index.html", t: "Blog", d: "Notes from the handwriting research frontier" },
    { href: "factors.html", t: "The 20 factors", d: "Every factor in plain English" },
    { href: "solution-ocr-vision.html", t: "Free tool: read handwriting", d: "Paste a page, read it back, our Indic OCR demo" },
    { href: "faq.html", t: "Questions & answers", d: "Honest answers about the pen & analyser" },
    { href: "resources.html", t: "All resources", d: "Guides, tools, sample text & downloads" }
  ];

  /* lightweight client-side search index (the site is growing) */
  var ROOT = (BASE ? "static/" : "../analyser/static/");
  var SEARCH = [
    { t:"The analyser", u:ANALYSER, d:"Upload a page, get your 20-factor scorecard", k:"analyse upload scan score report tool" },
    { t:"The 20 factors, explained", u:P("factors.html"), d:"Every factor in plain English", k:"factors score letter formation spacing slant legibility" },
    { t:"Why handwriting matters", u:P("why-handwriting.html"), d:"The research, news & viral videos", k:"brain research cursive memory science feed" },
    { t:"Blog", u:P("blog/index.html"), d:"Research notes & write-ups", k:"blog research posts arxiv reconstruction" },
    { t:"Reconstructing handwriting from motion", u:P("blog/reconstructing-handwriting-from-motion.html"), d:"Blog \u00b7 touching vs hovering", k:"imu reconstruction trajectory mixture experts motion strokes" },
    { t:"Writing without a screen", u:P("blog/writing-without-a-screen.html"), d:"Blog \u00b7 surface-free pens", k:"imu pen surface free cnn drift sensor fusion paper" },
    { t:"Two views of a letter", u:P("blog/two-views-of-a-letter.html"), d:"Blog \u00b7 image + strokes", k:"recognition vlm image stroke ocr fusion online offline" },
    { t:"Handwriting as a health signal", u:P("blog/handwriting-as-a-health-signal.html"), d:"Blog \u00b7 dysgraphia & Parkinson's", k:"dysgraphia parkinson micrographia health motor screening kids" },
    { t:"Reading a hand it has never seen", u:P("blog/reading-a-hand-its-never-seen.html"), d:"Blog \u00b7 domain adaptation", k:"domain adaptation generalise writer covariate shift transfer" },
    { t:"Resources", u:P("resources.html"), d:"Guides, tools & the science", k:"resources guides tools downloads sample practice faq" },
    { t:"Questions & answers (FAQ)", u:P("faq.html"), d:"Honest answers about the pen & analyser", k:"faq questions privacy scripts pen scoring answers help" },
    { t:"Practice sheets", u:ROOT+"vahini-practice-sheet.html", d:"Printable drill sheets", k:"practice sheet drill print ruled exercises" },
    { t:"Handwriting analysis", u:P("solution-handwriting.html"), d:"The market, live today", k:"handwriting analysis solution scorecard exercises market" },
    { t:"OCR & Vision", u:P("solution-ocr-vision.html"), d:"Indic handwriting engine, quality not just text", k:"ocr vision indic handwriting recognition engine quality legibility telugu hindi tamil kannada api dataset licensing" },
    { t:"The Pen (Vahini)", u:P("product.html"), d:"Dual-IMU sensing on any paper", k:"pen vahini hardware imu sensor pre-order" },
    { t:"Specifications & benchmarks", u:P("benchmarks.html"), d:"Writing time, charging, memory, measured honestly", k:"specs specifications benchmarks battery charging writing time memory performance quality speed pressure" },
    { t:"Project Akshara", u:P("project-akshara.html"), d:"The world's first handwriting-motion dataset", k:"akshara dataset schools collection motion corpus indic scripts marathon investors" },
    { t:"Patents & IP", u:P("patents.html"), d:"Granted Patent No. 584433", k:"patents ip granted intellectual property privacy consent dpdp how it works" },
    { t:"About Vahini", u:P("about.html"), d:"How it started, where we are", k:"about story founder origin team" },
    { t:"Investor Book", u:P("investor.html"), d:"The motion-data field notebook", k:"investors funding round roadmap motion data moat deep tech notebook" },
    { t:"Developer SDK & API", u:P("developers.html"), d:"Scan scoring & pen motion as an API", k:"developer sdk api endpoints rest keys metering pricing saas partners integrate motion scan ocr" },
    { t:"See it in Action", u:P("see-in-action.html"), d:"Motion to meaning, live", k:"demo live action motion capture reconstruct score" },
    { t:"Terms of Use", u:P("terms.html"), d:"Rules for using the site & analyser", k:"terms of use conditions legal ip copyright trademark liability governing law" },
    { t:"Privacy statement", u:P("privacy.html"), d:"What we collect, why, and your rights (DPDP)", k:"privacy data protection dpdp gdpr consent cookies rights erase delete grievance" },
    { t:"Reach us", u:P("reach.html"), d:"Partner, invest or say hello", k:"contact reach partner invest email" }
  ];

  function pill(p, label){ return p ? '<span class="pill pill--'+p+'">'+label+'</span>' : ''; }

  function dropLink(c){
    return '<a class="drop__link" href="'+P(c.href)+'" data-nav><span class="drop__t">'+c.t+'</span><span class="drop__d">'+c.d+'</span></a>';
  }

  function buildNav(active){
    var sol = SOLUTIONS.map(function(s){
      return '<a class="mega__link" href="'+P(s.href)+'"><span class="mega__t">'+s.t+' '+pill(s.pill,s.pl)+'</span><span class="mega__d">'+s.d+'</span></a>';
    }).join("");
    var plat = PLATFORM.map(function(s){
      return '<a class="mega__link" href="'+P(s.href)+'"><span class="mega__t">'+s.t+' '+pill(s.pill,s.pl)+'</span><span class="mega__d">'+s.d+'</span></a>';
    }).join("");

    var caret = '<svg class="caret" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    return ''+
    '<header class="nav" id="vt-nav"><div class="nav__in">'+
      '<a class="logo" href="'+P("index.html")+'" data-nav aria-label="Vahini home"><img src="'+P("assets/vahini-logo.png")+'" alt="Vahini"></a>'+
      '<nav class="menu" aria-label="Primary"><ul>'+
        '<li class="has-mega" id="megaLi">'+
          '<button class="navtrig" aria-expanded="false">Applications '+caret+'</button>'+
          '<div class="mega" role="menu"><div class="mega__grid">'+
            '<div><p class="mega__head">Applications</p>'+sol+'</div>'+
            '<div><p class="mega__head">The platform</p>'+plat+'</div>'+
            '<div class="mega__feature"><p class="mega__head">Start here</p>'+
              '<h4>Score your handwriting</h4>'+
              '<p>Upload one handwritten page and get a 20-factor breakdown across five Indic scripts. Live today.</p>'+
              '<a class="btn btn--crimson btn--sm" href="'+ANALYSER+'">Try the live analyser</a>'+
              '<a class="mega__feature-link" href="'+P("factors.html")+'" data-nav style="display:inline-block;margin-top:12px;color:rgba(247,243,232,.82);font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px;">What are the 20 factors? &rarr;</a>'+
              '<p class="mega__note">Patent No. 584433 · DPIIT-recognised</p>'+
            '</div>'+
          '</div></div>'+
        '</li>'+
        navItem("product.html","The Pen",active)+
        navItem("project-akshara.html","Project Akshara",active)+
        '<li class="has-mega has-drop" id="dropResources">'+
          '<button class="navtrig" aria-expanded="false">Resources '+caret+'</button>'+
          '<div class="drop" role="menu">'+RESOURCES.map(dropLink).join("")+'</div>'+
        '</li>'+
        '<li class="has-mega has-drop" id="dropCompany">'+
          '<button class="navtrig" aria-expanded="false">Company '+caret+'</button>'+
          '<div class="drop" role="menu">'+COMPANY.map(dropLink).join("")+'</div>'+
        '</li>'+
        navItem("investor.html","Investor Book",active)+
      '</ul></nav>'+
      '<div class="actions">'+
        '<button class="navsearch" id="navSearch" aria-label="Search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></button>'+
        '<a class="btn btn--ghost btn--sm" href="'+P("see-in-action.html")+'">See it in Action</a>'+
        '<a class="btn btn--crimson btn--sm" href="'+ANALYSER+'">Try the live analyser</a>'+
      '</div>'+
      '<button class="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>'+
    '</div></header>'+
    buildSearch()+
    buildDrawer(sol);
  }

  function navItem(href,label,active){
    var on = active===href ? ' style="color:var(--nv-hot,#C0080B);background:rgba(34,40,49,.06)"' : '';
    return '<li><a class="navlink" href="'+P(href)+'"'+on+' data-nav>'+label+'</a></li>';
  }

  function buildDrawer(sol){
    var solLinks = SOLUTIONS.map(function(s){
      return '<a href="'+P(s.href)+'" data-nav><span>'+s.t+'</span> <span class="pill pill--'+s.pill+'">'+s.pl+'</span></a>';
    }).join("");
    var resLinks = RESOURCES.map(function(c){
      return '<a href="'+P(c.href)+'" data-nav><span>'+c.t+'</span></a>';
    }).join("");
    var compLinks = COMPANY.map(function(c){
      return '<a href="'+P(c.href)+'" data-nav><span>'+c.t+'</span></a>';
    }).join("");
    return '<div class="drawer" id="vt-drawer">'+
      '<details open><summary>Applications</summary>'+solLinks+'</details>'+
      '<a class="d-link" href="'+P("product.html")+'" data-nav>The Pen</a>'+
      '<a class="d-link" href="'+P("project-akshara.html")+'" data-nav>Project Akshara</a>'+
      '<details><summary>Resources</summary>'+resLinks+'</details>'+
      '<details><summary>Company</summary>'+compLinks+'</details>'+
      '<a class="d-link" href="'+P("investor.html")+'" data-nav>Investor Book</a>'+
      '<div class="drawer__actions">'+
        '<a class="btn btn--ghost" href="'+P("see-in-action.html")+'">See it in Action</a>'+
        '<a class="btn btn--crimson" href="'+ANALYSER+'">Try the live analyser</a>'+
      '</div></div>';
  }

  /* ---- site search overlay ---- */
  function buildSearch(){
    return '<div class="vsearch" id="vt-search" hidden>'+
      '<div class="vsearch__panel" role="dialog" aria-label="Search">'+
        '<div class="vsearch__bar">'+
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'+
          '<input id="vt-search-input" type="text" placeholder="Search pages, tools and blog posts\u2026" autocomplete="off">'+
          '<button class="vsearch__esc" id="vt-search-close">Esc</button>'+
        '</div>'+
        '<div class="vsearch__results" id="vt-search-results"></div>'+
      '</div></div>';
  }

  function buildFooter(){
    var sol = SOLUTIONS.map(function(s){ return '<a href="'+P(s.href)+'" data-nav>'+s.t+'</a>'; }).join("") +
      '<a href="'+P("factors.html")+'" data-nav>The 20 factors, explained</a>';
    return '<footer class="foot"><div class="wrap">'+
      '<div class="foot__grid">'+
        '<div class="foot__brand"><b><img src="'+P("assets/vahini-logo.png")+'" alt="">Vahini</b>'+
          '<p>One dual-IMU sensor pen that captures the invisible motion behind every stroke, on ordinary paper. The signal layer beneath handwriting.</p></div>'+
        '<div class="foot__col"><h5>Applications</h5>'+sol+'</div>'+
        '<div class="foot__col"><h5>Company</h5>'+
          '<a href="'+P("product.html")+'" data-nav>The Pen</a>'+
          '<a href="'+P("benchmarks.html")+'" data-nav>Specs & benchmarks</a>'+
          '<a href="'+P("project-akshara.html")+'" data-nav>Project Akshara</a>'+
          '<a href="'+P("about.html")+'" data-nav>About</a>'+
          '<a href="'+P("why-handwriting.html")+'" data-nav>Why handwriting matters</a>'+
          '<a href="'+P("awards.html")+'" data-nav>Awards</a>'+
          '<a href="'+P("patents.html")+'" data-nav>Patents</a>'+
          '<a href="'+P("updates.html")+'" data-nav>Updates</a>'+
          '<a href="'+P("events.html")+'" data-nav>Events</a></div>'+
        '<div class="foot__col"><h5>Get in touch</h5>'+
          '<a href="mailto:info@vahinitech.com">info@vahinitech.com</a>'+
          '<a href="mailto:vahinitechfirm@gmail.com">vahinitechfirm@gmail.com</a>'+
          '<a href="'+P("see-in-action.html")+'">See it in Action</a>'+
          '<div class="foot__social">'+
            socialLink("https://x.com/vahinitech","X (Twitter)",'<path d="M4 4l16 16M20 4L4 20" opacity="0"/><path d="M3 3h4.5l4.2 6 4.8-6H20l-6.7 8.2L21 21h-4.5l-4.5-6.4L6 21H3l7-8.6z"/>')+
            socialLink("https://linkedin.com/company/vahini-technologies","LinkedIn",'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 11v6" fill="none" stroke="var(--ink)" stroke-width="2"/>')+
            socialLink("https://youtube.com/@vahinitech","YouTube",'<rect x="2" y="5" width="20" height="14" rx="4"/><polygon points="10,9 16,12 10,15" fill="var(--ink)"/>')+
            socialLink("https://www.instagram.com/vahini.ai/","Instagram",'<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.3"/>')+
            socialLink("https://www.facebook.com/profile.php?id=61574346226707","Facebook",'<path d="M14 8h2V5h-2.5C11.6 5 10 6.6 10 8.5V11H8v3h2v7h3v-7h2.2l.8-3H13V9c0-.6.4-1 1-1z"/>')+
            socialLink("https://github.com/vahinitech/20factor-analyser","GitHub",'<path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.300000000000004-4.5-1.1-4.5-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.5-1.3.1-2.7 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .6 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.3 4.7-4.5 5 .4.3.7.9.7 1.8v2.6c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/>')+
          '</div>'+
        '</div>'+
      '</div>'+
      '<div class="foot__bot"><span>© 2026 Vahini Technologies · vahinitech.com · <a href="https://github.com/vahinitech/20factor-analyser" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;text-underline-offset:2px;">Open source (AGPL-3.0)</a> · <a href="'+P("licenses.html")+'" data-nav style="color:inherit;text-decoration:underline;text-underline-offset:2px;">Licenses</a> · <a href="'+P("privacy.html")+'" data-nav style="color:inherit;text-decoration:underline;text-underline-offset:2px;">Privacy</a> · <a href="'+P("terms.html")+'" data-nav style="color:inherit;text-decoration:underline;text-underline-offset:2px;">Terms</a> · <a href="#" onclick="VahiniOpenCookieSettings&&VahiniOpenCookieSettings();return false;" style="color:inherit;text-decoration:underline;text-underline-offset:2px;">Cookie settings</a></span>'+
        '<div class="foot__marks"><span>DPIIT-recognised</span><span>Indian Patent No. 584433</span><span>Made in India</span></div>'+
      '</div>'+
    '</div></footer>';
  }

  function socialLink(href, label, inner){
    return '<a class="foot__soc" href="'+href+'" target="_blank" rel="noopener" aria-label="'+label+'" title="'+label+'">'+
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'+inner+'</svg></a>';
  }

  /* Declared ahead of injectHead()/wireConsent() (which both read these) so
     there's no doubt they're initialized before use -- they're plain `var`s
     in this IIFE's top-level scope, but keeping the declaration textually
     before its first read avoids relying on execution-order reasoning. */
  var CONSENT_KEY = "vahini_consent";
  var CONSENT_LOG = "vahini_consent_log";
  var CONSENT_VERSION = 1;

  /* ---- inject favicons + analytics into <head>, once, on every page ---- */
  function injectHead(){
    if (document.getElementById("vt-head-meta")) return;
    var head = document.head, P2 = P;
    var add = function(html){ var t=document.createElement("template"); t.innerHTML=html.trim(); head.appendChild(t.content.cloneNode(true)); };
    var marker = document.createElement("meta"); marker.id="vt-head-meta"; head.appendChild(marker);
    add('<link rel="icon" type="image/png" sizes="32x32" href="'+P2("assets/favicon-32x32.png")+'">');
    add('<link rel="icon" type="image/png" sizes="16x16" href="'+P2("assets/favicon-16x16.png")+'">');
    add('<link rel="shortcut icon" href="'+P2("assets/favicon.ico")+'">');
    add('<link rel="apple-touch-icon" sizes="180x180" href="'+P2("assets/apple-touch-icon.png")+'">');
    add('<meta name="theme-color" content="#00ADB5">');
    if (!document.querySelector('meta[property="og:site_name"]')){
      add('<meta property="og:site_name" content="Vahini Technologies">');
      add('<meta property="og:type" content="website">');
      add('<meta name="twitter:card" content="summary_large_image">');
      add('<meta name="twitter:site" content="@vahinitech">');
    }
    /* per-post SEO: match current page to a blog post and inject its keywords + Open Graph */
    var here = decodeURIComponent(location.pathname.split("/").pop() || "");
    var post = (window.VahiniPosts || []).filter(function(p){ return p.url === here; })[0];
    if (post){
      var kw = (window.VahiniPostKW && window.VahiniPostKW[post.slug]) || "";
      if (kw) add('<meta name="keywords" content="'+kw.replace(/"/g,"&quot;")+'">');
      var ttl = post.title.replace(/"/g,"&quot;"), exc = post.excerpt.replace(/"/g,"&quot;");
      add('<meta property="og:title" content="'+ttl+'">');
      add('<meta property="og:description" content="'+exc+'">');
      add('<meta property="og:url" content="'+location.href.split("#")[0]+'">');
      add('<meta name="twitter:title" content="'+ttl+'">');
      add('<meta name="twitter:description" content="'+exc+'">');
      add('<meta name="author" content="'+(post.author||"Vahini Technologies")+'">');
    }
    /* Analytics uses Google Consent Mode v2, ADVANCED mode (GDPR/CCPA): the
       GTM/GA4 libraries load on every visit, but consent defaults to denied,
       so they run cookieless -- no identifiers, no ad signals -- until the
       visitor opts in via the cookie banner. Loading them unconditionally
       (vs. withholding the script entirely) lets Google send anonymous
       consent-mode pings for visitors who never opt in, which GA4 uses to
       model that traffic instead of reporting it as zero. See wireConsent()
       and grantAnalyticsConsent()/denyAnalyticsConsent(), which flip
       analytics_storage after the initial default set below. */
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
    /* A later consent 'update' only affects hits gtag.js processes AFTER it,
       not the 'config' hit queued just below -- so a returning visitor who
       already opted in needs analytics_storage GRANTED in this very default,
       not granted via a follow-up update from wireConsent(). */
    var priorAnalytics = false;
    try { var pc = JSON.parse(localStorage.getItem(CONSENT_KEY)); priorAnalytics = !!(pc && pc.v === CONSENT_VERSION && pc.analytics); } catch(e){}
    window.gtag('consent', 'default', {
      ad_storage:'denied', analytics_storage: priorAnalytics ? 'granted' : 'denied',
      ad_user_data:'denied', ad_personalization:'denied'
    });
    /* Google Tag Manager -- appended straight to head (this runs from
       injectHead()), rather than the stock snippet's insertBefore-the-first-
       script-tag, which would land in <body> on pages that load site.js there. */
    (function(w,d,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var j=d.createElement('script'),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;d.head.appendChild(j);})(window,document,'dataLayer','GTM-52M7T5DJ');
    /* Google Analytics 4 */
    var ga=document.createElement('script'); ga.async=true; ga.src='https://www.googletagmanager.com/gtag/js?id=G-8FV4KRMPX8'; document.head.appendChild(ga);
    window.gtag('js', new Date()); window.gtag('config','G-8FV4KRMPX8', { anonymize_ip:true });
  }

  /* ---- cookie consent (GDPR / CCPA) ---------------------------------------
     GTM/GA4 load on every page (see injectHead(), Advanced Consent Mode) but
     stay cookieless/denied until explicit consent flips analytics_storage to
     granted. The choice is stored, and every decision is appended to an
     audit log. */
  var analyticsGranted = false;

  function getConsent(){
    try { var c = JSON.parse(localStorage.getItem(CONSENT_KEY)); return (c && c.v===CONSENT_VERSION) ? c : null; }
    catch(e){ return null; }
  }
  function logConsent(decision, analytics){
    try {
      var log = JSON.parse(localStorage.getItem(CONSENT_LOG) || "[]");
      log.push({ decision:decision, analytics:!!analytics, ts:new Date().toISOString(), v:CONSENT_VERSION, ua:navigator.userAgent, url:location.href.split("#")[0] });
      localStorage.setItem(CONSENT_LOG, JSON.stringify(log.slice(-50)));
    } catch(e){}
  }
  function saveConsent(decision, analytics){
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ v:CONSENT_VERSION, decision:decision, analytics:!!analytics, ts:Date.now() })); } catch(e){}
    logConsent(decision, analytics);
  }
  /* GTM/GA4 are already loaded on every visit (see injectHead()) -- these
     just flip Consent Mode between denied and granted, unlocking or
     re-blocking cookies/identifiers. Both are idempotent against the
     current known state, so re-clicking a button is a harmless no-op. */
  function grantAnalyticsConsent(){
    if (analyticsGranted) return; analyticsGranted = true;
    if (window.gtag) window.gtag('consent','update',{ analytics_storage:'granted' });
  }
  function denyAnalyticsConsent(){
    if (!analyticsGranted) return; analyticsGranted = false;
    if (window.gtag) window.gtag('consent','update',{ analytics_storage:'denied' });
  }

  function wireConsent(){
    var prior = getConsent();
    if (prior && prior.analytics) grantAnalyticsConsent();   // returning visitor who opted in (matches the default injectHead() already set)

    var esc = function(s){ return String(s); };
    var banner = document.createElement('div');
    banner.className = 'cc'; banner.id = 'vt-cc';
    banner.setAttribute('role','dialog');
    banner.setAttribute('aria-label','Cookie consent');
    banner.innerHTML =
      '<div class="cc__main">'+
        '<div class="cc__txt">'+
          '<b>We value your privacy</b>'+
          '<p>We use essential cookies to make this site work. With your consent we also use analytics cookies to understand how the site is used. Non-essential cookies stay <b>off</b> until you choose. See our approach in the <a href="'+P("faq.html")+'" data-nav>FAQ</a>.</p>'+
        '</div>'+
        '<div class="cc__btns">'+
          '<button class="cc__b cc__b--ghost" id="cc-prefs">Preferences</button>'+
          '<button class="cc__b cc__b--ghost" id="cc-reject">Reject non-essential</button>'+
          '<button class="cc__b cc__b--solid" id="cc-accept">Accept all</button>'+
        '</div>'+
      '</div>'+
      '<div class="cc__panel" id="cc-panel" hidden>'+
        '<div class="cc__row">'+
          '<div><b>Strictly necessary</b><span>Required for the site to function (navigation, security, your saved preferences). Always on.</span></div>'+
          '<span class="cc__lock">Always on</span>'+
        '</div>'+
        '<div class="cc__row">'+
          '<div><b>Analytics</b><span>Google Analytics, helps us see which pages are useful. Anonymised, never sold.</span></div>'+
          '<label class="cc__sw"><input type="checkbox" id="cc-analytics"><span class="cc__track"></span></label>'+
        '</div>'+
        '<div class="cc__panelbtns">'+
          '<button class="cc__b cc__b--solid" id="cc-save">Save preferences</button>'+
        '</div>'+
      '</div>';
    document.body.appendChild(banner);

    var panel = banner.querySelector('#cc-panel');
    var toggle = banner.querySelector('#cc-analytics');
    if (prior) toggle.checked = !!prior.analytics;

    function close(){ banner.classList.add('cc--gone'); document.body.classList.remove('cc-open'); setTimeout(function(){ banner.remove(); }, 320); }

    banner.querySelector('#cc-accept').addEventListener('click', function(){ saveConsent('accept_all', true); grantAnalyticsConsent(); close(); });
    banner.querySelector('#cc-reject').addEventListener('click', function(){ saveConsent('reject_non_essential', false); denyAnalyticsConsent(); close(); });
    banner.querySelector('#cc-prefs').addEventListener('click', function(){ panel.hidden = !panel.hidden; });
    banner.querySelector('#cc-save').addEventListener('click', function(){
      var a = toggle.checked; saveConsent('custom', a); if (a) grantAnalyticsConsent(); else denyAnalyticsConsent(); close();
    });

    // only auto-show the banner if no prior decision exists
    if (prior) banner.style.display = 'none';
    else document.body.classList.add('cc-open');

    // let a "Cookie settings" footer link reopen it anytime
    window.VahiniOpenCookieSettings = function(){
      var b = document.getElementById('vt-cc');
      if (b){ b.style.display=''; b.classList.remove('cc--gone'); document.body.classList.add('cc-open'); var pp=b.querySelector('#cc-panel'); if(pp) pp.hidden=false; }
      else wireConsent();
    };
  }

  /* ---- inject ---- */
  function inject(){
    injectHead();
    var active = decodeURIComponent(location.pathname.split("/").pop() || "index.html");
    var navHost = document.getElementById("site-nav");
    var footHost = document.getElementById("site-footer");
    if (navHost) navHost.innerHTML = buildNav(active);
    if (footHost) footHost.innerHTML = buildFooter();
    wire();
  }

  function wire(){
    var nav = document.getElementById("vt-nav");

    /* sticky state */
    var onScroll = function(){ if(nav) nav.classList.toggle("scrolled", window.scrollY > 8); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive:true });

    /* dropdown menus: hover (desktop) + click, works for mega AND simple drops */
    var hoverCapable = window.matchMedia("(hover:hover)").matches;
    var dropLis = [].slice.call(document.querySelectorAll("#vt-nav .has-mega"));
    dropLis.forEach(function(li){
      var trig = li.querySelector(".navtrig");
      if (!trig) return;
      var closeT;
      function open(){
        clearTimeout(closeT);
        dropLis.forEach(function(o){ if(o!==li){ o.classList.remove("open"); var t=o.querySelector(".navtrig"); if(t) t.setAttribute("aria-expanded","false"); } });
        li.classList.add("open"); trig.setAttribute("aria-expanded","true");
      }
      function close(){ li.classList.remove("open"); trig.setAttribute("aria-expanded","false"); }
      if (hoverCapable){
        li.addEventListener("mouseenter", open);
        li.addEventListener("mouseleave", function(){ closeT = setTimeout(close, 120); });
      }
      trig.addEventListener("click", function(e){ e.stopPropagation(); li.classList.contains("open") ? close() : open(); });
      li._close = close;
    });
    document.addEventListener("click", function(e){ dropLis.forEach(function(li){ if(!li.contains(e.target)) li._close && li._close(); }); });
    document.addEventListener("keydown", function(e){ if(e.key==="Escape") dropLis.forEach(function(li){ li._close && li._close(); }); });

    /* mobile drawer */
    var burger = document.querySelector(".burger");
    var drawer = document.getElementById("vt-drawer");
    if (burger && drawer){
      burger.addEventListener("click", function(){
        var o = burger.getAttribute("aria-expanded")==="true";
        burger.setAttribute("aria-expanded", String(!o));
        drawer.classList.toggle("open", !o);
        document.body.style.overflow = o ? "" : "hidden";
      });
    }

    /* scroll reveals */
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold:0.12, rootMargin:"0px 0px -8% 0px" });
    function scan(){ document.querySelectorAll(".reveal:not(.in)").forEach(function(el){ io.observe(el); }); }
    scan();
    // let pages that inject content after load re-arm the observer
    window.VahiniRevealScan = scan;

    wireSearch();
    wireShare();
    wireConsent();
    /* first-party audience profile + private feedback widget (path-aware) */
    try { var vi = document.createElement("script"); vi.src = P("js/vahini-insights.js"); vi.async = true; document.body.appendChild(vi); } catch (e) {}

    /* page transitions */
    setupTransitions();
  }

  /* ---- share bar: auto-injected into any blog post (has article .post-meta) ---- */
  function wireShare(){
    var meta = document.querySelector("article .post-meta");
    if(!meta || document.querySelector(".post-share")) return;
    var url = location.href.split("#")[0];
    var title = (document.title||"Vahini").replace(/\s*\|.*$/,"").trim();
    var u = encodeURIComponent(url), t = encodeURIComponent(title);
    var L = [
      ["X","https://twitter.com/intent/tweet?url="+u+"&text="+t,'<path d="M3 3h4.5l4.2 6 4.8-6H20l-6.7 8.2L21 21h-4.5l-4.5-6.4L6 21H3l7-8.6z"/>'],
      ["LinkedIn","https://www.linkedin.com/sharing/share-offsite/?url="+u,'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 11v6" fill="none" stroke="#fff" stroke-width="2"/>'],
      ["Facebook","https://www.facebook.com/sharer/sharer.php?u="+u,'<path d="M14 8h2V5h-2.5C11.6 5 10 6.6 10 8.5V11H8v3h2v7h3v-7h2.2l.8-3H13V9c0-.6.4-1 1-1z"/>'],
      ["WhatsApp","https://wa.me/?text="+t+"%20"+u,'<path d="M12 2a9.5 9.5 0 0 0-8.1 14.5L2.5 21.5l5.2-1.3A9.5 9.5 0 1 0 12 2zm0 2a7.5 7.5 0 1 1-3.9 13.9l-.4-.2-2.6.7.7-2.5-.2-.4A7.5 7.5 0 0 1 12 4z"/><path d="M9.3 7.8c-.2 0-.5 0-.7.3-.3.3-.9.9-.9 2.1 0 1.2.9 2.4 1 2.6.1.2 1.7 2.7 4.2 3.6 2 .8 2.5.7 2.9.6.4-.1 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1 0-.1-.2-.2-.5-.3l-1.6-.8c-.2-.1-.4-.1-.6.1l-.6.8c-.1.1-.3.2-.5.1-.7-.3-1.5-.7-2.1-1.6-.2-.3 0-.4.1-.6l.4-.6c.1-.2 0-.4 0-.5l-.7-1.7c-.2-.4-.4-.4-.6-.4z"/>']
    ];
    var btns = L.map(function(x){ return '<a class="ps-btn" href="'+x[1]+'" target="_blank" rel="noopener" aria-label="Share on '+x[0]+'" title="Share on '+x[0]+'"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'+x[2]+'</svg></a>'; }).join("");
    var copyBtn = '<button class="ps-btn ps-copy" aria-label="Copy link" title="Copy link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg></button>';
    var bar = document.createElement("div");
    bar.className = "post-share";
    bar.innerHTML = '<span class="ps-label">Share</span>'+btns+copyBtn;
    meta.parentNode.insertBefore(bar, meta.nextSibling);
    var copy = bar.querySelector(".ps-copy");
    if(copy) copy.addEventListener("click", function(){
      try{ navigator.clipboard.writeText(url); }catch(e){}
      copy.classList.add("done"); setTimeout(function(){ copy.classList.remove("done"); }, 1400);
    });
  }

  /* ---- search overlay behaviour ---- */
  function wireSearch(){
    var btn = document.getElementById("navSearch");
    var box = document.getElementById("vt-search");
    var input = document.getElementById("vt-search-input");
    var results = document.getElementById("vt-search-results");
    var closeB = document.getElementById("vt-search-close");
    if(!btn || !box || !input || !results) return;
    var esc = function(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };

    function render(q){
      q = (q||"").trim().toLowerCase();
      var list;
      if(!q){ list = SEARCH.slice(0,7); }
      else {
        var terms = q.split(/\s+/);
        list = SEARCH.map(function(it){
          var hay = (it.t+" "+it.d+" "+it.k).toLowerCase();
          var score = 0;
          terms.forEach(function(t){
            if(it.t.toLowerCase().indexOf(t)>-1) score += 5;
            else if(hay.indexOf(t)>-1) score += 2;
          });
          return { it:it, s:score };
        }).filter(function(r){ return r.s>0; }).sort(function(a,b){ return b.s-a.s; }).map(function(r){ return r.it; });
      }
      if(!list.length){ results.innerHTML = '<p class="vsearch__empty">No matches. Try \u201cfactors\u201d, \u201cpen\u201d, \u201cblog\u201d or \u201cFAQ\u201d.</p>'; return; }
      results.innerHTML = list.map(function(it){
        return '<a class="vsearch__hit" href="'+it.u+'"><span class="vh-t">'+esc(it.t)+'</span><span class="vh-d">'+esc(it.d)+'</span></a>';
      }).join("");
    }
    function open(){ box.hidden=false; document.body.style.overflow="hidden"; render(""); setTimeout(function(){ input.focus(); }, 30); }
    function close(){ box.hidden=true; document.body.style.overflow=""; input.value=""; }
    btn.addEventListener("click", open);
    if(closeB) closeB.addEventListener("click", close);
    input.addEventListener("input", function(){ render(input.value); });
    box.addEventListener("click", function(e){ if(e.target===box) close(); });
    document.addEventListener("keydown", function(e){
      if(e.key==="/" && box.hidden && !/INPUT|TEXTAREA/.test((e.target.tagName||""))){ e.preventDefault(); open(); }
      else if(e.key==="Escape" && !box.hidden){ close(); }
    });
  }

  function setupTransitions(){
    document.body.classList.remove("booting");

    document.addEventListener("click", function(e){
      var a = e.target.closest && e.target.closest("a");
      if(!a) return;
      var href = a.getAttribute("href") || "";
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (href.indexOf("#")===0 || href.indexOf("mailto:")===0 || href.indexOf("tel:")===0) return;
      if (/^https?:\/\//i.test(href)) return; // external
      if (!/\.html(\?|#|$)/i.test(href)) return;
      e.preventDefault();
      var cover = document.createElement("div");
      cover.className = "veil cover";
      document.body.appendChild(cover);
      setTimeout(function(){ window.location.href = href; }, 230);
    });

    // never let a cover veil survive a back/forward restore
    window.addEventListener("pageshow", function(){
      document.querySelectorAll(".veil").forEach(function(v){ v.remove(); });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
  else inject();
})();
