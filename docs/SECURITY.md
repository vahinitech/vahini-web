<!-- SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
     © 2026 Vahini Technologies. All rights reserved. -->

# Security & abuse mitigation

How vahinitech.com defends itself against request floods, scripted abuse,
scanners and common web attacks — what each layer does, where its knobs
live, and how to tune or test it.

## The layered model

Requests pass through four layers; each one sheds a class of abuse so the
next only sees plausible traffic:

```
internet
   │
   ▼
[0] upstream / CDN            volumetric L3/L4 DDoS (optional, see below)
   │
   ▼
[1] host nginx (TLS edge)     gross per-IP floods, TLS hygiene, HSTS
   │   deploy/*.nginx.conf + deploy/snippets/*
   ▼
[2] web container nginx       per-endpoint rate limits, security headers,
   │   deploy/nginx.conf +    CSP, scanner/probe blocking, size caps
   │   deploy/nginx-security.conf
   ▼
[3] services                  persist-api's own rate limits, daily quotas,
       services/persist-api   CORS allowlist; analyser behind heavy zone
```

An honest caveat up front: **nginx cannot stop a true volumetric DDoS.**
If an attacker saturates the server's uplink with tens of Gbps of L3/L4
traffic, packets die before nginx sees them. The layers here stop what an
origin server *can* stop: L7 floods, scripted scraping, brute-force loops,
slowloris, disk-fill abuse, and the constant background scanner noise.
For volumetric protection put a CDN/scrubbing layer in front (Cloudflare
free tier already absorbs L3/L4 and most L7 floods; then restrict origin
port 443 to Cloudflare's published IP ranges so attackers can't bypass it).

## Layer 1 — host edge (TLS termination)

Files: `deploy/snippets/http-context-vahinitech.conf` (zones — **install at
`/etc/nginx/conf.d/00-vahinitech-limits.conf` on the host**, required before
reloading vhosts), `deploy/snippets/tls-vahinitech.conf`, `deploy/*.nginx.conf`.

| Concern | Mitigation |
|---|---|
| Per-IP request floods | `edge_perip` 30 r/s, burst 120 (marketing/stag vhosts, port-80 redirects) |
| API hammering | `edge_api` 30 r/min, burst 15 on api.vahinitech.com |
| Connection exhaustion | `edge_conn`: 60 parallel connections/IP (20 on the API vhost) |
| TLS downgrade / weak suites | TLS 1.2+13 only, forward-secret AEAD ciphers only |
| Handshake floods | shared session cache (resumption is far cheaper than full handshakes) |
| Protocol downgrade to HTTP | HSTS, 180 days, includeSubDomains |
| Version fingerprinting | `server_tokens off` |

Rejected requests get **429** so legitimate clients back off instead of
retrying as if the site were down.

## Layer 2 — web container nginx

Files: `deploy/nginx-security.conf` (http context: zones, maps, timeouts),
`deploy/nginx.conf` (server block: per-location enforcement),
`deploy/nginx-headers.inc` (browser security headers). All three are baked
into the image by the `Dockerfile`, which also runs `nginx -t` at build time
so a broken config fails the build, not the rollout.

**Real client IP.** The container only ever sees the docker bridge address,
so all zones would otherwise throttle "one client". `set_real_ip_from`
(private ranges only) + `real_ip_header X-Real-IP` restore the true client
address that the host edge asserts. A client can't spoof it — only private
peers are trusted.

**Request classes.** Four zones matched to what legitimate traffic actually
looks like per endpoint:

| Zone | Rate | Applied to | Rationale |
|---|---|---|---|
| `perip_pages` | 12 r/s, burst 30 | default (HTML, redirects, health) | humans click a few links/s |
| `perip_assets` | 60 r/s, burst 120 | css/js/img/fonts/pdf | one page load pulls dozens at once |
| `perip_heavy` | 12 r/min, burst 8 | `/ocr`, `/analyze-vl`, `/report-python` | CPU-bound ML inference — the cheapest way to DoS the box; a real scan makes a handful of calls |
| `perip_persist` | 20 r/min, burst 10 | `/persist/*` | disk-writing endpoints |

Plus `limit_conn` 40 parallel connections/IP and slow-client (slowloris)
timeouts: headers within 10 s, body reads 20 s, `reset_timedout_connection`.

**Attack-surface reduction.**

- `.dockerignore` whitelists what ships: the image contains `/site` and the
  nginx configs only — `deploy/`, `services/`, `tools/`, `tests/`,
  `node_modules/`, `Makefile`, `package.json` no longer land in the public
  web root (previously every one of them was downloadable).
- Belt-and-braces `location` blocks return 404 for those prefixes anyway.
- WordPress/PHP/scanner probe paths (`wp-admin`, `xmlrpc.php`, `.env`,
  `*.php`, …) answer **444** — connection closed, nothing rendered.
- Dot-files are denied (except `/.well-known/`).
- Known scanner user-agents (sqlmap, nikto, masscan, …) get 444. A tripwire
  for background noise, not a defense against a deliberate attacker.
- `/.well-known/security.txt` (RFC 9116) tells researchers where to report:
  security@vahinitech.com.

**Browser security headers** (`deploy/nginx-headers.inc`): `nosniff`,
`X-Frame-Options SAMEORIGIN`, `Referrer-Policy strict-origin-when-cross-origin`,
a restrictive `Permissions-Policy`, and a **per-path Content-Security-Policy**
via a `map` in `nginx-security.conf`:

- Marketing pages: `default-src 'self'` plus exactly the third parties the
  site uses (Google Fonts, consent-gated GTM/GA4, unpkg fallback, YouTube
  nocookie embeds). `object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'self'`.
- `investor.html` / `pitch-deck.dc.html` additionally get `'unsafe-eval'`
  (the notebook runtime compiles pages with `new Function`).
- Proxied services (analyser app, JSON APIs) get **no** CSP from us — they
  own their output.

nginx gotcha encoded in the include file: `add_header` in a location cancels
*all* inherited headers, so any location that sets its own header (e.g. the
static-asset cache header) re-includes `vahini-headers.inc`.

## Layer 3 — persist-api (`services/persist-api/server.js`)

The one service that writes attacker-controlled bytes to disk. Its own
defenses hold even if the proxy layer regresses or something on the docker
network hits it directly:

| Attack | Defense |
|---|---|
| Request floods | per-IP sliding window: 120 req / 40 writes per 10 min (`RATE_MAX_REQUESTS`, `RATE_MAX_WRITES`, `RATE_WINDOW_MS`) |
| Disk-fill (patient attacker) | per-IP daily byte quota, 200 MB (`QUOTA_BYTES_PER_DAY`) |
| Oversized bodies | per-endpoint caps — feedback 256 KB, report 5 MB, upload 40 MB — rejected via Content-Length before upload when declared, or aborted mid-stream (connection dropped, not drained) |
| Cross-site abuse (any website making its visitors POST to us) | CORS allowlist (`PERSIST_ALLOWED_ORIGINS`); unknown-origin browser POSTs get 403; no more `Access-Control-Allow-Origin: *` |
| IP spoofing to dodge limits | `X-Real-IP` trusted only from private (proxy) peers |
| Information disclosure | responses return ids only — server filesystem paths removed from the API; 5xx details logged server-side, never echoed |
| Slow clients | `headersTimeout` 15 s, `requestTimeout` 120 s |

All limits are env-tunable in `deploy/docker-compose.{stag,prod}.yml`.
Throttled clients get `429` + `Retry-After`.

## Testing

- `make security-test` — spins the real persist-api with tiny limits and
  proves floods, oversized bodies, cross-site posts, quota exhaustion and
  path leaks are refused (`tests/security-abuse.test.mjs`, 15 checks).
- `docker build .` — fails on any nginx config error (`RUN nginx -t`).
- `make deploy-check` — asserts every security config file exists before a
  release (they're part of `DEPLOY_FILES`).
- After deploying, spot-check from a shell:
  `for i in $(seq 40); do curl -so /dev/null -w "%{http_code}\n" https://vahinitech.com/ocr -d x=1; done`
  — should turn into 429s after the burst.

## Tuning

Symptoms and the knob to turn:

- **Legitimate users see 429 on normal browsing** → raise `perip_pages`
  rate or burst in `deploy/nginx-security.conf`, rebuild the image.
- **Analyser scans fail under parallel use from one office IP** (NAT: many
  humans, one IP) → raise `perip_heavy` burst first (burst absorbs bursts;
  rate defends the CPU), then the rate.
- **persist 429s for real users** → raise `RATE_MAX_WRITES` /
  `QUOTA_BYTES_PER_DAY` env vars in the compose file — no rebuild needed.
- **New third-party script/font on the site** → extend the CSP in
  `deploy/nginx-security.conf` (both map branches if notebook pages use it
  too). Browser console shows exactly what CSP blocked and why.
- **New subdomain vhost** → include the edge `limit_req`/`limit_conn` lines
  and the TLS snippet; the zones file already covers any `*.vahinitech.com`.

## Optional next steps (not yet in place)

- **CDN/scrubbing in front of the origin** for volumetric DDoS (see caveat
  above) — the only meaningful defense nginx can't provide itself.
- **fail2ban** on the host, reading nginx logs: ban IPs that accumulate
  429/444 responses at the firewall so repeat abusers stop consuming even
  the cheap rejections. Suggested jail: filter on ` 429 ` and ` 444 ` in
  access logs, `maxretry 30`, `findtime 60`, `bantime 3600`.
- **API keys for the public recognition API** once api.vahinitech.com gets
  external consumers — per-key quotas beat per-IP quotas the moment real
  customers share NAT IPs (see site/developers.html plans).
