# Vahini — Website

**Proprietary © 2026 Vahini Technologies. All rights reserved.** See [LICENSE](LICENSE).

This repository holds the Vahini marketing website, the investor pages, the blog
and the printable deliverables.

The source is **public to read, but it is not open source.** Being able to see
this code does not grant a licence to copy, modify, redistribute or deploy it.
The one exception is the `analyser/` submodule, which is AGPL-3.0 and lives in
its own repository. See [LICENSE](LICENSE) for the exact terms.

We are not accepting outside code contributions to this repository. Bug reports
about the live site are welcome at info@vahinitech.com, and security issues at
security@vahinitech.com (see
[/.well-known/security.txt](https://vahinitech.com/.well-known/security.txt)).

> The 20-factor analyser engine is **open source** under the GNU AGPL-3.0 and
> lives in its own public repository:
> **https://github.com/vahinitech/20factor-analyser**
> The `analyser/` folder here is a **git submodule** pinned to that repository's
> latest release tag; it is licensed under AGPL-3.0 (see
> [analyser/LICENSE](analyser/LICENSE)). The submodule's own `backend/` and
> `frontend/` serve themselves — this repo never copies or vendors its files.
> Its architecture, CV/OCR algorithm and roadmap docs live in
> [`analyser/docs/`](analyser/docs/), not in this repo's `docs/` — don't
> duplicate them here, they'll just go stale (this repo doesn't own that code).

---

## Repository structure

```
site/         marketing website + blog (static; deploy this folder)
analyser/     git submodule -> vahinitech/20factor-analyser (AGPL-3.0), served at /analyser
deploy/       nginx vhosts + release scripts
docs/         this site's own deploy/persistence/blog/stall-demo docs
services/     the persist API (uploads/reports/feedback)
docker-compose.yml   local full stack (web + analyser OCR + persist)
```

Scratch/PII folders (`uploads/`, `samples/`, `archive/`, `screenshots/`) and
`.claude/` are git-ignored and never ship.

---

## Clone

This repo has a submodule, so clone with:

```bash
git clone --recurse-submodules <this-repo-url>
# or, if already cloned:
git submodule update --init
```

## Run it

One command runs everything (website + 20-factor analyser + persist),
waits for health, and prints the URLs:

```bash
make up          # build + start all containers, wait until healthy
make smoke       # prove every service answers through nginx
make e2e         # both of the above in one shot
make logs        # follow logs (one service: make logs S=analyser)
make down        # stop everything
make help        # every target, including release + certbot wrappers
```

- http://localhost:8080 -> marketing site
- http://localhost:8080/analyser/analyser.html -> the analyser

Without make, the equivalent is `docker compose up --build -d --wait`.
For front-end-only work with no Docker: `make site` (static server on :4173).

Every target (docker cleanup, `deploy-check` preflight, releases,
certificate status/renewal) is documented in [docs/MAKE.md](docs/MAKE.md).

To pull in a newer analyser release later:

```bash
cd analyser && git fetch --tags && git checkout <new-tag> && cd ..
git add analyser && git commit -m "chore: bump analyser submodule to <new-tag>"
```

### Staging / production

See `docs/DEPLOY-STAGE-PROD.md` for the full picture (host nginx vhosts,
wildcard cert setup, this server's Hestia Control Panel layout, rollback).
For a routine content/code update once that's already set up, on the
server:

```bash
cd ~/vahini-web   # or wherever this repo is cloned on the server
git checkout main
git pull origin main

./deploy/release.sh stage
# verify stag.vahinitech.com looks right (curl + a real browser pass),
# THEN:
./deploy/release.sh prod
```

Static site changes (anything under `site/`) are baked into the Docker
image at build time (`Dockerfile`'s `COPY . .`) — **`git pull` alone does
not update the running site.** `release.sh` always rebuilds the image and
redeploys the container, so it's the only step that actually ships a
change; a bare `git pull` with no `release.sh` run after it leaves the live
site exactly as it was.

This sequence is normally exactly two commands (stage, verify, prod) — no
extra steps. The one exception: after the Compose project-name fix
([#26](https://github.com/vahinitech/vahini-web/pull/26)), the very next prod
release needed a one-time manual `docker stop && docker rm` of the
old-labeled prod containers first, documented in
`docs/DEPLOY-STAGE-PROD.md`'s Notes section — that was a one-off migration
step for containers created before the fix existed, not a permanent part of
this routine.

---

## Change the website colour theme

1. Open `site/js/theme.config.js`.
2. Set `ACTIVE_THEME` to one of: `"space-teal"` (default), `"midnight-indigo"`,
   `"forest-emerald"`, `"ember-charcoal"`.
3. Reload.

Colours live only in `site/css/theme.css`.

---

## Contact

- Website: [vahinitech.com](https://vahinitech.com)
- General: info@vahinitech.com · Founder: vahinitechfirm@gmail.com
- Vahini Dual-IMU Sensor Pen: Indian Patent No. 584433, DPIIT-recognised

© 2026 Vahini Technologies.
