<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Input Manifest: the `analyser/` submodule

This repo (`vahini-web`) doesn't build the handwriting-analysis engine itself
— it pulls in `vahinitech/20factor-analyser` as a pinned git submodule and
wires it into the site's Docker Compose stack and nginx config. This doc is
the quick-reference for "what exactly are we consuming from that repo, and
where does it plug in" — read it before bumping the pin or debugging why an
analyser change didn't show up here.

## What's pinned, and how to bump it

- **Source**: [`vahinitech/20factor-analyser`](https://github.com/vahinitech/20factor-analyser)
  (AGPL-3.0, open source).
- **Location**: checked out at `analyser/` (see `.gitmodules`).
- **Current pin**: run `git submodule status` — the hash after the leading
  space is the pinned commit; `git -C analyser log -1 --oneline` shows what
  it is.
- **Bump**:
  ```bash
  cd analyser && git fetch origin && git checkout <new-commit-or-tag> && cd ..
  git add analyser && git commit -m "chore: bump analyser submodule to <short-sha>"
  ```
  `deploy/release.sh` also runs `git submodule sync/update` on every deploy,
  so a stale local checkout self-heals at deploy time — but CI and local dev
  only see the pin that's actually committed here.
- **Never edit files inside `analyser/` from this repo** — it's a separate
  repo with its own PRs, CI and history. A local edit there is invisible to
  everyone else and gets silently discarded the next time someone bumps the
  pin.

## What we actually consume

**Docker image.** `analyser/deployment/Dockerfile` is built as the
`analyser` service in `docker-compose.yml`, `deploy/docker-compose.stage.yml`
and `deploy/docker-compose.prod.yml` (`context: ./analyser` or `../analyser`
depending on which compose file's cwd). The container's `PORT` env var is
set to `8868` in every compose file — that's the port nginx proxies to, not
the Dockerfile's own `EXPOSE 8080` (a stale default; the app reads `PORT` at
runtime). CI (`.github/workflows/ci.yml`, `e2e-recognition` job) builds the
same Dockerfile standalone (`vahini/analyser:local`) to smoke-test the live
stack, including OCR recognition, on every push/PR.

**HTTP surface, reverse-proxied by `deploy/nginx.conf`:**

| Path | Proxies to | What it is |
|---|---|---|
| `/analyser/` | `http://analyser:8868` | The whole analyser frontend app (`analyser.html`, styles, scripts) |
| `/ocr`, `/ocr/health` | `http://analyser:8868/ocr[...]` | OCR endpoint |
| `/analyze-vl` | `http://analyser:8868/analyze-vl` | Context-aware OCR + layout API |
| `/report-python` | `http://analyser:8868/report-python` | The 20-factor scoring/report API |

Plus legacy redirects for pre-restructure asset paths (`/report.css`,
`/studio.css`, `/nav.css`, `/engine.bundle.js`, `/protect.js`,
`/Vahini%20Analyser.html` → their current `/analyser/...` locations) — kept
so old bookmarks/links into the analyser app don't 404.

**The reverse contract (analyser → this repo).** `analyser/analyser.html`
hardcodes `<script src="../site/site.js">` to load this site's shared
nav/footer — that's a cross-repo path contract, not an internal link, and
it's not ours to change from the analyser side. `site.js` moved to
`site/js/site.js` when this repo's CSS/JS got split into folders, so
`deploy/nginx.conf` still 301-redirects the old `/site/site.js` path to keep
that hardcoded reference working unmodified. If `site/js/site.js` ever moves
again, that redirect (or the analyser-side script tag, coordinated across
both repos) has to move with it.

**Runtime data flow (not a code dependency, but a consumer of the same
volume).** The analyser frontend calls this repo's own `services/persist-api`
(`/persist/upload-image`, `/persist/generated-report`, `/persist/feedback`)
directly for observability — upload/report/feedback records written to
`/data/{uploads,reports,feedback}` and swept by `services/persist-api/lib/sweeper.js`.
persist-api treats the analyser submodule only as a boundary (see the
comment in `services/persist-api/lib/textguard.js`): it sanitizes and stores
whatever the analyser frontend sends, but has no code dependency on it.

## What's *not* pinned here

Marketing copy across `site/*.html` links to `../analyser/analyser.html`
extensively (nav menus, CTAs, footer) — those are plain links, not a version
dependency, and don't need updating when the submodule pin bumps.
