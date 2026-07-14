<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Staging to Production Deployment

This project now supports a clean two-step rollout:

- Stage first on `stage.vahinitech.com` via local port `127.0.0.1:3016`
- Cut over later to `vahinitech.com` via local port `127.0.0.1:3015`
- Bundle PP-OCRv5 into Docker and expose OCR at `/ocr` through the web container

The reverse proxy (Hestia/nginx on host) should terminate TLS and proxy to these localhost ports.

`analyser/` is a git submodule (pinned to a `vahinitech/20factor-analyser`
release tag). `deploy/release.sh` and `deploy/prewarm-models.sh` both run
`git submodule update --init --recursive` before touching Docker, so a plain
`git pull` on the server (which does **not** fetch submodule content on its
own) is enough -- you don't need to run the submodule command by hand. Both
scripts fail fast with a clear error if `analyser/deployment/Dockerfile` is
still missing afterwards (network/auth issue reaching GitHub).

## Files

- `deploy/docker-compose.stage.yml`
- `deploy/docker-compose.prod.yml`
- `deploy/release.sh`
- `deploy/http-redirect.vahinitech.com.nginx.conf` -- the one shared port-80
  block (ACME challenge + redirect to HTTPS) for vahinitech.com and every
  subdomain. Apply once; new subdomains don't need their own copy.
- `deploy/snippets/tls-vahinitech.conf` -- shared TLS config (cert paths,
  protocols, ciphers, security headers), `include`d by every HTTPS vhost below.
- `deploy/stage.vahinitech.com.nginx.conf`
- `deploy/vahinitech.com.nginx.conf`
- `deploy/api.vahinitech.com.nginx.conf` -- friendlier host name for the same
  recognition API (`/ocr`, `/report-python`, `/analyze-vl`) that already runs
  behind vahinitech.com; no separate backend, just a dedicated vhost that
  proxies through the same `web` container on `127.0.0.1:3015`.

## 1) Deploy Staging

From repo root:

```bash
./deploy/release.sh stage
```

Verify on server:

```bash
curl -I http://127.0.0.1:3016/site/index.html
curl -I http://127.0.0.1:3016/analyser/analyser.html
curl http://127.0.0.1:3016/ocr/health
```

Apply host nginx vhost using `deploy/stage.vahinitech.com.nginx.conf` (plus
`deploy/http-redirect.vahinitech.com.nginx.conf` and
`deploy/snippets/tls-vahinitech.conf` if not already in place -- see
"HTTPS certificate renewal" below) and reload nginx.

## 2) Validate Staging Domain

Validate these before cutover:

- Home page, product pages, blog pages
- `analyser/analyser.html`
- Asset links and cache headers
- Browser console errors

## 3) Cut Over to Production

Deploy production container:

```bash
./deploy/release.sh prod
```

Apply host nginx vhost using `deploy/vahinitech.com.nginx.conf` (plus
`deploy/http-redirect.vahinitech.com.nginx.conf` and
`deploy/snippets/tls-vahinitech.conf` if not already in place -- see
"HTTPS certificate renewal" below) and reload nginx.

Verify:

```bash
curl -I http://127.0.0.1:3015/site/index.html
curl -I http://127.0.0.1:3015/analyser/analyser.html
curl http://127.0.0.1:3015/ocr/health
```

## 4) Rollback

If production check fails:

1. Restore previous nginx vhost and reload nginx.
2. Keep previous web container running on prior port.
3. Check logs:

```bash
docker compose -f deploy/docker-compose.prod.yml logs --tail=120 web
```

## 5) HTTPS certificates: one wildcard cert for every subdomain

vahinitech.com's DNS is on **Cloudflare**, so instead of a separate
Let's-Encrypt certificate per subdomain (the old approach, HTTP-01/webroot,
one cert per domain), this uses a **single wildcard certificate**
(`vahinitech.com` + `*.vahinitech.com`) via DNS-01 through Cloudflare's API.
One cert, one renewal, covers `vahinitech.com`, `www.`, `stage.`, `api.`, and
any subdomain added in the future with zero further cert work.

### One-time setup

1. **Install the Cloudflare DNS plugin** (matches however certbot itself is
   installed): `apt install python3-certbot-dns-cloudflare` (apt) or the
   equivalent `certbot-dns-cloudflare` package for snap/pip installs.
2. **Create a scoped Cloudflare API token**: dashboard -> My Profile -> API
   Tokens -> "Edit zone DNS" template, scoped to **only** the vahinitech.com
   zone. Do not use the Global API Key -- see
   `deploy/certbot/cloudflare-credentials.ini.example` for exactly where it
   goes and why the narrower scope matters.
3. **Issue the wildcard cert**:
   ```bash
   sudo deploy/certbot/setup-wildcard-cert.sh
   ```
   This requests `vahinitech.com` + `*.vahinitech.com` in one certificate
   (named `vahinitech-wildcard`), which is what
   `deploy/snippets/tls-vahinitech.conf` already points at.
4. **Install the shared nginx pieces** (once): copy
   `deploy/snippets/tls-vahinitech.conf` to nginx's snippets directory (e.g.
   `/etc/nginx/snippets/tls-vahinitech.conf`) and
   `deploy/http-redirect.vahinitech.com.nginx.conf` alongside the other
   vhosts, then `nginx -t && systemctl reload nginx`.
5. **Wire up auto-renewal's nginx reload** (same as before this was a
   wildcard cert -- this step doesn't change):
   ```bash
   sudo deploy/certbot/install-renew-hook.sh
   ```

### Why this is still "automatic" renewal, not a step backward

Wildcard certs normally *require* manual work every renewal, because
Let's Encrypt only issues them via DNS-01 (proving ownership with a
temporary `_acme-challenge` TXT record) -- not the HTTP-01/webroot method
plain per-domain certs use. `certbot-dns-cloudflare` closes that gap: it
creates and removes that TXT record automatically through Cloudflare's API
during `certbot renew`, so the OS-level renewal timer/cron (already running
if certbot was installed the normal way -- confirm with
`sudo deploy/certbot/check-renew-timer.sh`) renews this wildcard cert exactly
as unattended as the old per-domain ones were.

### Retiring the old per-domain certs

Before the wildcard cert, `vahinitech.com`, `stage.vahinitech.com` and
`api.vahinitech.com` (if issued) each had their own HTTP-01 certificate.
Once the wildcard cert is confirmed serving correctly on all of them:

```bash
certbot certificates                    # list what's tracked
certbot delete --cert-name vahinitech.com
certbot delete --cert-name stage.vahinitech.com
certbot delete --cert-name api.vahinitech.com   # only if it was ever issued
```

Not required immediately -- they just keep renewing harmlessly alongside the
wildcard cert until removed.

### Adding a new subdomain

With the wildcard cert in place, a new `<name>.vahinitech.com` needs **no
certificate work at all** -- `*.vahinitech.com` already covers it. Just:

1. Point DNS for it at this host's IP (`110.172.148.13`), unless a wildcard
   `*.vahinitech.com` DNS record already exists on Cloudflare, in which case
   even this step is done.
2. Add a short nginx vhost for it under `deploy/` with only the routing
   logic (copy `deploy/api.vahinitech.com.nginx.conf` as the template --
   `include snippets/tls-vahinitech.conf;` and no cert paths, no port-80
   block needed), and apply it on the host.

That's it -- no `certbot certonly`, no new renewal-hook setup.

## Notes

- Current server already has a service on `127.0.0.1:3015`, so staging uses `3016` to avoid collision.
- Keep API and OCR services isolated from this static site deployment.
- Current staging web container proxies `/ocr` to the existing OCR container `vahini-vd-ocr` on Docker network `app_default`.
- Host-persisted Paddle model cache is stored at `/home/vishnu/paddle-models/.paddlex`.