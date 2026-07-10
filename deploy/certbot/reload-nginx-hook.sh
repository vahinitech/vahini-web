#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
#
# Certbot deploy-hook: reloads the host nginx after a certificate renewal so
# the new fullchain.pem/privkey.pem are actually picked up. Without this,
# certbot happily renews the files on disk but the running nginx worker keeps
# serving the OLD (soon-to-expire) certificate until nginx is next restarted.
#
# Install once (see deploy/certbot/install-renew-hook.sh, or by hand):
#   cp deploy/certbot/reload-nginx-hook.sh /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
#   chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
#
# Certbot runs every executable script in renewal-hooks/deploy/ after ANY
# certificate in /etc/letsencrypt/ successfully renews (RENEWED_DOMAINS /
# RENEWED_LINEAGE env vars are set by certbot but unused here -- we just
# reload nginx once, which is enough regardless of which domain renewed).
set -euo pipefail

echo "[certbot deploy-hook] renewed: ${RENEWED_LINEAGE:-unknown}"

if ! nginx -t; then
  echo "[certbot deploy-hook] ERROR: 'nginx -t' failed -- NOT reloading a possibly-broken config." >&2
  echo "[certbot deploy-hook] The new certificate is on disk but nginx still serves the old one until this is fixed." >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
  systemctl reload nginx
else
  nginx -s reload
fi

echo "[certbot deploy-hook] nginx reloaded successfully."
