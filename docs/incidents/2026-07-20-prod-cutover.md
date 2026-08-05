<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Incident report: vahinitech.com production cutover (2026-07-20)

**What happened:** cutting `vahinitech.com` over from the old `vahini-vd-*`
stack to web-live (this repo, since renamed `vahini-web`; the historical name
is kept below because it was the literal Compose project label at the time)
surfaced two real, pre-existing infrastructure bugs and one
mistake made while fixing the first one. Staging went down for several
minutes mid-cutover; production itself never went down, but briefly served
OCR requests through the wrong backend after the cutover completed. Both are
fixed. This document is the record of what happened, why, and what to check
first next time, so the same two hours don't happen again.

**Status:** resolved. `vahinitech.com` and `stag.vahinitech.com` are both on
web-live and verified working end-to-end (site, analyser, OCR, report
generation, evidence crops).

## Timeline

1. Staged the cutover correctly: staging was already running and healthy on
   `127.0.0.1:3016` before we touched anything, confirmed via curl + browser.
2. Stopped the old prod container (`vahini-vd-web`, freeing `127.0.0.1:3015`)
   and ran `./deploy/release.sh prod`. It succeeded — new prod containers
   came up healthy.
3. **Incident 1**: the same `release.sh prod` run silently destroyed the
   running staging containers. `stag.vahinitech.com` started returning `502`.
4. Recovered staging with `docker compose -p vahini-stage -f
   deploy/docker-compose.stage.yml up -d`, confirmed prod was untouched
   throughout, then filed and merged a real fix (below) instead of just
   moving on.
5. Verified the actual production cutover worked: homepage, analyser, and a
   real end-to-end report generation (`POST /report-python` → `200`) all
   confirmed via server logs from a real user session.
6. **Incident 2**: `/ocr/health` on the public domain returned `404`/`405`
   inconsistently, while the same path against the container directly
   worked. Traced to a leftover Hestia nginx fragment silently routing all
   `/ocr*` traffic to the old, separate OCR container instead of the new
   site's own bundled OCR path.
7. First attempt to disable that fragment (a file rename) didn't work — see
   "Mistake" below. Second attempt did.
8. A follow-up report of broken "reference crop" images in the analyser
   report turned out to be a symptom of incident 2, not a new bug — verified
   by hitting the analyser's Python backend directly (bypassing every proxy
   layer) and proving both `/report-python` and `/analyze-vl` already
   returned real, valid crop image data. Confirmed fixed after a fresh
   browser test.

## Incident 1: Compose project-name collision destroyed staging

**Root cause:** neither `deploy/docker-compose.stage.yml` nor
`deploy/docker-compose.prod.yml` declared an explicit Compose project
`name:`. Docker Compose defaults an unnamed project to the *invoking
directory* — both files live in the same repo checkout, so both resolved to
the same default project (`web-live`). Because both files use identical
service keys (`web`, `persist`, `analyser`), Compose tracks "its" containers
by `project + service` label, **not** by the `container_name:` override each
file sets. So `release.sh prod`'s `up -d --remove-orphans` found containers
already registered under `project=web-live, service=web/persist/analyser`
(the staging containers, created earlier under the same default project) and
recreated them to match prod's definition — i.e. destroyed them.

This was symmetric risk: the next unmodified `release.sh stage` run would
just as easily have clobbered prod.

**Fix:** [PR #26](https://github.com/vahinitech/vahini-web/pull/26) adds an
explicit `name:` to all three compose files (`vahini-stage`, `vahini-prod`,
`vahini-local`), so each environment gets its own isolated project namespace
regardless of invoking directory. `deploy/release.sh` needed no change — it
never passed `-p`.

**Follow-up still open:** the prod containers currently running were created
*before* this fix, so they're still labeled under the old default project.
The next real `release.sh prod` run needs `docker stop && docker rm` on the
three `vahini-*-prod` containers first, so Compose can recreate them cleanly
under `vahini-prod` instead of hitting a `container_name` conflict. Documented
in `docs/DEPLOY-STAGE-PROD.md`'s Notes section — don't do it as a standalone
action, only as part of the next planned deploy.

## Incident 2: stale Hestia `/ocr` override hijacked production OCR traffic

**Root cause:** this server runs Hestia Control Panel, which manages nginx
per-domain via `/etc/nginx/conf.d/domains/<domain>.ssl.conf`, itself
including wildcard-matched fragment files under
`/home/<hestia-user>/conf/web/<domain>/`. One such fragment,
`nginx.ssl.conf_ocr`, dated from the 2026-05-30 repoint to the old
`vahini-vd-*` stack:

```nginx
location /ocr {
    proxy_pass http://127.0.0.1:8091;
    ...
}
```

This silently routed **every** `/ocr*` request on `vahinitech.com` to the
old standalone OCR container (`vahini-vd-ocr`, port `8091`) — nginx picks the
most specific prefix match, and `/ocr` beats the catch-all `location /`. It
had nothing to do with the new deployment; it simply kept being included the
whole time, invisible until we specifically went looking for it. Symptoms:
`/ocr/health` `404`'d (the old service doesn't implement that exact
sub-path), and real analysis-report evidence crops appeared blank/gray in
the browser (traced down to this in the section below).

**Fix:** disabled the fragment so `/ocr*` falls through to the same
catch-all every other path already uses, which correctly reaches the new
container's own bundled OCR handling.

### Mistake made while fixing this, and the actual lesson

The first fix attempt renamed the file to
`nginx.ssl.conf_ocr.disabled.<timestamp>` and reloaded nginx. **This did
not work** — `include .../nginx.ssl.conf_*;` is a *prefix* match, and the
renamed file still started with `nginx.ssl.conf_`, so it kept getting
included, unchanged. `nginx -t` and the reload both reported success (they
were testing/reloading the *same* active rule), which made the fix look
like it should have worked while it silently hadn't.

**How this was caught**: not by re-reading the include pattern carefully
enough up front, but by continuing to test post-reload and noticing the
`404` was unchanged — plus a secondary signal after the old backend
container (`vahini-vd-ocr`) was separately stopped: if the override had
truly been removed, a request to a *dead* upstream should have produced
`502 Bad Gateway`, not the same clean `404`. Getting the same `404`, not a
`502`, was the tell that the override was still active. That's the durable
lesson, not "read the glob more carefully" (true, but not repeatable
advice) — **when disabling a config file by rename, verify the new name
against the actual include/glob pattern before trusting `nginx -t`
success as proof the rule is gone.** `nginx -t`/reload only prove the
*current* file set parses cleanly; they say nothing about whether a
specific file you meant to exclude is still part of that set. The second
attempt renamed to `DISABLED.<timestamp>.nginx.ssl.conf_ocr` — moving the
distinguishing prefix to the *front* of the filename, so it structurally
cannot match a `nginx.ssl.conf_*`-style glob — and that one actually
worked, confirmed by both `/ocr/health` returning real JSON and the
container's own access log showing the request arriving.

## "Broken image cropping" — a real investigation that found no new bug

A follow-up report ("image cropping isn't working in the report") looked
like it could be a missing Python dependency in the analyser Docker image.
Investigation before touching any code:

- Traced the actual crop-generation path: `computer_vision.py`
  (`_crop_rgb`, `_to_data_url`, `_factor_region_map`) in
  `vahinitech/20factor-analyser`, called from both `/report-python` and
  `/analyze-vl` in `ppocr-server.py`.
- Found `pypdfium2` (used for PDF-upload decoding) is used in code but
  never declared in any `requirements*.txt` — a real gap, but checking the
  live container (`pip show pypdfium2`) showed it's present anyway, pulled
  in transitively at `5.12.1`. Not the cause here, but fragile — tracked as
  a follow-up (pin it explicitly; see `vahinitech/firmware`-side task
  tracking / open an issue in `20factor-analyser`).
- Proved the actual bug wasn't in the backend at all: ran real HTTP
  requests against `/report-python` and `/analyze-vl` **directly inside**
  `vahini-analyser-prod` (bypassing Hestia nginx, the web container's own
  nginx, and the Docker network hop — as close to the raw Python service as
  possible), decoded the returned crop images, and measured their pixel
  grayscale range. Both endpoints returned real, high-contrast image data
  (e.g. `82-254`, not a flat/narrow range) for a real test photo — proving
  the crop-generation code was never broken.
- Concluded (and confirmed via a fresh browser test) that the gray crops
  were a downstream symptom of Incident 2: the frontend's pipeline touches
  `/ocr` before/alongside `/analyze-vl`, so the stale override above was
  corrupting that flow too. Fixing Incident 2 fixed this as a side effect.

**Lesson**: when a symptom *looks* like a missing-dependency or
code-level bug, verify the actual data at the lowest possible layer
(straight into the backend process, past every proxy hop) before
assuming the application code is at fault. Two independently-confirmed
"the data is fine" results were worth more than continued code reading.

## Other things worth doing differently next time

- **Inventory the host before touching anything.** This session assumed a
  plain `/etc/nginx/sites-enabled/` + `certbot` layout at first, based on
  the repo's own deploy docs. The real server runs Hestia Control Panel
  (`/etc/nginx/conf.d/domains/`, per-domain fragment files, its own
  cert flow) hosting ~40 unrelated customer domains. Wasted a full
  round-trip discovering this the hard way. Run `nginx -T | head`, check for
  `/usr/local/hestia`, `/etc/apache2/conf.d/domains/`, or similar control-panel
  fingerprints *before* proposing any nginx changes on unfamiliar
  production infrastructure — especially shared/multi-tenant hosting boxes,
  where the blast radius of a mistake extends to other people's sites.
- **Don't assume Python/pip exist on a Docker host.** Diagnostic commands
  were first written assuming a host-level Python environment; the box is a
  pure Docker host with none. Target the right execution context (`docker
  exec` into the specific container) explicitly from the start, not as a
  correction after the first command fails.
- **Don't paste template placeholders into copy-paste commands.** A command
  containing `<some-real-image.jpg>` was pasted verbatim and predictably
  failed as a literal path. List real candidates first (`ls`), then give a
  fully-substituted command — never hand over a template expecting the
  placeholder to be swapped out correctly under time pressure.
- **Confirm the blast radius of "cleanup" actions during a live cutover
  before they happen, not after.** Mid-cutover, three old containers got
  stopped (`vahini-vd-ocr`, `vahini-vd-api`, `vahini-vd-postgres`) when only
  one (`vahini-vd-web`, to free its port) had been agreed. `vahini-vd-api`
  was independently confirmed to still be receiving live traffic shortly
  before this happened. It turned out to be harmless this time (fully
  reversible via `docker start`, and nothing broke) — but the sequencing
  should be: agree on exactly which containers stop and why, one at a time,
  before running the stop, not clean up opportunistically alongside an
  unrelated fix.
- **Keep a running baseline.** Capturing curl output (`200`, byte count,
  content-type) of the *old* production site before touching anything gave
  an unambiguous "did this actually change" signal at every later step, and
  cost one extra curl call. Worth doing for any cutover, not just this one.

## Reference: this server's Hestia layout (for next time)

- Nginx config: `/etc/nginx/conf.d/domains/<domain>.conf` (port 80) and
  `<domain>.ssl.conf` (port 443), auto-managed by Hestia. Both `include`
  wildcard fragment files from `/home/<hestia-user>/conf/web/<domain>/`
  (e.g. `nginx.ssl.conf_*`, `nginx.hsts.conf*`) — hand-edited overrides live
  there, not in the main per-domain file, and can be added/removed
  independently of Hestia's own regeneration.
- `vahinitech.com`'s Hestia account is `vahini25` — note this is just how
  Hestia organizes the *hosting account*, unrelated to which application is
  actually deployed behind it (as of 2026-05-30, `vahini25`'s nginx config
  proxies to the `vahini-vd-*` / now vahini-web Docker stack, not to anything
  running as the `vahini25` user).
- `include /etc/nginx/conf.d/*.conf;` **and**
  `include /etc/nginx/conf.d/domains/*.conf;` are both active (confirmed via
  `nginx -T | grep "include.*conf.d"`) — a loose file dropped directly in
  `conf.d/` (like `stag.vahinitech.com.conf`, added outside Hestia's normal
  per-domain flow) is picked up just as much as Hestia-managed domain
  files.
- No `certbot` CLI on this host — Hestia manages its own cert lifecycle;
  don't assume the generic Let's Encrypt tooling this repo's docs describe
  for a plain nginx box applies here without checking first.
- This host is shared: ~40 unrelated customer domains run through the same
  nginx and the same `/etc/nginx/conf.d/00-vahinitech-limits.conf`-style
  shared files would affect everyone if touched. Only ever edit
  `vahinitech.com`/`stag.vahinitech.com`-specific files.
