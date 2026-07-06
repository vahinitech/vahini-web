/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved. Dual-IMU sensing: Indian Patent No. 584433.
   Proprietary & confidential. Third-party notices: /THIRD-PARTY-NOTICES.md · SBOM: /sbom.spdx.json */
/* ============================================================
   Vahini, blog-data.js
   Single source of truth for blog posts (index, read-next, search).
   Newest first. Each post is a standalone page in /site.
   ============================================================ */
(function (global) {
  "use strict";

  global.VahiniPosts = [
    {
      slug: "history-of-20-factors",
      url: "blog-history-of-20-factors.html",
      cat: "explainer",
      title: "A short, honest history of the 20 handwriting factors (and how computer vision measures each one)",
      date: "Jul 2026", read: "12 min read", author: "Malli Kosuri",
      excerpt: "Where handwriting analysis really comes from, why the personality-reading claims of old graphology don't hold up, and how Vahini's 20 measurable quality factors are detected by computer vision, with an example and a practice tip for every one."
    },
    {
      slug: "how-vahini-reads-handwriting",
      url: "blog-how-vahini-reads-handwriting.html",
      cat: "technology",
      title: "How Vahini reads handwriting: from a photo to a 20-factor report",
      date: "Jun 2026", read: "7 min read", author: "Malli Kosuri",
      excerpt: "A plain-language tour of how Vahini turns one photo of handwriting into twenty quality scores and a coaching plan, finding the writing, measuring the factors, reading the words, and building the report."
    },
    {
      slug: "ai-detecting-learning-disabilities",
      url: "blog-ai-detecting-learning-disabilities.html",
      cat: "health",
      title: "How AI is learning to spot learning disabilities early",
      date: "Jun 2026", read: "8 min read", author: "Vishnu Kosuri",
      excerpt: "Neural networks now flag dyslexia, dysgraphia and dyspraxia from reading patterns, handwriting and motor coordination. Here is how the models work, and where Battu's motion signal fits."
    },
    {
      slug: "battu-and-autism",
      url: "blog-battu-and-autism.html",
      cat: "health",
      title: "How Battu can support autistic students who write",
      date: "Jun 2026", read: "7 min read", author: "Malli Kosuri",
      excerpt: "For many autistic students, handwriting carries hidden motor and sensory load. A dual-IMU pen that measures pressure, rhythm and effort can make that load visible, and support gentler, calmer practice."
    },
    {
      slug: "startup-pitch-deck-guide",
      url: "blog-startup-pitch-deck-guide.html",
      cat: "explainer",
      title: "The startup pitch deck guide (with a free template)",
      date: "Jun 2026", read: "8 min read", author: "Vishnu Kosuri",
      excerpt: "What actually goes into a deck that gets a meeting, the 11 slides investors expect, how we framed Vahini's, and a free downloadable pitch-deck guideline plus a sample Startup India Seed Fund application."
    },
    {
      slug: "one-imu-or-two",
      url: "blog-one-imu-or-two.html",
      cat: "technology",
      title: "One IMU or two? Why dual-IMU sensing is more accurate",
      date: "Jun 2026", read: "6 min read", author: "Malli Kosuri",
      excerpt: "A single inertial unit can't tell a tilt from a slide. Putting two IMUs in one pen, at different points along the barrel, resolves the ambiguity and sharpens every downstream factor."
    },
    {
      slug: "reading-pressure",
      url: "blog-reading-pressure.html",
      cat: "signals",
      title: "Reading pressure from an analog force sensor",
      date: "Jun 2026", read: "6 min read", author: "Vishnu Kosuri",
      excerpt: "A force sensor gives a single wavering voltage. Turning it into a clean, calibrated pressure signal, and learning what heavy and light pressure say about control, is real signal work."
    },
    {
      slug: "reading-tilt",
      url: "blog-reading-tilt.html",
      cat: "signals",
      title: "Reading pen tilt from an IMU",
      date: "Jun 2026", read: "6 min read", author: "Malli Kosuri",
      excerpt: "Gravity is always pointing down. By reading how it splits across an IMU's axes, and fusing gyroscope data to fight drift, the pen knows exactly how it's being held."
    },
    {
      slug: "velocity-signal",
      url: "blog-velocity-signal.html",
      cat: "signals",
      title: "Velocity: the speed signal inside every stroke",
      date: "Jun 2026", read: "5 min read", author: "Vishnu Kosuri",
      excerpt: "Fluent writing has a velocity fingerprint, fast on the straights, slowing into the curves. How the pen recovers speed from acceleration, and why it matters for complex Indic letters."
    },
    {
      slug: "motion-to-strokes",
      url: "blog-motion-to-strokes.html",
      cat: "signals",
      title: "Motion: turning movement into strokes",
      date: "Jun 2026", read: "6 min read", author: "Malli Kosuri",
      excerpt: "Motion is the master signal the others ride on. How the pen reconstructs the path of the tip from raw inertial data, and renders the conjuncts of Indic scripts faithfully."
    },
    {
      slug: "rhythm-of-writing",
      url: "blog-rhythm-of-writing.html",
      cat: "signals",
      title: "Rhythm: the music of fluent handwriting",
      date: "Jun 2026", read: "5 min read", author: "Vishnu Kosuri",
      excerpt: "Skilled writing is rhythmic, a steady beat of strokes and pauses. How the pen measures that tempo, and why rhythm is one of the clearest signs of a confident hand."
    },
    {
      slug: "intent-pen-up-down",
      url: "blog-intent-pen-up-down.html",
      cat: "signals",
      title: "Intent: knowing when the pen is really writing",
      date: "Jun 2026", read: "5 min read", author: "Malli Kosuri",
      excerpt: "Half of a pen's motion isn't writing at all. Detecting the writer's intent, pen down to write, pen up to move, is what keeps the dotted i's and stacked Indic vowel signs honest."
    },
    {
      slug: "the-magnetometer",
      url: "blog-the-magnetometer.html",
      cat: "technology",
      title: "The magnetometer: direction, zeroing and a cleaner signal",
      date: "Jun 2026", read: "6 min read", author: "Vishnu Kosuri",
      excerpt: "An accelerometer and gyroscope drift in heading over time. A magnetometer supplies an absolute compass reference that zeroes the system and steadies orientation, vital for script direction."
    },
    {
      slug: "streaming-sensors-over-ble",
      url: "blog-streaming-sensors-over-ble.html",
      cat: "technology",
      title: "Streaming sensors over BLE: packets, fragmentation and flow",
      date: "Jun 2026", read: "7 min read", author: "Malli Kosuri",
      excerpt: "Bluetooth Low Energy was built for sips of data, not a firehose of motion samples. How we packetise IMU streams, beat MTU limits and fragmentation, and keep every sample in order."
    },
    {
      slug: "reconstructing-handwriting-from-motion",
      url: "blog-reconstructing-handwriting-from-motion.html",
      cat: "research",
      title: "Reconstructing handwriting from motion alone",
      date: "Jun 2026", read: "6 min read", author: "Vishnu Kosuri",
      excerpt: "A pen only touches the paper part of the time. Teaching a model to tell writing from hovering, and rebuild the trajectory from raw inertial signals, is the heart of motion-based handwriting."
    },
    {
      slug: "writing-without-a-screen",
      url: "blog-writing-without-a-screen.html",
      cat: "technology",
      title: "Writing without a screen: surface-free pens",
      date: "May 2026", read: "5 min read", author: "Malli Kosuri",
      excerpt: "Classical sensor fusion drifts within seconds. How learned models reconstruct multi-stroke writing from an inertial pen on ordinary paper, no tablet, no special surface."
    },
    {
      slug: "two-views-of-a-letter",
      url: "blog-two-views-of-a-letter.html",
      cat: "research",
      title: "Two views of a letter: the image and the strokes",
      date: "Apr 2026", read: "6 min read", author: "Vishnu Kosuri",
      excerpt: "The finished image of a letter and the time-ordered strokes that drew it are two different views. New work feeds both to a single model, and reads handwriting better than either alone."
    },
    {
      slug: "handwriting-as-a-health-signal",
      url: "blog-handwriting-as-a-health-signal.html",
      cat: "health",
      title: "Handwriting as an early health signal",
      date: "Mar 2026", read: "7 min read", author: "Malli Kosuri",
      excerpt: "From childhood dysgraphia to the micrographia of Parkinson's, the way we form letters carries motor-health information, and machine learning is learning to read it."
    },
    {
      slug: "reading-a-hand-its-never-seen",
      url: "blog-reading-a-hand-its-never-seen.html",
      cat: "research",
      title: "The hardest part: reading a hand it has never seen",
      date: "Feb 2026", read: "5 min read", author: "Vishnu Kosuri",
      excerpt: "A model trained on one set of writers and devices stumbles on the next. “Domain adaptation” is how researchers teach handwriting AI to generalise to a brand-new hand."
    }
  ];

  /* per-post SEO keywords, keyed by slug (injected by site.js on each post page) */
  global.VahiniPostKW = {
    "history-of-20-factors": "history of handwriting analysis, 20 handwriting factors, is graphology real, handwriting quality factors, computer vision handwriting measurement, handwriting legibility assessment, handwriting motor skills, BHK handwriting scale, handwriting improvement, letter formation spacing slant baseline",
    "how-vahini-reads-handwriting": "handwriting analysis, how handwriting OCR works, handwriting quality score, 20 factor handwriting report, computer vision handwriting, handwriting recognition pipeline, neatness score, legibility analysis, Vahini analyser, handwriting assessment tool",
    "ai-detecting-learning-disabilities": "AI learning disability detection, dyslexia detection AI, dysgraphia detection deep learning, CNN handwriting dysgraphia, dyspraxia screening machine learning, neural network dyslexia, early screening learning disorders, special education AI, handwriting analysis dysgraphia, Battu sensor pen screening",
    "battu-and-autism": "autism handwriting, autistic students writing support, sensory motor handwriting autism, dysgraphia autism, assistive writing autism, dual IMU pen autism, handwriting pressure autism, calm handwriting practice, special needs writing tool, Battu autism support",
    "startup-pitch-deck-guide": "startup pitch deck guide, pitch deck template, Startup India Seed Fund Scheme, SISFS application, how to make a pitch deck, investor deck slides, fundraising deck, deeptech startup pitch, seed funding India, pitch deck PDF download",
    "one-imu-or-two": "dual IMU pen, single vs dual IMU, inertial sensor pen, IMU sensor fusion, smart pen accuracy, handwriting sensor, MEMS gyroscope accelerometer, pen orientation tracking",
    "reading-pressure": "pen pressure sensor, force sensitive resistor, analog pressure signal, writing pressure, handwriting pressure analysis, FSR calibration, smart pen sensors, grip pressure",
    "reading-tilt": "pen tilt detection, IMU tilt sensing, accelerometer gyroscope fusion, complementary filter, Kalman filter pen, handwriting slant, pen orientation",
    "velocity-signal": "writing velocity, pen speed sensor, stroke velocity, handwriting fluency, IMU velocity estimation, zero velocity update, motion sensor pen",
    "motion-to-strokes": "handwriting trajectory reconstruction, motion to strokes, IMU stroke reconstruction, digital pen on paper, pen tip path, online handwriting capture",
    "rhythm-of-writing": "handwriting rhythm, writing tempo, fluent handwriting, stroke timing, motor fluency, handwriting cadence, smart pen analysis",
    "intent-pen-up-down": "pen up pen down detection, writing intent, pen lift detection, touch vs hover, stroke segmentation, Indic diacritics matra, smart pen",
    "the-magnetometer": "magnetometer pen, 9-axis IMU, heading drift, hard iron soft iron calibration, sensor zeroing, AHRS, compass sensor, orientation tracking",
    "streaming-sensors-over-ble": "BLE sensor streaming, Bluetooth Low Energy IMU, BLE MTU, packet fragmentation, GATT notifications, sensor packet, low latency BLE, smart pen connectivity",
    "reconstructing-handwriting-from-motion": "handwriting reconstruction, IMU handwriting, mixture of experts, motion based handwriting, pen trajectory, writing on real paper, deeptech India",
    "writing-without-a-screen": "surface free pen, IMU digital pen, writing on paper, no tablet pen, sensor fusion drift, CNN trajectory reconstruction, smart pen",
    "two-views-of-a-letter": "handwriting recognition, online handwriting, vision language model, OCR strokes, digital ink, multimodal handwriting, Indic scripts",
    "handwriting-as-a-health-signal": "handwriting health, dysgraphia detection, Parkinson micrographia, handwriting biomarker, motor skills writing, handwriting kinematics",
    "reading-a-hand-its-never-seen": "domain adaptation handwriting, handwriting generalization, writer independent, domain adversarial training, handwriting AI, transfer learning"
  };

  /* abstract per-category cover art (no external images).
     mode 1 = featured (bigger), 0 = card. */
  global.VahiniPostArt = function (postOrCat, featured) {
    var cat = (postOrCat && typeof postOrCat === "object") ? postOrCat.cat : postOrCat;
    var slug = (postOrCat && typeof postOrCat === "object") ? postOrCat.slug : null;
    var pal = {
      research:   { bg1:"#222831", bg2:"#1A1E24", ink:"#3FD0D6", ink2:"#00ADB5" },
      technology: { bg1:"#26201C", bg2:"#1A1614", ink:"#E8B06B", ink2:"#C0080B" },
      health:     { bg1:"#1B2620", bg2:"#141C18", ink:"#5FD0A0", ink2:"#0F6E56" },
      signals:    { bg1:"#211C12", bg2:"#16110A", ink:"#F2C45E", ink2:"#D9912E" }
    }[cat] || { bg1:"#222831", bg2:"#1A1E24", ink:"#3FD0D6", ink2:"#00ADB5" };

    var motifs = {
      // a written stroke being sampled into points (reconstruction)
      research:
        '<path d="M40 130 q40 -70 90 -20 t100 -10 t110 20" fill="none" stroke="'+pal.ink+'" stroke-width="3" stroke-linecap="round" opacity="0.85"/>'+
        '<g fill="'+pal.ink2+'">'+
          '<circle cx="40" cy="130" r="5"/><circle cx="95" cy="92" r="5"/><circle cx="150" cy="104" r="5"/><circle cx="205" cy="96" r="5"/><circle cx="260" cy="102" r="5"/><circle cx="320" cy="122" r="5"/>'+
        '</g>'+
        '<g stroke="'+pal.ink+'" stroke-width="1.4" opacity="0.4">'+
          '<line x1="95" y1="92" x2="95" y2="150"/><line x1="150" y1="104" x2="150" y2="150"/><line x1="205" y1="96" x2="205" y2="150"/><line x1="260" y1="102" x2="260" y2="150"/>'+
        '</g>',
      // a pen with motion waves (surface-free / IMU)
      technology:
        '<rect x="60" y="70" width="180" height="16" rx="8" fill="'+pal.ink+'" transform="rotate(-18 150 78)"/>'+
        '<polygon points="232,52 268,66 240,84" fill="'+pal.ink2+'" transform="rotate(-18 150 78)"/>'+
        '<g fill="none" stroke="'+pal.ink+'" stroke-width="2.4" stroke-linecap="round" opacity="0.7">'+
          '<path d="M250 120 q14 -12 28 0 t28 0 t28 0"/>'+
          '<path d="M250 138 q14 -10 28 0 t28 0 t28 0" opacity="0.6"/>'+
        '</g>',
      // an ECG-like line turning into a letter (health)
      health:
        '<path d="M30 110 h60 l16 -42 18 78 14 -36 h60 l14 -22 16 40 12 -20 h70" fill="none" stroke="'+pal.ink+'" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+
        '<circle cx="300" cy="110" r="6" fill="'+pal.ink2+'"/>',
      // a nib pressing with radiating pressure rings + a sampled waveform (sensor signals)
      signals:
        '<g fill="none" stroke="'+pal.ink+'" stroke-width="2" opacity="0.42"><circle cx="92" cy="120" r="22"/><circle cx="92" cy="120" r="38"/><circle cx="92" cy="120" r="54"/></g>'+
        '<polygon points="80,64 104,64 92,120" fill="'+pal.ink2+'"/>'+
        '<circle cx="92" cy="120" r="6" fill="'+pal.ink+'"/>'+
        '<path d="M150 120 q14 -32 28 0 t28 0 t28 0 t28 0 t28 0" fill="none" stroke="'+pal.ink+'" stroke-width="2.6" stroke-linecap="round" opacity="0.85"/>'
    };
    var i = pal.ink, j = pal.ink2;
    /* per-post motifs, keyed by slug, give every card a unique image */
    var THUMB = {
      "how-vahini-reads-handwriting":
        '<rect x="50" y="54" width="96" height="72" rx="8" fill="none" stroke="'+i+'" stroke-width="2.4"/>'+
        '<path d="M66 104 q10 -20 20 0 t20 0" fill="none" stroke="'+i+'" stroke-width="2.2" stroke-linecap="round"/>'+
        '<path d="M158 90h26" stroke="'+j+'" stroke-width="2.4"/><path d="M178 84l8 6-8 6" fill="none" stroke="'+j+'" stroke-width="2.4"/>'+
        '<circle cx="232" cy="90" r="30" fill="none" stroke="'+i+'" stroke-width="7"/>'+
        '<circle cx="232" cy="90" r="30" fill="none" stroke="'+j+'" stroke-width="7" stroke-linecap="round" stroke-dasharray="140 188" transform="rotate(-90 232 90)"/>'+
        '<g fill="'+i+'"><rect x="276" y="74" width="60" height="7" rx="3"/><rect x="276" y="88" width="60" height="7" rx="3" opacity="0.6"/><rect x="276" y="102" width="42" height="7" rx="3" opacity="0.4"/></g>',
      "ai-detecting-learning-disabilities":
        '<rect x="66" y="58" width="150" height="96" rx="10" fill="none" stroke="'+i+'" stroke-width="2.4"/>'+
        '<g stroke="'+i+'" stroke-width="2" opacity="0.55"><line x1="96" y1="58" x2="96" y2="154"/><line x1="126" y1="58" x2="126" y2="154"/><line x1="156" y1="58" x2="156" y2="154"/><line x1="186" y1="58" x2="186" y2="154"/><line x1="66" y1="90" x2="216" y2="90"/><line x1="66" y1="122" x2="216" y2="122"/></g>'+
        '<circle cx="96" cy="90" r="7" fill="'+j+'"/><circle cx="156" cy="122" r="7" fill="'+j+'"/><circle cx="186" cy="90" r="7" fill="'+j+'"/>'+
        '<path d="M250 122 q14 -34 28 0 t28 0 t28 0" fill="none" stroke="'+i+'" stroke-width="2.6" stroke-linecap="round"/>'+
        '<circle cx="250" cy="122" r="4" fill="'+j+'"/><circle cx="334" cy="122" r="4" fill="'+j+'"/>',
      "battu-and-autism":
        '<circle cx="150" cy="96" r="40" fill="none" stroke="'+i+'" stroke-width="2.6"/>'+
        '<path d="M150 70 a26 26 0 0 1 0 52 a13 13 0 0 1 0 -26 a13 13 0 0 0 0 -26" fill="'+i+'" opacity="0.8"/>'+
        '<circle cx="150" cy="83" r="5" fill="'+j+'"/><circle cx="150" cy="109" r="5" fill="'+i+'"/>'+
        '<path d="M236 120 q12 -22 24 0 t24 0 t24 0" fill="none" stroke="'+j+'" stroke-width="2.6" stroke-linecap="round"/>'+
        '<path d="M236 138 q12 -16 24 0 t24 0 t24 0" fill="none" stroke="'+i+'" stroke-width="2.2" stroke-linecap="round" opacity="0.6"/>',
      "startup-pitch-deck-guide":
        '<g fill="none" stroke="'+i+'" stroke-width="2.4"><rect x="70" y="50" width="150" height="96" rx="6"/></g>'+
        '<rect x="84" y="64" width="70" height="10" rx="3" fill="'+j+'"/>'+
        '<g fill="'+i+'" opacity="0.8"><rect x="84" y="84" width="120" height="6" rx="3"/><rect x="84" y="98" width="120" height="6" rx="3"/><rect x="84" y="112" width="80" height="6" rx="3"/></g>'+
        '<g fill="none" stroke="'+j+'" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M250 64v60M232 106l18 18 18-18"/></g>',
      "one-imu-or-two":
        '<rect x="96" y="86" width="168" height="14" rx="7" fill="'+i+'" transform="rotate(-16 180 93)"/>'+
        '<polygon points="256,66 292,78 262,96" fill="'+j+'" transform="rotate(-16 180 93)"/>'+
        '<circle cx="138" cy="112" r="12" fill="'+j+'"/><circle cx="214" cy="90" r="12" fill="'+i+'"/>'+
        '<text x="138" y="148" text-anchor="middle" font-family="Hanken Grotesk,sans-serif" font-size="13" font-weight="700" fill="'+i+'">IMU 1</text>'+
        '<text x="214" y="70" text-anchor="middle" font-family="Hanken Grotesk,sans-serif" font-size="13" font-weight="700" fill="'+j+'">IMU 2</text>',
      "reading-pressure":
        '<g fill="none" stroke="'+i+'" stroke-width="2" opacity="0.4"><circle cx="180" cy="128" r="20"/><circle cx="180" cy="128" r="36"/><circle cx="180" cy="128" r="52"/></g>'+
        '<polygon points="168,60 192,60 180,128" fill="'+j+'"/><circle cx="180" cy="128" r="7" fill="'+i+'"/>'+
        '<path d="M250 96 q10 36 22 0 t22 0" fill="none" stroke="'+i+'" stroke-width="2.4" stroke-linecap="round" opacity="0.8"/>',
      "reading-tilt":
        '<g transform="rotate(20 180 96)"><rect x="110" y="88" width="150" height="15" rx="7" fill="'+i+'"/><polygon points="252,84 286,95 256,108" fill="'+j+'"/></g>'+
        '<line x1="180" y1="50" x2="180" y2="150" stroke="'+j+'" stroke-width="2.4" stroke-dasharray="4 4"/>'+
        '<path d="M180 120 a40 40 0 0 1 14 -30" fill="none" stroke="'+i+'" stroke-width="2.4"/>',
      "velocity-signal":
        '<line x1="36" y1="140" x2="324" y2="140" stroke="'+i+'" stroke-width="1.5" opacity="0.3"/>'+
        '<path d="M40 140 q34 -86 64 -10 q22 56 44 4 q26 -72 60 -64 q34 4 50 70 q14 -52 42 -64" fill="none" stroke="'+i+'" stroke-width="3" stroke-linecap="round"/>'+
        '<circle cx="40" cy="140" r="5" fill="'+j+'"/><circle cx="208" cy="66" r="5" fill="'+j+'"/>',
      "motion-to-strokes":
        '<path d="M60 150 C60 60 150 60 150 110 C150 150 90 150 90 110 C90 70 180 70 210 150" fill="none" stroke="'+i+'" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'+
        '<g fill="'+j+'"><circle cx="60" cy="150" r="5"/><circle cx="150" cy="86" r="5"/><circle cx="120" cy="128" r="5"/><circle cx="210" cy="150" r="5"/></g>'+
        '<path d="M250 110 q16 -26 32 0 t32 0" fill="none" stroke="'+i+'" stroke-width="2.2" opacity="0.6" stroke-linecap="round"/>',
      "rhythm-of-writing":
        '<g stroke="'+i+'" stroke-width="4" stroke-linecap="round">'+
          '<line x1="70" y1="74" x2="70" y2="118"/><line x1="118" y1="74" x2="118" y2="118"/><line x1="166" y1="74" x2="166" y2="118"/><line x1="214" y1="74" x2="214" y2="118"/><line x1="262" y1="74" x2="262" y2="118"/></g>'+
        '<path d="M60 138 q50 26 100 0 t100 0" fill="none" stroke="'+j+'" stroke-width="2.4" opacity="0.7" stroke-linecap="round"/>',
      "intent-pen-up-down":
        '<path d="M70 140 q12 -64 24 0 M94 140 q12 -64 24 0" fill="none" stroke="'+i+'" stroke-width="5" stroke-linecap="round"/>'+
        '<path d="M118 78 q44 -30 92 16" fill="none" stroke="'+j+'" stroke-width="2.4" stroke-dasharray="5 7" stroke-linecap="round"/>'+
        '<path d="M210 140 q12 -58 24 -2" fill="none" stroke="'+i+'" stroke-width="5" stroke-linecap="round"/><circle cx="224" cy="66" r="6" fill="'+i+'"/>',
      "the-magnetometer":
        '<circle cx="180" cy="100" r="56" fill="none" stroke="'+i+'" stroke-width="2.4" opacity="0.5"/>'+
        '<polygon points="180,52 190,100 180,100" fill="'+j+'"/><polygon points="180,148 170,100 180,100" fill="'+i+'"/>'+
        '<circle cx="180" cy="100" r="6" fill="'+i+'"/><text x="180" y="44" text-anchor="middle" font-family="Hanken Grotesk,sans-serif" font-size="12" font-weight="800" fill="'+i+'">N</text>',
      "streaming-sensors-over-ble":
        '<g fill="'+j+'"><rect x="70" y="86" width="22" height="22" rx="4"/><rect x="100" y="86" width="22" height="22" rx="4"/><rect x="130" y="86" width="22" height="22" rx="4"/></g>'+
        '<g fill="none" stroke="'+i+'" stroke-width="2.6" stroke-linecap="round"><path d="M180 97 a18 18 0 0 1 0 0"/><path d="M196 80 a34 34 0 0 1 0 34"/><path d="M212 66 a52 52 0 0 1 0 62"/></g>'+
        '<circle cx="182" cy="97" r="5" fill="'+i+'"/>'
    };
    var m = (slug && THUMB[slug]) ? THUMB[slug] : (motifs[cat] || motifs.research);
    return '<svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">'+
      '<defs><linearGradient id="bg'+(slug||cat)+featured+'" x1="0" y1="0" x2="1" y2="1">'+
        '<stop offset="0" stop-color="'+pal.bg1+'"/><stop offset="1" stop-color="'+pal.bg2+'"/></linearGradient></defs>'+
      '<rect width="360" height="180" fill="url(#bg'+(slug||cat)+featured+')"/>'+ m +
    '</svg>';
  };
})(window);
