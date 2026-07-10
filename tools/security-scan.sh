#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
#
# External security posture scan: open ports (nmap) + TLS configuration
# (testssl.sh) against a host we operate. Intended for periodic checks and
# post-deploy verification -- complements the in-config hardening
# (docs/SECURITY.md) by confirming from the outside that only the expected
# ports answer and the TLS grade holds.
#
#   tools/security-scan.sh vahinitech.com
#   tools/security-scan.sh stag.vahinitech.com --quick
#   make security-scan HOST=vahinitech.com
#
# AUTHORIZED TARGETS ONLY. Port-scanning or TLS-probing infrastructure you
# do not own or have written permission to test may be illegal. This script
# refuses to run unless the target matches an allowlist (VAHINI_SCAN_ALLOW,
# default *.vahinitech.com + vahinitech.com) or --i-have-authorization is
# passed for a one-off authorized engagement.
set -euo pipefail

HOST="${1:-}"
QUICK=0
FORCE_AUTH=0
shift || true
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --i-have-authorization) FORCE_AUTH=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ -z "$HOST" ]; then
  echo "usage: $0 <host> [--quick] [--i-have-authorization]" >&2
  exit 2
fi

# ---- Authorization gate ----------------------------------------------------
ALLOW="${VAHINI_SCAN_ALLOW:-vahinitech.com}"
authorized=0
if [ "$FORCE_AUTH" = "1" ]; then
  authorized=1
else
  # match exact domain or any subdomain of an allowlisted domain
  IFS=',' read -ra DOMAINS <<< "$ALLOW"
  for d in "${DOMAINS[@]}"; do
    d="$(echo "$d" | xargs)"  # trim
    [ -z "$d" ] && continue
    if [ "$HOST" = "$d" ] || [[ "$HOST" == *".$d" ]]; then authorized=1; fi
  done
fi
if [ "$authorized" != "1" ]; then
  echo "REFUSING: '$HOST' is not in the authorized allowlist ($ALLOW)." >&2
  echo "Scan only hosts you operate. For a one-off authorized target set" >&2
  echo "VAHINI_SCAN_ALLOW or pass --i-have-authorization." >&2
  exit 3
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${VAHINI_SCAN_OUT:-scan-reports}"
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/scan-${HOST}-${TS}.txt"

log() { echo "$@" | tee -a "$REPORT"; }

log "# Vahini external security scan"
log "host:   $HOST"
log "when:   $TS"
log "mode:   $([ "$QUICK" = 1 ] && echo quick || echo full)"
log ""

problems=0

# ---- 1. Open ports (nmap) --------------------------------------------------
# Expectation for the marketing/API hosts: only 80 (ACME + redirect) and 443
# should answer. Anything else (SSH exposed to the world, a stray database
# port, a debug server) is a finding.
log "## Open ports (nmap)"
if command -v nmap >/dev/null 2>&1; then
  if [ "$QUICK" = 1 ]; then
    PORTSPEC="-F"          # nmap's ~100 most common ports
  else
    PORTSPEC="-p-"         # all 65535 -- catches stray high ports
  fi
  # -Pn: don't ping-gate (many hosts drop ICMP); -sT: TCP connect (no root);
  # --open: only report what's actually listening.
  nmap -Pn -sT --open $PORTSPEC "$HOST" 2>&1 | tee -a "$REPORT" || true
  # Flag anything open beyond 80/443.
  UNEXPECTED="$(nmap -Pn -sT --open $PORTSPEC "$HOST" 2>/dev/null \
    | awk '/^[0-9]+\/tcp/ {split($1,a,"/"); if (a[1]!=80 && a[1]!=443) print a[1]}' || true)"
  if [ -n "$UNEXPECTED" ]; then
    log ""
    log "  FINDING: unexpected open port(s): $(echo $UNEXPECTED | tr '\n' ' ')"
    log "  Only 80 and 443 are expected to be internet-facing."
    problems=$((problems+1))
  else
    log ""
    log "  ok: only expected web ports answer (or host filtered)."
  fi
else
  log "  SKIP: nmap not installed."
  log "    Debian/Ubuntu: sudo apt-get install -y nmap"
  log "    macOS:         brew install nmap"
fi
log ""

# ---- 2. TLS configuration (testssl.sh) -------------------------------------
# Confirms from the outside what deploy/snippets/tls-vahinitech.conf sets:
# TLS 1.2/1.3 only, forward-secret AEAD ciphers, HSTS, no known protocol bugs.
log "## TLS configuration (testssl.sh)"
TESTSSL_BIN=""
if command -v testssl.sh >/dev/null 2>&1; then
  TESTSSL_BIN="testssl.sh"
elif command -v testssl >/dev/null 2>&1; then
  TESTSSL_BIN="testssl"
elif [ -x "${TESTSSL_HOME:-}/testssl.sh" ]; then
  TESTSSL_BIN="${TESTSSL_HOME}/testssl.sh"
fi

if [ -n "$TESTSSL_BIN" ]; then
  # --severity LOW surfaces everything down to low findings; --hints adds
  # remediation notes. Non-intrusive by default (no DoS/vuln exploitation).
  TSSL_ARGS="--quiet --color 0 --severity LOW"
  if [ "$QUICK" = 1 ]; then
    TSSL_ARGS="$TSSL_ARGS --protocols --headers --heartbleed --ccs --renegotiation"
  fi
  "$TESTSSL_BIN" $TSSL_ARGS "$HOST:443" 2>&1 | tee -a "$REPORT" || true
  # testssl marks serious findings with severity tags; count HIGH/CRITICAL.
  HITS="$("$TESTSSL_BIN" $TSSL_ARGS "$HOST:443" 2>/dev/null | grep -icE '\b(HIGH|CRITICAL)\b' || true)"
  if [ "${HITS:-0}" -gt 0 ]; then
    log ""
    log "  FINDING: testssl reported $HITS HIGH/CRITICAL item(s) -- review above."
    problems=$((problems+1))
  fi
else
  log "  SKIP: testssl.sh not installed."
  log "    git clone --depth 1 https://github.com/testssl/testssl.sh"
  log "    then: TESTSSL_HOME=./testssl.sh tools/security-scan.sh $HOST"
fi
log ""

# ---- 3. Security headers (quick curl cross-check) --------------------------
# testssl checks headers too, but this works even when testssl is absent and
# gives a fast, readable pass/fail on the headers we set in nginx.
log "## Security headers (curl)"
if command -v curl >/dev/null 2>&1; then
  HDRS="$(curl -sS -D - -o /dev/null --max-time 15 "https://$HOST/" 2>/dev/null || true)"
  for h in "strict-transport-security" "content-security-policy" \
           "x-content-type-options" "x-frame-options" "referrer-policy"; do
    if echo "$HDRS" | grep -iq "^$h:"; then
      log "  ok:      $h present"
    else
      log "  MISSING: $h"
      problems=$((problems+1))
    fi
  done
  if echo "$HDRS" | grep -iq "^server: .*[0-9]\+\.[0-9]"; then
    log "  FINDING: Server header leaks a version number"
    problems=$((problems+1))
  fi
else
  log "  SKIP: curl not installed."
fi
log ""

log "## Summary"
if [ "$problems" -eq 0 ]; then
  log "PASS: no findings. Report: $REPORT"
  exit 0
fi
log "ATTENTION: $problems finding(s). Review the report: $REPORT"
exit 1
