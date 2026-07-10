#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
#
# Diagnostic only -- checks whether something on this host is actually
# scheduled to run `certbot renew` periodically. Fixes nothing; tells you
# what to fix if the answer is "nothing".
set -uo pipefail

found=0

if command -v systemctl >/dev/null 2>&1; then
  for unit in certbot.timer snap.certbot.renew.timer; do
    if systemctl list-timers --all 2>/dev/null | grep -q "$unit"; then
      echo "[check] systemd timer active: $unit"
      systemctl list-timers --all 2>/dev/null | grep "$unit"
      found=1
    fi
  done
fi

for f in /etc/cron.d/certbot /etc/cron.daily/certbot; do
  if [[ -e "$f" ]]; then
    echo "[check] cron entry present: $f"
    found=1
  fi
done

if [[ $found -eq 0 ]]; then
  echo "[check] NOTHING found scheduling 'certbot renew' automatically on this host." >&2
  echo "[check] certbot itself normally installs this when you 'apt install certbot' or" >&2
  echo "[check] 'snap install certbot' -- if it's missing, reinstall certbot via one of" >&2
  echo "[check] those, or add your own systemd timer / cron entry running:" >&2
  echo "[check]   certbot renew --quiet" >&2
  exit 1
fi

echo "[check] renewal-hooks/deploy scripts (run after every real renewal):"
ls -la /etc/letsencrypt/renewal-hooks/deploy/ 2>/dev/null || echo "  (none found -- see deploy/certbot/install-renew-hook.sh)"

echo "[check] certificates currently tracked by certbot:"
certbot certificates 2>/dev/null || echo "  (certbot not found on PATH)"
