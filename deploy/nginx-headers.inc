# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
#
# Shared browser-security response headers. Installed at
# /etc/nginx/vahini-headers.inc and included by deploy/nginx.conf -- once at
# server level, and again inside any location that sets its own add_header
# (nginx add_header in a location cancels ALL inherited add_headers, so each
# such location must re-include this file or it silently loses these).
# HSTS is intentionally not here: it belongs at the TLS edge
# (deploy/snippets/tls-vahinitech.conf) where the scheme is known.

add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options SAMEORIGIN always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Content-Security-Policy $vahini_csp always;
