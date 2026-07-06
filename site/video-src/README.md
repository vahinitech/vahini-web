<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Promo video source (Remotion scenes)

These are Remotion React scene-definition scripts used to render Vahini's
marketing/explainer videos. They are **source only** — no rendered
`.mp4`/`.webm` output is committed here; rendering requires a Remotion
toolchain that isn't part of this repo's build.

They previously lived under `analyser/scripts/video/` in the old flat copy
of the analyser app, but that was proprietary marketing content, not AGPL
engine code — it was never part of the public `vahinitech/20factor-analyser`
release and was dropped when `analyser/` became a submodule (see the
"submodule refactor" PR). Recovered from git history and moved here since
this is where the rest of the site's proprietary marketing assets live.

`video-helpers.jsx` is the shared brand/animation-primitives helper every
scene file depends on (`Stage`, `Timeline`, easing, brand tokens); keep it
alongside the scene files it's used by.

## Which scene set goes with which page

Mapped by content/topic (none of these are `<script src>`-linked from the
HTML — Remotion renders them offline into video files that would then be
embedded or hosted separately):

| File | Video | Topic match |
|---|---|---|
| `v1-scenes.jsx` | Video 1 · THE CONCEPT (~23s) | `about.html` — "a pen that records handwriting on ordinary paper" is the page's origin-story hook ("every handwritten page has two layers... Vahini captures the second"). |
| `v5-scenes.jsx` | "Why messy handwriting matters" (~33s) | `index.html`'s "Handwriting proof" section and `solution-handwriting.html`'s "why it matters" section — both previously embedded this as `analyser/static/Vahini Why Messy.html`, which no longer exists after the submodule swap. |
| `v2-scenes.jsx` | Video 2 · HOW IT WORKS (~52s) | `solution-handwriting.html`'s "Three steps, one page" flow (upload → analyse → practise), linked from `index.html`'s `#applications` hub. |
| `v4-scenes.jsx` | Video 4 · WHY INDIC SCRIPTS (~50s) | `solution-ocr-vision.html` (the Indic handwriting engine) and the five-Indic-scripts dataset story on `index.html`, also reachable from `#applications`. |
| `scenes-a.jsx` + `scenes-b.jsx` | "20 Factors explainer" (Scenes 1–6) | `factors.html` ("The 20 factors, explained"). |
| `animations.jsx` | — | Generic reusable animation starter/scaffold (Stage, Timeline, Sprite, easing helpers), not tied to one page. |

If any of these get rendered to actual video files, embed them on the pages
above and update this table with the real asset path.
