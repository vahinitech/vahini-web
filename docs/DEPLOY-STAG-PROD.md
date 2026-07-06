<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Staging to Production Deployment

This project now supports a clean two-step rollout:

- Stage first on `stag.vahinitech.com` via local port `127.0.0.1:3016`
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

- `deploy/docker-compose.stag.yml`
- `deploy/docker-compose.prod.yml`
- `deploy/release.sh`
- `deploy/stag.vahinitech.com.nginx.conf`
- `deploy/vahinitech.com.nginx.conf`

## 1) Deploy Staging

From repo root:

```bash
./deploy/release.sh stag
```

Verify on server:

```bash
curl -I http://127.0.0.1:3016/site/index.html
curl -I http://127.0.0.1:3016/analyser/analyser.html
curl http://127.0.0.1:3016/ocr/health
```

Apply host nginx vhost using `deploy/stag.vahinitech.com.nginx.conf` and reload nginx.

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

Apply host nginx vhost using `deploy/vahinitech.com.nginx.conf` and reload nginx.

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

## 5) HTTPS certificate renewal

`deploy/vahinitech.com.nginx.conf` and `deploy/stag.vahinitech.com.nginx.conf`
both point at standard certbot cert paths
(`/etc/letsencrypt/live/<domain>/{fullchain,privkey}.pem`) and already serve
the HTTP-01 challenge webroot at `/var/www/certbot`. Let's Encrypt certs are
valid 90 days, so this needs to auto-renew, not be reissued by hand every
quarter.

**The renewal check/schedule itself is not this repo's job.** Installing
certbot via `apt install certbot` (or `snap install certbot`) already sets up
its own systemd timer or `/etc/cron.d/certbot` entry that runs `certbot renew`
twice a day and only actually renews certs within their last 30 days of
validity — that's almost certainly already running on this host, since it's
how the current cert was issued in the first place. Confirm with:

```bash
sudo deploy/certbot/check-renew-timer.sh
```

**What's commonly missing, and what this repo adds:** a *deploy-hook* so
nginx actually reloads and starts serving the newly-renewed cert. Without it,
certbot renews the files on disk correctly, but the running nginx worker
keeps the old certificate loaded in memory until nginx is next restarted —
so the renewal "worked" but nobody's HTTPS connection sees the new cert until
someone happens to restart nginx for an unrelated reason. Install it once:

```bash
sudo deploy/certbot/install-renew-hook.sh
```

This installs `deploy/certbot/reload-nginx-hook.sh` to
`/etc/letsencrypt/renewal-hooks/deploy/`, where certbot automatically runs it
after every successful renewal (for either domain), and verifies the whole
path end-to-end with `certbot renew --dry-run` (no real certs touched, no
rate limits hit).

Initial issuance (already done for the current cert; kept here for the next
time a new subdomain needs one):

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d vahinitech.com -d www.vahinitech.com
sudo certbot certonly --webroot -w /var/www/certbot -d stag.vahinitech.com
```

## Notes

- Current server already has a service on `127.0.0.1:3015`, so staging uses `3016` to avoid collision.
- Keep API and OCR services isolated from this static site deployment.
- Current staging web container proxies `/ocr` to the existing OCR container `vahini-vd-ocr` on Docker network `app_default`.
- Host-persisted Paddle model cache is stored at `/home/vishnu/paddle-models/.paddlex`.