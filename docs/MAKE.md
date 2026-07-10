<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# The Makefile: one command for everything

Every routine operation on this repo — running the full stack locally,
cleaning Docker, preflighting a deployment, releasing, and managing TLS
certificates — is a `make` target. Run `make` (or `make help`) to see
the live list; this page explains when and how to use each one.

```bash
make e2e     # the one-liner: start everything, prove it works end to end
```

---

## 1 · Local full stack (website + 20-factor analyser + persist)

| Target | What it does |
|---|---|
| `make up` | Initialises the pinned `analyser/` submodule, builds and starts **all** containers (`web` nginx, `analyser`, `persist`), waits until every service answers through the proxy, prints the URLs. |
| `make smoke` | Curls the site pages, the analyser app, `/ocr/health` and `/persist/health` **through nginx on :8080** — a pass proves the whole wiring, not just that containers started. |
| `make e2e` | `up` + `smoke` in one shot. |
| `make down` | Stop all containers. Model-cache and upload **volumes are kept**. |
| `make restart` | `down` + `up`. |
| `make ps` | Container status + health columns. |
| `make logs` | Follow all logs. One service: `make logs S=analyser`. |
| `make build` | Build images without starting anything. |
| `make wait` | Just the health-wait loop (used by `up`, callable alone). |

After `make up`:

- http://localhost:8080/site/index.html — marketing site
- http://localhost:8080/analyser/analyser.html — the 20-factor analyser
- http://localhost:8080/ocr/health — OCR engine health
- http://localhost:8080/persist/health — persist API health

**First run is slow.** The analyser downloads OCR models on first
start; the wait loop allows `WAIT_TRIES × WAIT_DELAY` = 120 × 5s = 10
minutes and prints a dot per attempt. If the stack never becomes
healthy it prints `ps` plus the last 40 log lines from each container
and exits non-zero.

Useful overrides (all have sane defaults):

```bash
make up WAIT_TRIES=240              # slower machine / first model download
make smoke WEB_URL=http://host:8080 # point smoke at another machine
make up COMPOSE=docker-compose      # legacy compose v1 binary
```

## 2 · Front-end-only loop (no Docker)

| Target | What it does |
|---|---|
| `make site` | Static server on http://127.0.0.1:4173 — instant HTML/CSS/JS loop. The analyser app is **not** served here (it lives in its own container). |
| `make test` | Node test suite: `npm test` (HTTP smoke) + `npm run test:e2e` (Playwright page checks). Run `npm install` and `npm run test:regression:install` once first. |
| `make security-test` | Abuse-resistance suite for the persist API: rate limits, daily quotas, CORS allowlist, body-size caps, no path leakage (`tests/security-abuse.test.mjs`). The full mitigation model is documented in [SECURITY.md](SECURITY.md). |

## 3 · Docker housekeeping

| Target | What it does | Destroys |
|---|---|---|
| `make docker-clean` | Stop the stack, remove its **local** images. | images only |
| `make docker-prune` | Remove **every** `vahini/*` image (local, stag, prod tags), dangling layers, and the Docker build cache. | images + build cache |
| `make clean` | `down` + delete **volumes** + local images. | images + **model cache + persisted uploads/reports/feedback** |

Rule of thumb: reclaiming disk after builds → `docker-prune`;
"start truly fresh, redownload models, lose local uploads" → `clean`.

## 4 · Deployment (run on the server)

| Target | What it does |
|---|---|
| `make deploy-check` | **Preflight.** Asserts every file a deployment needs is present (Dockerfiles, both compose files, container + host nginx configs, TLS snippet, release/prewarm scripts, certbot scripts, core site assets), that all shell scripts are executable, and — when Docker is available — that each compose file parses (`compose config -q`). Exits non-zero listing every problem. |
| `make release-stag` | `deploy-check`, then `deploy/release.sh stag`: sync submodule, build, roll out, health-check the staging stack. |
| `make release-prod` | Same for production. |
| `make prewarm-stag` / `make prewarm-prod` | Pre-download OCR models into that environment's model volume, so the first real request isn't slow. |

`release-*` refuses to run if `deploy-check` fails, so a missing config
file is caught before anything is rebuilt or restarted.

## 5 · TLS certificates (host-level, need sudo)

Certificates are deliberately **not** containers: the certbot renewal
timer and the nginx-reload hook run on the host (full design in
[DEPLOY-STAG-PROD.md](DEPLOY-STAG-PROD.md)). One wildcard cert
(`vahinitech.com` + `*.vahinitech.com`, DNS-01 via Cloudflare) covers
every subdomain.

| Target | When to use it |
|---|---|
| `make certbot-setup` | **Once per server.** Issues the wildcard cert. Needs `deploy/certbot/cloudflare-credentials.ini` (copy the `.example`, insert a zone-DNS-edit token, `chmod 600`). |
| `make certbot-hook` | **Once per server.** Installs the deploy hook that reloads nginx after each renewal. |
| `make certbot-check` | Verify the systemd renew timer + hook are in place. |
| `make cert-status` | Show every certificate's domains and expiry dates, then verify the renew timer. Run this when you wonder "are we about to expire?" |
| `make cert-renew-dry` | Rehearse a real renewal end to end (Cloudflare DNS-01 challenge + reload hook) without changing anything. Safe any time; do it after infrastructure changes. |
| `make cert-renew` | Renew now. certbot only replaces certs within 30 days of expiry (Let's Encrypt rate limits make forcing pointless); nginx reloads via the hook. Normally the systemd timer does this for you — this target is for "I want it renewed right now" moments. |

## 6 · Typical days

**Working on the site end to end**

```bash
make e2e            # morning: bring it all up, prove it works
make logs S=web     # watch nginx while clicking around
make down           # evening
```

**Machine low on disk**

```bash
make docker-prune   # drop all vahini images + build cache, keep data
```

**Release day (on the server)**

```bash
make deploy-check   # preflight — free to run, catches missing files
make release-stag   # stage first
make release-prod   # then production
```

**Certificate worries**

```bash
make cert-status     # what do we have, when does it expire?
make cert-renew-dry  # would renewal work? (safe)
make cert-renew      # renew whatever is due right now
```
