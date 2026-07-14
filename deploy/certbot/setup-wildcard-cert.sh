#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
#
# One-time: issue a single wildcard certificate covering vahinitech.com AND
# every current/future first-level subdomain (*.vahinitech.com), via DNS-01
# through the Cloudflare API. This replaces needing a separate HTTP-01
# certificate (and a separate deploy/*.nginx.conf cert path) per subdomain.
#
# Why DNS-01: Let's Encrypt only issues wildcard certs via DNS-01 (proving
# ownership by creating a temporary _acme-challenge TXT record), not the
# HTTP-01/webroot method the existing per-domain certs use. certbot-dns-cloudflare
# creates/removes that TXT record automatically through Cloudflare's API, so
# renewal (certbot renew, already running via the host's own timer/cron) stays
# fully automatic -- no manual DNS step every 90 days.
#
# Note: *.vahinitech.com covers exactly one label of subdomain
# (api.vahinitech.com, stage.vahinitech.com, ...) but NOT the bare apex
# (vahinitech.com) and NOT two-level subdomains (foo.bar.vahinitech.com) --
# that's why both -d flags below are needed.
#
# Prerequisites:
#   1. apt install python3-certbot-dns-cloudflare  (or the equivalent for
#      however certbot itself was installed -- snap/pip need the matching
#      certbot-dns-cloudflare package instead)
#   2. Cloudflare API token in place -- see cloudflare-credentials.ini.example
#      for how to create a zone-scoped token and where to put it.
#
# Usage: sudo ./deploy/certbot/setup-wildcard-cert.sh
set -euo pipefail

CRED_FILE="/etc/letsencrypt/cloudflare.ini"
CERT_NAME="vahinitech-wildcard"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "[setup] certbot not found. Install it first." >&2
  exit 1
fi

if ! certbot plugins 2>/dev/null | grep -q dns-cloudflare; then
  echo "[setup] certbot-dns-cloudflare plugin not found." >&2
  echo "[setup] Install it, e.g.: apt install python3-certbot-dns-cloudflare" >&2
  exit 1
fi

if [[ ! -f "${CRED_FILE}" ]]; then
  echo "[setup] ${CRED_FILE} not found." >&2
  echo "[setup] Copy deploy/certbot/cloudflare-credentials.ini.example there," >&2
  echo "[setup] fill in a zone-scoped Cloudflare API token, and chmod 600 it." >&2
  exit 1
fi

perms="$(stat -c '%a' "${CRED_FILE}")"
if [[ "${perms}" != "600" ]]; then
  echo "[setup] ERROR: ${CRED_FILE} must be mode 600 (currently ${perms})." >&2
  echo "[setup] Run: chmod 600 ${CRED_FILE}" >&2
  exit 1
fi

echo "[setup] requesting wildcard + apex cert (cert-name: ${CERT_NAME})"
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials "${CRED_FILE}" \
  --cert-name "${CERT_NAME}" \
  -d vahinitech.com \
  -d '*.vahinitech.com'

echo "[setup] done. Cert lives at /etc/letsencrypt/live/${CERT_NAME}/"
echo "[setup] Point deploy/snippets/tls-vahinitech.conf's ssl_certificate paths"
echo "[setup] at that lineage (already done if you're using the version from"
echo "[setup] this repo) and reload nginx once to pick it up the first time:"
echo "[setup]   nginx -t && systemctl reload nginx"
echo "[setup]"
echo "[setup] Going forward, 'certbot renew' (already scheduled by certbot's"
echo "[setup] own timer/cron) renews this via the same Cloudflare API -- no"
echo "[setup] further action needed, including for new subdomains added later."
echo "[setup]"
echo "[setup] The old per-domain certs (vahinitech.com, stage.vahinitech.com,"
echo "[setup] api.vahinitech.com if issued) are now superseded. They'll keep"
echo "[setup] trying to renew until removed; once you've confirmed the"
echo "[setup] wildcard cert is serving correctly, retire them with:"
echo "[setup]   certbot certificates          # list what's tracked"
echo "[setup]   certbot delete --cert-name <name>"
