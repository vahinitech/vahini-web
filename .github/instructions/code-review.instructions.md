---
applyTo: "**"
---

# Code review instructions — vahinitech/web-live

This is the Vahini marketing site: static HTML/CSS/JS served by nginx
inside Docker, plus a small persist API and the `analyser/` submodule
(a separate open-source repo, don't review its internals here). Real
users, real deploy target (`vahinitech.com`), no build step catching
mistakes before they ship — review accordingly.

## Provenance: Never Copied Code

- **Flag any newly added JS/CSS that looks lifted from another site,
  template, or Stack Overflow/gist** — unusual style vs. the rest of the
  file, naming that doesn't match this codebase, or a suspiciously
  complete block appearing all at once. Ask directly: "is this cited/a
  real dependency, or copied?"
- External libraries belong in as real, license-intact dependencies (npm
  package, or a vendored file that keeps its original license header) —
  not pasted source with the license stripped.
- If literal reuse of someone else's non-package code is genuinely
  needed, get the original author's consent first and record it in the
  PR. Applies with extra force to AI-assisted changes.

## Security Critical Issues

- No hardcoded secrets, tokens, or internal hostnames in JS/HTML.
- Any change to `deploy/nginx.conf`, `deploy/nginx-security.conf`, or the
  Hestia vhost templates in `deploy/`: check rate-limit zones, CORS, and
  the abuse-guard patterns (`services/persist-api`'s upload limits, the
  OCR-input SSRF/homoglyph guard) aren't loosened without a stated reason.
- User-supplied content (uploaded images, feedback text, report data)
  must never be interpolated into HTML/JS without escaping — check for
  `innerHTML`/`eval`/unescaped template interpolation.
- `location ^~ /assets/` in `deploy/nginx.conf` is a legacy compatibility
  redirect for the analyser app, not a general asset path — a PR that adds
  new bare `/assets/...` URLs (site pages, OG tags, JSON-LD) is very
  likely a bug, not a feature. Real static assets live under
  `/site/assets/...`.

## Performance Red Flags

- `site/js/site.js` loads on every page (nav/footer injection) — flag
  anything added there that isn't O(1) per page load or that blocks
  render.
- New images added as `og:image`/hero art: check actual file size and
  dimensions match what's declared in the meta tags (`og:image:width`/
  `height`) — a mismatch breaks link previews silently, no CI catches it.
- Avoid adding new client-side dependencies to the static site for
  something a few lines of vanilla JS/CSS could do — this is a marketing
  site, not an app.

## Code Quality Essentials

- CSS specificity: this codebase has a real precedent bug (`.foot__col a`
  silently beating `.foot__soc`'s centering rule because it's nested and
  has higher specificity). When reviewing new CSS touching nested
  components, check what broader parent-scoped rules could already apply
  to that element.
- `og:image`/`twitter:image` and any JSON-LD `"image"`/`"logo"`/`"url"`
  fields must use the same path and must point at a file that actually
  exists — both need checking; a PR fixing one and missing the other is
  a real recurring mistake here (see PR #27/#30 history).
- Inline scripts in `site/index.html` (hero flywheel, six-products card
  animation) are two *separate* components with their own timers — a
  selector or timing change to one should not be assumed to affect the
  other.
- Any `docker-compose*.yml` change: confirm `name:` (explicit Compose
  project name) is present and untouched — removing it lets stage and
  prod destroy each other's containers on deploy (real incident,
  2026-07-20).

## Review Style

- Be specific: cite the exact selector, file path, or line, not "this
  could be cleaner."
- No AI-isms in review comments or suggested copy — plain, direct language.
- If a PR touches `deploy/` and isn't purely docs, ask whether it's been
  tested against a real render (Playwright screenshot or a manual
  browser check), not just read for correctness — several real bugs here
  looked correct in the source and were wrong on screen.
- Flag content changes reusing the `vahini-pen-og.jpg`/`og-home.jpg`
  banner images — they may still carry stale branding baked into the
  image pixels (not visible via `grep`); open the image if unsure.
