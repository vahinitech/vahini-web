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
       services/persist-api   CORS allowlist, OCR-text sanitization +
                              SSRF-safe URL guard (lib/textguard.js)
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
| Per-IP request floods | `edge_perip` 30 r/s, burst 120 (marketing/stage vhosts, port-80 redirects) |
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

All limits are env-tunable in `deploy/docker-compose.{stage,prod}.yml`.
Throttled clients get `429` + `Retry-After`.

## SSRF posture

**There is no server-side SSRF sink today, by design.** The relevant facts:

- No server-side code fetches a user-supplied URL. Images reach the analyser
  as multipart/base64 uploads, never as URLs; the analyser's `vl_analyze` is
  classic computer vision, not a model that dereferences remote content.
- nginx `proxy_pass` targets are all **fixed internal upstreams** (`analyser`,
  `persist`) — never built from a request variable, so the reverse proxy
  can't be coerced into an open proxy.
- The one URL the API accepts (`persist` report `url`) is **stored, never
  fetched**, and is now run through an SSRF-safe validator anyway
  (`services/persist-api/lib/textguard.js › validatePublicUrl`): it rejects
  loopback, private (RFC 1918), CGNAT, link-local (incl. the
  `169.254.169.254` cloud-metadata address), unique-local IPv6, IPv4-mapped
  IPv6, `file:`/`gopher:` schemes, embedded credentials and `*.internal`
  names. A rejected URL is blanked and the reason recorded.

If a fetch is ever added (e.g. "analyse an image by URL"), it **must** gate on
`validatePublicUrl` *and* pin the resolved IP against DNS-rebinding — the
validator alone is necessary but not sufficient once you actually dereference.

## OCR attack surface

The analyser turns a user-supplied image into text, which opens a class of
attacks distinct from web floods. Honesty matters here: some of these are
mitigable at our boundary, some belong to the OCR **model** (the analyser
submodule, a separate repo), and one isn't our threat at all. The table says
which is which; don't read a checkmark where there isn't one.

| Attack | Where it's mitigable | What we do |
|---|---|---|
| **Homoglyph** (Cyrillic `а` for Latin `a`) | Text layer — **ours** | `sanitizeText` NFKC-normalizes (folds most confusables) and **flags** any token mixing scripts; the flag rides with the stored record |
| **Unicode diacritic stacking** (Zalgo) | Text layer — **ours** | zero-width chars stripped; combining marks capped at 2 per base char, so a stacked blob collapses to readable text before storage/echo |
| **Visual prompt injection** ("ignore all previous instructions" in the image) | Prompt-assembly layer — **ours for any downstream LLM** | `sanitizeText` detects and flags injection markers; `wrapUntrustedForPrompt` delimits OCR text as **untrusted data, never instructions**, and neutralizes backticks. No LLM consumes OCR output on the default path today, so this is defense-in-depth for the optional VLM backend |
| **Adversarial pixel perturbations** (invisible watermark flips a letter) | **Model layer — submodule, not here** | Cannot be undone from output text. Belongs in the OCR engine (input preprocessing / adversarial-robust models). We flag it as a known limitation, not a solved problem |
| **Screen-scraping malware** (Trojan OCRs a victim's photo library) | **The victim's device — not our server** | Out of scope entirely. No server-side control exists over malware on someone else's phone |

Sanitization runs at the **persist boundary** (`generated-report`), which is
the point where OCR-derived text becomes durable and could later feed a
report renderer, an analyst, or a model. The browser's reflected-XSS risk from
recognized text is separately covered by the strict CSP (`object-src 'none'`,
no third-party script origins).

What this explicitly does **not** claim: it does not restore OCR accuracy
against a determined adversarial-perturbation attack (that's the model's job),
and the injection detector is a flag-and-delimit safeguard, not a complete
jailbreak filter — the durable defense is the architectural rule that OCR text
is always data, never instructions.

## External scanning (`make security-scan`)

`tools/security-scan.sh <host>` probes a host **we operate** from the outside:

- **nmap** open-port scan — flags anything answering beyond 80/443 (a stray
  SSH, database or debug port is a finding). `--quick` (common ports) or full
  (all 65535).
- **testssl.sh** — confirms from outside what the TLS snippet sets: TLS 1.2/1.3
  only, forward-secret ciphers, HSTS, no known protocol bugs (Heartbleed, CCS,
  insecure renegotiation).
- **curl header cross-check** — fast pass/fail on the security headers, works
  even when testssl is absent.

Authorized targets only: the script refuses anything outside the
`*.vahinitech.com` allowlist (override with `VAHINI_SCAN_ALLOW` or
`--i-have-authorization` for a written-authorized engagement). CI runs it via
`.github/workflows/security-scan.yml` — **manual dispatch + weekly cron**, not
on every push, because it probes live infrastructure. Reports upload as an
artifact for triage.

## Testing

- `make security-test` — spins the real persist-api with tiny limits and
  proves floods, oversized bodies, cross-site posts, quota exhaustion and
  path leaks are refused (`tests/security-abuse.test.mjs`, 15 checks), then
  runs the OCR sanitizer + SSRF-guard unit tests
  (`tests/ocr-input-guard.test.mjs`, 31 checks).
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
