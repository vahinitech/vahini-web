#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
#
# One-time setup on the vahinitech.com host: wires up automatic HTTPS
# certificate renewal for vahinitech.com / www.vahinitech.com / stag.vahinitech.com.
#
# This does NOT set up a new cron job or systemd timer -- if certbot was
# installed via apt/snap (the normal way, and how the current cert under
# /etc/letsencrypt/live/vahinitech.com/ was almost certainly issued), it
# already ships its own systemd timer or /etc/cron.d entry that runs
# `certbot renew` twice a day and only actually renews certs inside their
# last 30 days of validity. Run `deploy/certbot/check-renew-timer.sh` to
# confirm that's active on this host.
#
# What this script adds is the ONE commonly-missing piece: a deploy-hook so
# nginx actually reloads (and starts serving the new cert) right after a
# renewal, instead of silently keeping the old one loaded until the next
# manual restart.
#
# Usage: sudo ./deploy/certbot/install-renew-hook.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo), it needs to write to /etc/letsencrypt and /var/www." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_DST="/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"
WEBROOT="/var/www/certbot"

if ! command -v certbot >/dev/null 2>&1; then
  echo "[install] certbot not found. Install it first, e.g.:" >&2
  echo "  apt update && apt install -y certbot" >&2
  exit 1
fi

echo "[install] webroot for HTTP-01 challenges: ${WEBROOT}"
mkdir -p "${WEBROOT}"

echo "[install] installing nginx-reload deploy-hook -> ${HOOK_DST}"
mkdir -p "$(dirname "${HOOK_DST}")"
install -m 0755 "${SCRIPT_DIR}/reload-nginx-hook.sh" "${HOOK_DST}"

echo "[install] verifying with a dry run (does not touch real certs or hit rate limits)"
certbot renew --dry-run

echo "[install] done. Auto-renewal now reloads nginx automatically on every real renewal."
echo "[install] Sanity-check the OS-level renewal schedule with: deploy/certbot/check-renew-timer.sh"
