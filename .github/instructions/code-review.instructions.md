---
applyTo: "**"
---

# Code review instructions — vahinitech/vahini-web

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
- `location ^~ /assets/` in `deploy/nginx.conf` serves the site's own
  files first and only falls back to the analyser's legacy redirect. Both
  halves matter: dropping the `try_files /site$uri` breaks every relative
  asset on the public URLs, and dropping the `@analyser_assets` fallback
  breaks the analyser app. See "URL Routing and Assets" below. Anything
  written by hand (OG tags, JSON-LD, hardcoded `src`) should still use the
  explicit `/site/assets/...` form rather than relying on the fallback.

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

## URL Routing and Assets

`deploy/nginx.conf` decides which file a URL reaches, and the two test
suites that run on most PRs (`test:e2e`, `smoke-http`) spawn
`http-server` at the repo root — nginx never runs in them, so they
cannot catch anything in this section. `npm run test:routes` is the one
that can. Review these by hand:

- **Pages serve at two depths.** Files live under `site/`, but every
  public URL is the bare path (`/events.html`), served from `/site/` by
  internal rewrite. A relative `assets/x.jpg` in the markup therefore
  resolves to `/site/assets/x.jpg` at `/site/events.html` and to
  `/assets/x.jpg` at the public `/events.html` — different nginx
  locations, different outcomes. For any PR adding or moving an asset
  reference, ask which URL it was checked at; "it works locally" usually
  means `/site/…`, which is the shape that never breaks. Production
  broke 33 assets across six pages exactly this way: the logo, the
  favicons, every event photo, the patent preview.
- **A bare-prefix location that unconditionally redirects swallows our
  own files.** `^~` beats every regex, so `location ^~ /assets/ { return
  302 …; }` captures the site's own assets before the static-file regex
  runs. Any such prefix must `try_files /site$uri` first and only then
  fall back. Flag new `^~` or `location =` blocks that return/redirect
  without a local-file attempt.
- **Location precedence is not source order.** `=` exact wins, then `^~`
  prefix (which *stops* regex evaluation), then regexes in file order,
  then longest prefix. A reviewer reasoning top-to-bottom will get this
  wrong — ask for `test:routes` output instead of arguing it.
- **One public URL per page.** `rel="canonical"`, `site/sitemap.xml` and
  what nginx serves must agree. Flag a new page, redirect or sitemap
  entry that creates a second live URL for the same content, and flag
  sitemap entries that redirect rather than serving directly.
- **`Dockerfile` `COPY . .` does not overwrite the nginx base image's own
  `/usr/share/nginx/html/index.html`** (this repo has no root
  `index.html`). If a change touches the Dockerfile's web-root handling,
  confirm the `rm -f index.html 50x.html` is still there — without it
  `/index.html` serves "Welcome to nginx!".
- Health-check URLs in `Dockerfile`, `deploy/docker-compose.*.yml` and
  `deploy/release.sh` should point at a URL that serves **200 directly**,
  not one that redirects.

## Voice and AI Provenance

- **Flag any reader-facing text that labels our own content as
  AI-written**: "AI summary", "machine-generated", "AI-generated",
  "written by AI" and equivalents. Our posts carry an author byline and
  are edited before publishing, so that framing describes the drafting
  tool rather than what a reader is getting. Applies to markup, class
  names, ids, filenames and comments for those blocks (`post-sum__*`,
  never `post-ai__*`). Describing the PRODUCT's AI (the analyser, the
  recognition engine) is accurate and stays.
- **Flag em dashes in published copy.** The site uses none; commas,
  colons and full stops carry the same sentences without reading as
  machine-written.
- **Flag AI-isms** in new copy or comments: "delve", "seamless", "robust
  solution", "leverage", "It's important to note", filler superlatives.

## Review Style

- Be specific: cite the exact selector, file path, or line, not "this
  could be cleaner."
- No AI-isms in review comments or suggested copy: plain, direct language.
- If a PR touches `deploy/` and isn't purely docs, ask whether it's been
  tested against a real render (Playwright screenshot or a manual
  browser check), not just read for correctness — several real bugs here
  looked correct in the source and were wrong on screen.
- Flag any reused banner or hero image without someone having opened it:
  product names and logos live in image *pixels*, where `grep` cannot
  reach. The two banners that carried a retired product name have been
  deleted; `site/assets/pen-hero.jpeg` still shows a pen with a non-Vahini
  logo on the barrel, so treat it the same way.
