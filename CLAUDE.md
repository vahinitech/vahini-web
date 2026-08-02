# CLAUDE.md — web-live (vahinitech.com marketing site)

## Working rules (apply to every change)

- **Verify before claiming.** Read the actual file/config before stating what
  it does. Never invent paths, APIs, stats, or benchmark numbers. If a fact
  can't be verified in this repo, say so instead of guessing.
- **Never copy another project's code into this repo — reference it,
  don't paste it.** If an external library/snippet is genuinely needed,
  use it as a real dependency (npm package, documented CDN/vendor with
  its license kept intact) or reimplement independently, not by pasting
  source. If literal reuse of someone else's non-package code is truly
  unavoidable, get the original author's explicit consent first and
  record it in the commit/PR. Vahini is a research-adjacent org —
  unattributed code reuse is an IP risk, and it applies with extra force
  to AI-assisted changes, since a model can reproduce code it saw during
  training without anyone noticing the provenance.
- **No AI-isms** in site copy, commit messages, docs, or code comments:
  no "delve", "seamless", "robust solution", "leverage", "It's important
  to note", "in today's fast-paced world", or filler superlatives. Write
  like the existing pages: plain, specific, confident.
- **No em dashes in published copy.** The site uses none today (checked:
  zero across every page and post); commas, colons and full stops carry
  the same sentences and do not read as machine-written. Hyphens in
  compound words are fine.
- **Never label our own content as AI-written.** No "AI summary",
  "machine-generated", "AI-generated", "written by AI" or equivalent in
  reader-facing text, and no `ai` in class names, ids, filenames or
  comments for those blocks: a summary block is `post-sum__*`, not
  `post-ai__*`. Posts carry an author byline and are edited before
  publishing, so that framing describes the drafting tool rather than
  what the reader is getting, and it undercuts the writing. This is
  about our OWN content: describing the PRODUCT's AI (the analyser, the
  recognition engine) is accurate and stays.
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`), imperative
  mood, body explains why. Match the existing `git log` style.
- **Build and test before every commit.** CI (`.github/workflows/ci.yml`:
  security tests, nginx routing, Playwright e2e, live-backend recognition)
  must be green before merge. Never merge a PR with failing or unchecked CI.
- **Docs-only changes skip CI** — `ci.yml` has `paths-ignore: ['**/*.md',
  'docs/**']`, so a PR touching only markdown never triggers the Docker/
  Playwright pipeline. This is automatic; don't hand-skip CI on a mixed
  PR that also touches code — the filter only fires when *every* changed
  file is docs.
- **Semantic HTML**: headings in order, `<figure>/<figcaption>` for
  diagrams, `aria-label` on informational SVGs, alt text on images.
- **Verify visually.** For any UI/CSS/SVG change, render it (local server +
  Playwright screenshot) before committing — do not trust coordinates or
  CSS reasoning alone. Chromium lives at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` in CC-web sessions.
- **Never reason about routing; run it.** `deploy/nginx.conf` decides which
  file (if any) a URL reaches, and location precedence is not intuitive
  (`=` exact, then `^~` prefix which *stops* regex evaluation, then regex in
  file order, then longest prefix). Any change to `deploy/nginx.conf`,
  `Dockerfile`, `site/sitemap.xml`, a `rel="canonical"`, or an asset path
  must be checked with `npm run test:routes`, which starts real nginx on the
  real config. `npm test`/`test:e2e` cannot catch routing bugs at all: they
  spawn `http-server` at the repo root, so every URL is a plain file path
  and nginx never runs. That gap is exactly how production shipped 33
  broken assets across six pages with CI green (see below).

## Commands

```bash
make up          # full local stack (web + analyser OCR + persist), wait healthy
make smoke       # every service answers through nginx
npm test         # smoke-http
npm run test:security
npm run test:routes   # real nginx on deploy/nginx.conf: URLs, canonicals, assets
                      # (needs `sudo apt-get install -y nginx-light` once)
node_modules/.bin/http-server site -p 4173   # front-end only, no Docker
```

## Deploy (server: 110.172.148.13, Hestia CP — see docs/DEPLOY-STAGE-PROD.md)

```bash
git pull → ./deploy/release.sh stage → verify stag.vahinitech.com → ./deploy/release.sh prod
```

- **`git pull` alone never updates the live site** — `site/` is baked into
  the Docker image (`Dockerfile` `COPY . .`); `release.sh` rebuilds/redeploys.
- Compose files pin project names (`vahini-stage`/`vahini-prod`) — never
  remove `name:`; without it stage and prod destroy each other's containers
  (incident 2026-07-20, see docs/incidents/).
- The host is a **shared Hestia box** (~40 unrelated customer domains).
  Only touch vahinitech.com/stag vhost files; per-domain overrides live in
  `/home/vahini25/conf/web/vahinitech.com/nginx.ssl.conf_*` (prefix-globbed
  includes — renaming a file only disables it if the new name breaks the
  prefix).

## Gotchas that cost real time (do not rediscover)

- **Pages serve at two depths, and relative paths resolve differently at
  each.** The files live under `site/`, but every public URL is the bare
  path (`/events.html`); nginx serves them from `/site/` by internal
  rewrite. So a relative `assets/events/iit-01.jpg` in the markup resolves
  to `/site/assets/...` when opened at `/site/events.html` and to
  `/assets/...` at the public `/events.html` — two different nginx
  locations. Production 404'd 33 assets across six pages this way (the
  logo, the favicons, every event photo, the patent preview) while every
  file sat correctly in the repo, because `location ^~ /assets/`
  unconditionally 302'd them into the analyser container. When
  touching asset paths, check the **public** URL, not `/site/…`.
  `npm run test:routes` does exactly this and fails on any subresource
  that is not 200.
- **A bare-prefix location that unconditionally redirects will swallow the
  site's own files.** `^~` beats every regex, so `location ^~ /assets/`
  captures `/assets/foo.png` before the static-asset regex ever runs. Such
  a rule must `try_files /site$uri` first and only then fall back
  (`@analyser_assets`). Same shape, same trap, for any future prefix.
- OG/social images and JSON-LD: use absolute `/site/assets/...` URLs.
  Relative ones work in a browser but scrapers resolve them against the
  page URL, and there is no reason to make a link preview depend on which
  URL shape got shared. Check **both** the meta tags and the JSON-LD
  blocks; brand names and logos also live in image *pixels*, where grep
  cannot reach — open the image and look before reusing any asset.
- **One public URL per page.** `rel="canonical"`, `sitemap.xml` and what
  nginx actually serves must agree; every other spelling 301s to the
  canonical in a single hop. The nginx base image also ships its own
  `index.html` at the web root, which `COPY . .` does not overwrite (this
  repo has no root `index.html`) — the `Dockerfile` deletes it, or
  `/index.html` serves "Welcome to nginx!". `test:routes` asserts all
  three.
- `analyser/` is a **git submodule** pinned to an exact
  vahinitech/20factor-analyser commit (not necessarily a tag — today's pin is
  4 commits past v0.7). Never edit files inside it here; bump the pin instead.
  `analyser.html` hardcodes `../site/site.js` — a cross-repo contract, keep
  the redirect. See `input-manifest.yaml` (repo root) for the pinned
  repo/branch/commit/version, what's actually consumed (Docker image, proxied
  routes, this contract) and the bump procedure — CI fails if the manifest
  drifts from the real pin, so update it in the same commit as any pin bump
  (`python3 tools/check-input-manifest.py` runs the same check locally).
- The six-products card animation and hero flywheel are **inline scripts in
  site/index.html**, not in `site/js/site.js`.
- Footer/nav are injected by `site/js/site.js` on every page — a fix there
  is site-wide. CSS: `.foot__col a` outranks single-class rules inside the
  footer columns (specificity), scope selectors accordingly.
- WhatsApp caches link previews per-URL for a long time — test fixes with a
  cache-busted URL (`?v=N`), never by re-sharing the originally broken link.
