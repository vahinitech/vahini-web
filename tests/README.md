<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Tests

> **`smoke.test.html`, `print-vs-handwriting.test.html` and
> `regression-headless.mjs` are currently STALE.** They drive the in-browser
> `VahiniEngine`/`VahiniFactors`/`VahiniReport` scoring API that the
> `analyser/` submodule removed as of its v0.3 release (scoring now runs
> server-side — see `analyser/docs/BUILD.md`). They are not wired into
> `npm run test:all` or CI until rewritten against the live `/report-python`
> API. See each file's header comment for detail.

Browser-run smoke tests — no toolchain required. Open the file in a modern browser
(or the preview) and read the pass/fail panel.

| File | Checks |
|---|---|
| `smoke.test.html` *(stale)* | Loads the **packed engine bundle**, runs the demo analysis, and asserts the engine's public API, a rendered multi-page report, **no duplicate pages**, and that the **validity gate** + Dynamics handling behave in photo mode. |
| `print-vs-handwriting.test.html` *(stale)* | Mixed printed+handwritten filtering and report leakage checks using real local sample images from `samples/`. |

## How to run

Open `tests/smoke.test.html`. Each assertion shows ✓ (pass) or ✗ (fail) with a short reason.
A green summary banner means all checks passed.

For fast OCR/handwriting regression on local sample images (no manual upload each run):

1. Start a local static server from project root:

	`npx http-server . -p 4173 -c-1`

2. Open:

	`http://127.0.0.1:4173/tests/print-vs-handwriting.test.html`

3. Refresh after code changes to rerun checks against:

	- `samples/IMG_1100.jpeg` (mixed printed + handwritten)
	- `samples/IMG_1099.jpeg` (handwritten sample)

## Headless regression (terminal)

Run the same sample-image checks in headless Chromium and print PASS/FAIL in terminal:

1. Install browser once:

	`npm run test:regression:install`

2. Run checks:

	`npm run test:regression:headless`

These are intentionally lightweight, dependency-free regression checks for the highest-risk
report behaviours (the Fix-Spec items). Extend by adding more `assert(...)` calls in the file.

## Headless marketing-site check (`e2e-pages.mjs`)

Headless Chrome regression that drives the marketing pages fully offline (no
Python/paddle backend needed): home, blog index, a blog post.

Run it:

```
npm run test:regression:install   # once, downloads Chromium
npm run test:e2e                  # marketing pages load, no errors
npm run test:all                  # same as test:e2e today
```

## Live-backend recognition check (`e2e-recognition.mjs`)

Drives the real analyser app against a running stack (`docker compose up -d
--wait`) and asserts a report renders and shows recognition results for
`tests/fixtures/handwriting-sample.jpg`:

```
VAHINI_BASE_URL=http://localhost:8080 npm run test:recognition
```

## Continuous integration

`.github/workflows/ci.yml` runs on **every push and pull request**:

- **e2e** — installs Chromium, runs `test:e2e` against the marketing site.
- **e2e-recognition** — builds the analyser submodule's image, brings up the
  full Docker stack, and runs `test:recognition` against it.

The analyser submodule (`vahinitech/20factor-analyser`) has its own CI for its
internal unit/lint tests; this repo's CI only covers the site/analyser
integration.
