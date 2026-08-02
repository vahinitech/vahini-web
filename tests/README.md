<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Tests

Regression coverage for the site, run on every push and pull request via
`.github/workflows/ci.yml`.

| File | Checks | Wired into |
|---|---|---|
| `smoke-http.mjs` | The static site image serves `/site/index.html`. | `npm test` |
| `nginx-routes.mjs` | Real nginx on the real `deploy/nginx.conf`: sitemap URLs serve directly, duplicate URLs collapse to one canonical, canonical tags point at served URLs, and every subresource of eight pages returns 200. | `npm run test:routes`, CI **routes** job |
| `e2e-pages.mjs` | Headless Chrome: home, blog index and a blog post load with no page errors. Fully offline, no backend needed. | `npm run test:e2e` / `test:all`, CI **e2e** job |
| `e2e-recognition.mjs` | Headless Chrome against a **live** analyser stack: uploads `tests/fixtures/handwriting-sample.jpg`, asserts a real report renders and shows recognition results. | `npm run test:recognition`, CI **e2e-recognition** job |

## Why `nginx-routes.mjs` exists separately

`smoke-http.mjs` and `e2e-pages.mjs` both spawn `http-server` at the repo
root. Every URL they ask for is therefore a plain file path, and nginx never
runs — so they are structurally incapable of catching a routing bug, and
`/site/index.html` is the correct path *for them*.

That gap shipped a real outage. The pages serve at bare public URLs
(`/events.html`) while their asset refs stay relative, so
`assets/events/iit-01.jpg` resolved to `/assets/events/iit-01.jpg`, and
`location ^~ /assets/` sent it to the analyser container, which has no such
file. 33 assets across six pages 404'd in production — the logo, the favicons,
every event photo, the patent preview — while every file sat correctly in
the repo and CI was green.

`nginx-routes.mjs` runs the actual config (only the listen port, root,
include paths and proxy upstreams are substituted; no location, `try_files`,
`return` or `rewrite` is touched) and loads the pages at their **public**
URLs. Anything that leaks into `/analyser` hits a stub that 404s, exactly
like the real analyser does, and the test names the offending URLs.

## Running locally

```bash
npm test                          # smoke-http.mjs
npm run test:regression:install   # once, downloads Chromium
npm run test:e2e                  # e2e-pages.mjs

sudo apt-get install -y nginx-light   # once, for the routing test
npm run test:routes                   # nginx-routes.mjs
```

`test:routes` needs `nginx` on PATH. On a machine with a system Chromium
instead of Playwright's download, point it at the binary:
`VAHINI_CHROMIUM_PATH=/path/to/chrome npm run test:routes`. Set
`VAHINI_ROUTES_PORT` if 8099-8101 are taken.

`e2e-recognition.mjs` needs the real backend up first:

```bash
docker compose up -d --wait
VAHINI_BASE_URL=http://localhost:8080 npm run test:recognition
```

## Continuous integration

- **routes** — installs nginx + Chromium, runs `test:routes` against the real
  `deploy/nginx.conf`. No Docker, no submodule; the fastest signal on any
  routing, canonical or asset-path change.
- **e2e** — installs Chromium, runs `test:e2e` against the marketing site.
- **e2e-recognition** — builds the analyser submodule's image, brings up the
  full Docker stack, and runs `test:recognition` against it.

The analyser submodule (`vahinitech/20factor-analyser`) has its own CI for its
internal unit/lint tests; this repo's CI only covers the site/analyser
integration.
