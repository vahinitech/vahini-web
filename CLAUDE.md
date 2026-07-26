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
- **No AI-isms** in site copy, commit messages, or docs: no "delve",
  "seamless", "robust solution", "leverage", "It's important to note",
  "in today's fast-paced world", or filler superlatives. Write like the
  existing pages: plain, specific, confident.
- **Conventional commits** (`feat:`, `fix:`, `docs:`, `chore:`), imperative
  mood, body explains why. Match the existing `git log` style.
- **Build and test before every commit.** CI (`.github/workflows/ci.yml`:
  security tests + Playwright e2e) must be green before merge. Never merge
  a PR with failing or unchecked CI.
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

## Commands

```bash
make up          # full local stack (web + analyser OCR + persist), wait healthy
make smoke       # every service answers through nginx
npm test         # smoke-http
npm run test:security
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

- OG/social images: URLs must use `/site/assets/...` — bare `/assets/` is
  intercepted by a legacy redirect in `deploy/nginx.conf` and breaks link
  previews. Check **both** the meta tags and the JSON-LD blocks; also
  page-header images live in image pixels (grep can't find "Battu"-style
  stale branding — open the image).
- `analyser/` is a **git submodule** pinned to a vahinitech/20factor-analyser
  tag. Never edit files inside it here; bump the pin instead. `analyser.html`
  hardcodes `../site/site.js` — a cross-repo contract, keep the redirect. See
  `docs/INPUT-MANIFEST.md` for the full list of what's actually consumed
  (Docker image, proxied routes, this contract) and how to bump the pin.
- The six-products card animation and hero flywheel are **inline scripts in
  site/index.html**, not in `site/js/site.js`.
- Footer/nav are injected by `site/js/site.js` on every page — a fix there
  is site-wide. CSS: `.foot__col a` outranks single-class rules inside the
  footer columns (specificity), scope selectors accordingly.
- WhatsApp caches link previews per-URL for a long time — test fixes with a
  cache-busted URL (`?v=N`), never by re-sharing the originally broken link.
