<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Tests

Regression coverage for the site, run on every push and pull request via
`.github/workflows/ci.yml`.

| File | Checks | Wired into |
|---|---|---|
| `smoke-http.mjs` | The static site image serves `/site/index.html`. | `npm test` |
| `e2e-pages.mjs` | Headless Chrome: home, blog index and a blog post load with no page errors. Fully offline, no backend needed. | `npm run test:e2e` / `test:all`, CI **e2e** job |
| `e2e-recognition.mjs` | Headless Chrome against a **live** analyser stack: uploads `tests/fixtures/handwriting-sample.jpg`, asserts a real report renders and shows recognition results. | `npm run test:recognition`, CI **e2e-recognition** job |

## Running locally

```bash
npm test                          # smoke-http.mjs
npm run test:regression:install   # once, downloads Chromium
npm run test:e2e                  # e2e-pages.mjs
```

`e2e-recognition.mjs` needs the real backend up first:

```bash
docker compose up -d --wait
VAHINI_BASE_URL=http://localhost:8080 npm run test:recognition
```

## Continuous integration

- **e2e** — installs Chromium, runs `test:e2e` against the marketing site.
- **e2e-recognition** — builds the analyser submodule's image, brings up the
  full Docker stack, and runs `test:recognition` against it.

The analyser submodule (`vahinitech/20factor-analyser`) has its own CI for its
internal unit/lint tests; this repo's CI only covers the site/analyser
integration.
